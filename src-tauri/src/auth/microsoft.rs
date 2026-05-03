use crate::error::LauncherError;
use serde::{Deserialize, Serialize};

/// Microsoft OAuth2 Device Code Flow for Minecraft authentication.
///
/// Flow:
/// 1. Request device code from Microsoft
/// 2. User opens browser, enters code at microsoft.com/link
/// 3. Poll for token completion
/// 4. Exchange MS token for Xbox Live token
/// 5. Exchange Xbox Live token for XSTS token
/// 6. Exchange XSTS token for Minecraft access token
/// 7. Fetch Minecraft profile (username, UUID, skin)
///
/// Uses the public client ID that other launchers use (no client secret needed).

// Azure AD app client ID for public MC launchers
// This is the same client ID used by Prism Launcher and other open-source launchers
const CLIENT_ID: &str = "c36a9fb6-4f2a-41ff-9ce8-d3ef388ea6c5";
const DEVICE_CODE_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode";
const TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const XBOX_AUTH_URL: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_AUTH_URL: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MC_AUTH_URL: &str = "https://api.minecraftservices.com/authentication/login_with_xbox";
const MC_PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";
const MC_OWNERSHIP_URL: &str = "https://api.minecraftservices.com/entitlements/mcstore";

/// Stored account info (persisted to disk).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MinecraftAccount {
    pub username: String,
    pub uuid: String,
    pub access_token: String,
    pub refresh_token: String,
    pub skin_url: Option<String>,
    pub token_expiry: i64,  // unix timestamp
}

/// Device code response — shown to user.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeviceCodeInfo {
    pub user_code: String,
    pub verification_uri: String,
    pub message: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    message: String,
    expires_in: u64,
    interval: u64,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
    #[serde(default)]
    error: Option<String>,
}

#[derive(Deserialize)]
struct XboxResponse {
    #[serde(rename = "Token")]
    token: String,
    #[serde(rename = "DisplayClaims")]
    display_claims: XboxDisplayClaims,
}

#[derive(Deserialize)]
struct XboxDisplayClaims {
    xui: Vec<XboxXui>,
}

#[derive(Deserialize)]
struct XboxXui {
    uhs: String,
}

#[derive(Deserialize)]
struct McAuthResponse {
    access_token: String,
    expires_in: u64,
}

#[derive(Deserialize)]
struct McProfile {
    id: String,
    name: String,
    skins: Option<Vec<McSkin>>,
}

#[derive(Deserialize)]
struct McSkin {
    url: String,
}

/// Step 1: Request a device code for the user to enter.
pub async fn request_device_code(client: &reqwest::Client) -> Result<(String, DeviceCodeInfo), LauncherError> {
    let response: DeviceCodeResponse = client
        .post(DEVICE_CODE_URL)
        .form(&[
            ("client_id", CLIENT_ID),
            ("scope", "XboxLive.signin offline_access"),
        ])
        .send().await?
        .json().await?;

    let info = DeviceCodeInfo {
        user_code: response.user_code.clone(),
        verification_uri: response.verification_uri.clone(),
        message: response.message.clone(),
        expires_in: response.expires_in,
        interval: response.interval,
    };

    Ok((response.device_code, info))
}

/// Step 2: Poll for token (called repeatedly until success or expiry).
pub async fn poll_for_token(
    client: &reqwest::Client,
    device_code: &str,
) -> Result<Option<(String, String)>, LauncherError> {
    let response = client
        .post(TOKEN_URL)
        .form(&[
            ("client_id", CLIENT_ID),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ("device_code", device_code),
        ])
        .send().await?
        .text().await?;

    let token: TokenResponse = serde_json::from_str(&response)
        .map_err(|e| LauncherError::Other(format!("Token parse error: {}", e)))?;

    if let Some(ref error) = token.error {
        if error == "authorization_pending" {
            return Ok(None); // Still waiting
        }
        return Err(LauncherError::Other(format!("Auth error: {}", error)));
    }

    let refresh = token.refresh_token.unwrap_or_default();
    Ok(Some((token.access_token, refresh)))
}

/// Step 3: Refresh an existing token without user interaction.
pub async fn refresh_token(
    client: &reqwest::Client,
    refresh_token: &str,
) -> Result<(String, String), LauncherError> {
    let token: TokenResponse = client
        .post(TOKEN_URL)
        .form(&[
            ("client_id", CLIENT_ID),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
        ])
        .send().await?
        .json().await?;

    if let Some(ref error) = token.error {
        return Err(LauncherError::Other(format!("Refresh error: {}", error)));
    }

    Ok((token.access_token, token.refresh_token.unwrap_or_default()))
}

/// Steps 4-7: Exchange MS token through the full chain to get MC access token + profile.
pub async fn authenticate_minecraft(
    client: &reqwest::Client,
    ms_access_token: &str,
    ms_refresh_token: &str,
) -> Result<MinecraftAccount, LauncherError> {
    // Step 4: Xbox Live
    let xbox: XboxResponse = client
        .post(XBOX_AUTH_URL)
        .json(&serde_json::json!({
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": format!("d={}", ms_access_token),
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT"
        }))
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .send().await?
        .json().await?;

    let uhs = xbox.display_claims.xui.first()
        .map(|x| x.uhs.clone())
        .unwrap_or_default();

    // Step 5: XSTS
    let xsts: XboxResponse = client
        .post(XSTS_AUTH_URL)
        .json(&serde_json::json!({
            "Properties": {
                "SandboxId": "RETAIL",
                "UserTokens": [xbox.token],
            },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT"
        }))
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .send().await?
        .json().await?;

    // Step 6: Minecraft auth
    let mc_auth: McAuthResponse = client
        .post(MC_AUTH_URL)
        .json(&serde_json::json!({
            "identityToken": format!("XBL3.0 x={};{}", uhs, xsts.token),
        }))
        .send().await?
        .json().await?;

    // Step 7: Minecraft profile
    let profile: McProfile = client
        .get(MC_PROFILE_URL)
        .header("Authorization", format!("Bearer {}", mc_auth.access_token))
        .send().await?
        .json().await?;

    let skin_url = profile.skins
        .and_then(|skins| skins.first().map(|s| s.url.clone()));

    let expiry = chrono::Utc::now().timestamp() + mc_auth.expires_in as i64;

    Ok(MinecraftAccount {
        username: profile.name,
        uuid: profile.id,
        access_token: mc_auth.access_token,
        refresh_token: ms_refresh_token.to_string(),
        skin_url,
        token_expiry: expiry,
    })
}

/// Checks if a stored account's token is still valid (not expired).
pub fn is_token_valid(account: &MinecraftAccount) -> bool {
    let now = chrono::Utc::now().timestamp();
    account.token_expiry > now + 300 // 5 minute buffer
}

/// Saves account to disk.
pub fn save_account(data_dir: &std::path::Path, account: &MinecraftAccount) -> Result<(), LauncherError> {
    let path = data_dir.join("account.json");
    let json = serde_json::to_string_pretty(account)?;
    std::fs::write(&path, json)?;
    Ok(())
}

/// Loads account from disk.
pub fn load_account(data_dir: &std::path::Path) -> Option<MinecraftAccount> {
    let path = data_dir.join("account.json");
    if !path.exists() { return None; }
    let json = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&json).ok()
}

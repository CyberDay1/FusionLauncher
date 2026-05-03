use crate::error::LauncherError;
use serde::{Deserialize, Serialize};

/// Microsoft OAuth2 Device Code Flow for Minecraft authentication.
///
/// Flow:
/// 1. Request device code — user gets a code to enter at microsoft.com/link
/// 2. Poll for token completion
/// 3. Exchange MS token for Xbox Live token
/// 4. Exchange Xbox Live token for XSTS token
/// 5. Exchange XSTS token for Minecraft access token
/// 6. Fetch Minecraft profile (username, UUID, skin)

// Fusion Launcher's own Azure AD app (supports device code flow for consumers)
const CLIENT_ID: &str = "f39fb407-b7f5-43f0-9901-e09b9385c630";
const DEVICE_CODE_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode";
const TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const XBOX_AUTH_URL: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_AUTH_URL: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MC_AUTH_URL: &str = "https://api.minecraftservices.com/authentication/login_with_xbox";
const MC_PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MinecraftAccount {
    pub username: String,
    pub uuid: String,
    pub access_token: String,
    pub refresh_token: String,
    pub skin_url: Option<String>,
    pub token_expiry: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeviceCodeInfo {
    pub user_code: String,
    pub verification_uri: String,
    pub message: String,
    pub interval: u64,
}

#[derive(Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    message: String,
    interval: u64,
}

#[derive(Deserialize)]
struct TokenResponse {
    #[serde(default)]
    access_token: Option<String>,
    #[serde(default)]
    refresh_token: Option<String>,
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

// Store device code between start and poll
static DEVICE_CODE: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

/// Step 1: Request device code.
pub async fn request_device_code(client: &reqwest::Client) -> Result<DeviceCodeInfo, LauncherError> {
    let body = client
        .post(DEVICE_CODE_URL)
        .form(&[
            ("client_id", CLIENT_ID),
            ("scope", "XboxLive.signin offline_access"),
        ])
        .send().await?
        .text().await?;

    let response: DeviceCodeResponse = serde_json::from_str(&body)
        .map_err(|e| LauncherError::Other(format!("Device code failed: {} — {}", e, &body[..body.len().min(200)])))?;

    *DEVICE_CODE.lock().unwrap() = Some(response.device_code);

    Ok(DeviceCodeInfo {
        user_code: response.user_code,
        verification_uri: response.verification_uri,
        message: response.message,
        interval: response.interval,
    })
}

/// Step 2: Poll for token (returns None if still waiting).
pub async fn poll_for_token(client: &reqwest::Client) -> Result<Option<(String, String)>, LauncherError> {
    let device_code = DEVICE_CODE.lock().unwrap().clone()
        .ok_or_else(|| LauncherError::Other("No device code — call start first".to_string()))?;

    let body = client
        .post(TOKEN_URL)
        .form(&[
            ("client_id", CLIENT_ID),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ("device_code", &device_code),
        ])
        .send().await?
        .text().await?;

    let token: TokenResponse = serde_json::from_str(&body)
        .map_err(|e| LauncherError::Other(format!("Token parse: {} — {}", e, &body[..body.len().min(200)])))?;

    if let Some(ref error) = token.error {
        if error == "authorization_pending" {
            return Ok(None);
        }
        if error == "slow_down" {
            return Ok(None);
        }
        return Err(LauncherError::Other(format!("Auth error: {}", error)));
    }

    match token.access_token {
        Some(at) => {
            *DEVICE_CODE.lock().unwrap() = None;
            Ok(Some((at, token.refresh_token.unwrap_or_default())))
        }
        None => Ok(None),
    }
}

/// Steps 3-6: Full auth chain MS -> Xbox -> XSTS -> MC -> Profile
pub async fn authenticate_minecraft(
    client: &reqwest::Client,
    ms_access_token: &str,
    ms_refresh_token: &str,
) -> Result<MinecraftAccount, LauncherError> {
    // Xbox Live
    let xbox_body = client
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
        .send().await?.text().await?;

    let xbox: XboxResponse = serde_json::from_str(&xbox_body)
        .map_err(|e| LauncherError::Other(format!("Xbox auth failed: {} — {}", e, &xbox_body[..xbox_body.len().min(300)])))?;

    let uhs = xbox.display_claims.xui.first().map(|x| x.uhs.clone()).unwrap_or_default();

    // XSTS
    let xsts_body = client
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
        .send().await?.text().await?;

    let xsts: XboxResponse = serde_json::from_str(&xsts_body)
        .map_err(|e| LauncherError::Other(format!("XSTS failed: {} — {}", e, &xsts_body[..xsts_body.len().min(300)])))?;

    // Minecraft
    let mc_body = client
        .post(MC_AUTH_URL)
        .json(&serde_json::json!({
            "identityToken": format!("XBL3.0 x={};{}", uhs, xsts.token),
        }))
        .send().await?.text().await?;

    let mc_auth: McAuthResponse = serde_json::from_str(&mc_body)
        .map_err(|e| LauncherError::Other(format!("MC auth failed: {} — {}", e, &mc_body[..mc_body.len().min(300)])))?;

    // Profile
    let profile_body = client
        .get(MC_PROFILE_URL)
        .header("Authorization", format!("Bearer {}", mc_auth.access_token))
        .send().await?.text().await?;

    let profile: McProfile = serde_json::from_str(&profile_body)
        .map_err(|e| LauncherError::Other(format!("Profile failed: {} — {}", e, &profile_body[..profile_body.len().min(300)])))?;

    let skin_url = profile.skins.and_then(|s| s.first().map(|s| s.url.clone()));

    Ok(MinecraftAccount {
        username: profile.name,
        uuid: profile.id,
        access_token: mc_auth.access_token,
        refresh_token: ms_refresh_token.to_string(),
        skin_url,
        token_expiry: chrono::Utc::now().timestamp() + mc_auth.expires_in as i64,
    })
}

/// Refresh token
pub async fn refresh_token(
    client: &reqwest::Client,
    refresh_tok: &str,
) -> Result<(String, String), LauncherError> {
    let body = client
        .post(TOKEN_URL)
        .form(&[
            ("client_id", CLIENT_ID),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_tok),
        ])
        .send().await?.text().await?;

    let token: TokenResponse = serde_json::from_str(&body)
        .map_err(|e| LauncherError::Other(format!("Refresh parse: {}", e)))?;

    if let Some(ref err) = token.error {
        return Err(LauncherError::Other(format!("Refresh error: {}", err)));
    }

    Ok((
        token.access_token.unwrap_or_default(),
        token.refresh_token.unwrap_or_default(),
    ))
}

pub fn is_token_valid(account: &MinecraftAccount) -> bool {
    chrono::Utc::now().timestamp() < account.token_expiry - 300
}

pub fn save_account(data_dir: &std::path::Path, account: &MinecraftAccount) -> Result<(), LauncherError> {
    std::fs::write(data_dir.join("account.json"), serde_json::to_string_pretty(account)?)?;
    Ok(())
}

pub fn load_account(data_dir: &std::path::Path) -> Option<MinecraftAccount> {
    let path = data_dir.join("account.json");
    if !path.exists() { return None; }
    std::fs::read_to_string(&path).ok().and_then(|s| serde_json::from_str(&s).ok())
}

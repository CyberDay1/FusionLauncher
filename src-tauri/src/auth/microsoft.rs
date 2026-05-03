use crate::error::LauncherError;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, Write};
use std::net::TcpListener;

/// Microsoft OAuth2 Authorization Code Flow with localhost redirect.
///
/// Flow:
/// 1. Start a local HTTP server on a random port
/// 2. Open browser to Microsoft login with redirect_uri=http://localhost:PORT
/// 3. User signs in, Microsoft redirects to localhost with auth code
/// 4. Exchange auth code for MS access token
/// 5. Exchange MS token for Xbox Live token
/// 6. Exchange Xbox Live token for XSTS token
/// 7. Exchange XSTS token for Minecraft access token
/// 8. Fetch Minecraft profile (username, UUID, skin)

// Fusion Launcher Azure AD app — registered for personal Microsoft accounts
const CLIENT_ID: &str = "f39fb407-b7f5-43f0-9901-e09b9385c630";
const AUTH_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
const TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const XBOX_AUTH_URL: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_AUTH_URL: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MC_AUTH_URL: &str = "https://api.minecraftservices.com/authentication/login_with_xbox";
const MC_PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";

/// Stored account info (persisted to disk).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MinecraftAccount {
    pub username: String,
    pub uuid: String,
    pub access_token: String,
    pub refresh_token: String,
    pub skin_url: Option<String>,
    pub token_expiry: i64,
}

/// Info returned to frontend when starting login.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LoginStartInfo {
    pub auth_url: String,
    pub port: u16,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    error_description: Option<String>,
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

// Store the listener between start_login and wait_for_callback
static PENDING_LISTENER: std::sync::Mutex<Option<TcpListener>> = std::sync::Mutex::new(None);

/// Starts the OAuth login flow. Returns the URL to open in browser and the
/// local port the callback server is listening on.
pub fn start_login() -> Result<LoginStartInfo, LauncherError> {
    // Bind to a random available port
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();

    let redirect_uri = format!("http://localhost:{}", port);
    let auth_url = format!(
        "{}?client_id={}&response_type=code&redirect_uri={}&scope={}&prompt=select_account",
        AUTH_URL, CLIENT_ID,
        urlencoding(&redirect_uri),
        urlencoding("XboxLive.signin offline_access"),
    );

    // Store the listener for wait_for_callback to pick up
    *PENDING_LISTENER.lock().unwrap() = Some(listener);

    Ok(LoginStartInfo { auth_url, port })
}

/// Waits for the OAuth callback on the stored listener and completes the full auth chain.
pub async fn wait_for_callback(
    client: &reqwest::Client,
    port: u16,
) -> Result<MinecraftAccount, LauncherError> {
    let redirect_uri = format!("http://localhost:{}", port);

    // Take the listener from the stored state
    let listener = PENDING_LISTENER.lock().unwrap().take()
        .ok_or_else(|| LauncherError::Other("No pending login — call start_ms_login first".to_string()))?;

    let (mut stream, _) = listener.accept()?;

    // Read the HTTP request
    let mut reader = std::io::BufReader::new(&stream);
    let mut request_line = String::new();
    reader.read_line(&mut request_line)?;

    // Extract the authorization code from the query string
    // GET /?code=XXXX&... HTTP/1.1
    let code = request_line
        .split_whitespace()
        .nth(1)
        .and_then(|path| {
            path.split('?').nth(1)
        })
        .and_then(|query| {
            query.split('&')
                .find(|p| p.starts_with("code="))
                .map(|p| p.strip_prefix("code=").unwrap().to_string())
        })
        .ok_or_else(|| LauncherError::Other("No auth code in callback".to_string()))?;

    // Send a response to the browser
    let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n\
        <html><body style='background:#111;color:#fff;font-family:sans-serif;text-align:center;padding:60px'>\
        <h2>Login successful!</h2><p>You can close this tab and return to Fusion Launcher.</p>\
        </body></html>";
    stream.write_all(response.as_bytes())?;
    drop(stream);
    drop(listener);

    // Exchange code for tokens
    let token = exchange_code(client, &code, &redirect_uri).await?;
    let refresh = token.1;
    let ms_token = token.0;

    // Full auth chain: MS -> Xbox -> XSTS -> MC
    authenticate_minecraft(client, &ms_token, &refresh).await
}

async fn exchange_code(
    client: &reqwest::Client,
    code: &str,
    redirect_uri: &str,
) -> Result<(String, String), LauncherError> {
    let resp = client
        .post(TOKEN_URL)
        .form(&[
            ("client_id", CLIENT_ID),
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", redirect_uri),
        ])
        .send().await?
        .text().await?;

    let token: TokenResponse = serde_json::from_str(&resp)
        .map_err(|e| LauncherError::Other(format!("Token parse: {} — body: {}", e, &resp[..resp.len().min(200)])))?;

    if let Some(ref err) = token.error {
        let desc = token.error_description.as_deref().unwrap_or("");
        return Err(LauncherError::Other(format!("Auth error: {} — {}", err, desc)));
    }

    Ok((token.access_token, token.refresh_token.unwrap_or_default()))
}

/// Refreshes an existing token.
pub async fn refresh_token(
    client: &reqwest::Client,
    refresh_token: &str,
) -> Result<(String, String), LauncherError> {
    let resp = client
        .post(TOKEN_URL)
        .form(&[
            ("client_id", CLIENT_ID),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
        ])
        .send().await?
        .text().await?;

    let token: TokenResponse = serde_json::from_str(&resp)
        .map_err(|e| LauncherError::Other(format!("Refresh parse: {}", e)))?;

    if let Some(ref err) = token.error {
        return Err(LauncherError::Other(format!("Refresh error: {}", err)));
    }

    Ok((token.access_token, token.refresh_token.unwrap_or_default()))
}

/// Exchange MS token through Xbox -> XSTS -> MC to get a Minecraft account.
pub async fn authenticate_minecraft(
    client: &reqwest::Client,
    ms_access_token: &str,
    ms_refresh_token: &str,
) -> Result<MinecraftAccount, LauncherError> {
    // Xbox Live
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
        .map(|x| x.uhs.clone()).unwrap_or_default();

    // XSTS
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

    // Minecraft
    let mc_auth: McAuthResponse = client
        .post(MC_AUTH_URL)
        .json(&serde_json::json!({
            "identityToken": format!("XBL3.0 x={};{}", uhs, xsts.token),
        }))
        .send().await?
        .json().await?;

    // Profile
    let profile: McProfile = client
        .get(MC_PROFILE_URL)
        .header("Authorization", format!("Bearer {}", mc_auth.access_token))
        .send().await?
        .json().await?;

    let skin_url = profile.skins.and_then(|s| s.first().map(|s| s.url.clone()));
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

pub fn is_token_valid(account: &MinecraftAccount) -> bool {
    chrono::Utc::now().timestamp() < account.token_expiry - 300
}

pub fn save_account(data_dir: &std::path::Path, account: &MinecraftAccount) -> Result<(), LauncherError> {
    let json = serde_json::to_string_pretty(account)?;
    std::fs::write(data_dir.join("account.json"), json)?;
    Ok(())
}

pub fn load_account(data_dir: &std::path::Path) -> Option<MinecraftAccount> {
    let path = data_dir.join("account.json");
    if !path.exists() { return None; }
    std::fs::read_to_string(&path).ok()
        .and_then(|s| serde_json::from_str(&s).ok())
}

fn urlencoding(s: &str) -> String {
    s.replace(':', "%3A").replace('/', "%2F").replace(' ', "+")
}

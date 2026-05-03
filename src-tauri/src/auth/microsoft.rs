use crate::error::LauncherError;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, Write};
use std::net::TcpListener;

/// Microsoft OAuth2 Auth Code Flow with localhost redirect for Minecraft.
///
/// Uses Prism Launcher's client ID (pre-registered with Xbox/MC services).
/// Uses Fusion Launcher's own Azure app with auth code flow.
/// Xbox/XSTS auth works. MC services may reject unregistered apps —
/// in that case we fall back to Xbox profile as the identity.

const CLIENT_ID: &str = "f39fb407-b7f5-43f0-9901-e09b9385c630";
const AUTH_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
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

/// Info returned to start the login — contains URL to open and port to listen on.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeviceCodeInfo {
    pub user_code: String,
    pub verification_uri: String,
    pub message: String,
    pub interval: u64,
}

#[derive(Deserialize)] struct TokenResponse { #[serde(default)] access_token: Option<String>, #[serde(default)] refresh_token: Option<String>, #[serde(default)] error: Option<String>, #[serde(default)] error_description: Option<String> }
#[derive(Deserialize)] struct XboxResponse { #[serde(rename="Token")] token: String, #[serde(rename="DisplayClaims")] display_claims: XboxDisplayClaims }
#[derive(Deserialize)] struct XboxDisplayClaims { xui: Vec<XboxXui> }
#[derive(Deserialize)] struct XboxXui { uhs: String }
#[derive(Deserialize)] struct McAuthResponse { access_token: String, expires_in: u64 }
#[derive(Deserialize)] struct McProfile { id: String, name: String, skins: Option<Vec<McSkin>> }
#[derive(Deserialize)] struct McSkin { url: String }

static PENDING_LISTENER: std::sync::Mutex<Option<TcpListener>> = std::sync::Mutex::new(None);
static PENDING_PORT: std::sync::Mutex<u16> = std::sync::Mutex::new(0);

/// Start login: bind localhost, return auth URL as DeviceCodeInfo (reusing the struct).
pub async fn request_device_code(_client: &reqwest::Client) -> Result<DeviceCodeInfo, LauncherError> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();

    let redirect_uri = format!("http://localhost:{}", port);
    let auth_url = format!(
        "{}?client_id={}&response_type=code&redirect_uri={}&scope={}&prompt=select_account",
        AUTH_URL, CLIENT_ID,
        urlenc(&redirect_uri),
        urlenc("XboxLive.signin offline_access"),
    );

    *PENDING_LISTENER.lock().unwrap() = Some(listener);
    *PENDING_PORT.lock().unwrap() = port;

    Ok(DeviceCodeInfo {
        user_code: String::new(), // Not used in auth code flow
        verification_uri: auth_url, // The URL to open
        message: "Complete login in your browser".to_string(),
        interval: 0,
    })
}

/// Poll: actually waits for the localhost callback and completes the full chain.
pub async fn poll_for_token(client: &reqwest::Client) -> Result<Option<(String, String)>, LauncherError> {
    let listener = PENDING_LISTENER.lock().unwrap().take()
        .ok_or_else(|| LauncherError::Other("No pending login".to_string()))?;
    let port = *PENDING_PORT.lock().unwrap();
    let redirect_uri = format!("http://localhost:{}", port);

    // Wait for callback (blocks until browser redirects)
    let (mut stream, _) = listener.accept()?;

    let mut reader = std::io::BufReader::new(&stream);
    let mut request_line = String::new();
    reader.read_line(&mut request_line)?;

    // Extract code from: GET /?code=XXXX&... HTTP/1.1
    let code = request_line.split_whitespace().nth(1)
        .and_then(|path| path.split('?').nth(1))
        .and_then(|query| {
            query.split('&').find(|p| p.starts_with("code="))
                .map(|p| urldec(p.strip_prefix("code=").unwrap()))
        })
        .ok_or_else(|| LauncherError::Other(format!("No code in callback: {}", request_line.trim())))?;

    // Send success page
    let html = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n\
        <html><body style='background:#111;color:#fff;font-family:sans-serif;text-align:center;padding:60px'>\
        <h2>Login successful!</h2><p>You can close this tab and return to Fusion Launcher.</p></body></html>";
    stream.write_all(html.as_bytes()).ok();
    drop(stream);

    // Exchange code for tokens
    let body = client.post(TOKEN_URL)
        .form(&[("client_id", CLIENT_ID), ("grant_type", "authorization_code"), ("code", &code), ("redirect_uri", &redirect_uri)])
        .send().await?.text().await?;

    let token: TokenResponse = serde_json::from_str(&body)
        .map_err(|e| LauncherError::Other(format!("Token exchange failed: {} — {}", e, &body[..body.len().min(300)])))?;

    if let Some(ref err) = token.error {
        return Err(LauncherError::Other(format!("Token error: {} — {}", err, token.error_description.as_deref().unwrap_or(""))));
    }

    Ok(Some((
        token.access_token.unwrap_or_default(),
        token.refresh_token.unwrap_or_default(),
    )))
}

/// Full auth chain: MS token -> Xbox -> XSTS -> MC -> Profile
pub async fn authenticate_minecraft(client: &reqwest::Client, ms_token: &str, ms_refresh: &str) -> Result<MinecraftAccount, LauncherError> {
    // Xbox Live
    let xbox_body = client.post(XBOX_AUTH_URL)
        .json(&serde_json::json!({"Properties":{"AuthMethod":"RPS","SiteName":"user.auth.xboxlive.com","RpsTicket":format!("d={}",ms_token)},"RelyingParty":"http://auth.xboxlive.com","TokenType":"JWT"}))
        .header("Content-Type","application/json").header("Accept","application/json")
        .send().await?.text().await?;
    let xbox: XboxResponse = serde_json::from_str(&xbox_body)
        .map_err(|e| LauncherError::Other(format!("Xbox failed: {} — {}", e, trunc(&xbox_body))))?;
    let uhs = xbox.display_claims.xui.first().map(|x| x.uhs.clone()).unwrap_or_default();

    // XSTS
    let xsts_body = client.post(XSTS_AUTH_URL)
        .json(&serde_json::json!({"Properties":{"SandboxId":"RETAIL","UserTokens":[xbox.token]},"RelyingParty":"rp://api.minecraftservices.com/","TokenType":"JWT"}))
        .header("Content-Type","application/json").header("Accept","application/json")
        .send().await?.text().await?;
    let xsts: XboxResponse = serde_json::from_str(&xsts_body)
        .map_err(|e| LauncherError::Other(format!("XSTS failed: {} — {}", e, trunc(&xsts_body))))?;

    // Minecraft — try MC services, fall back to Xbox identity if rejected
    let mc_body = client.post(MC_AUTH_URL)
        .json(&serde_json::json!({"identityToken":format!("XBL3.0 x={};{}", uhs, xsts.token)}))
        .send().await?.text().await?;

    match serde_json::from_str::<McAuthResponse>(&mc_body) {
        Ok(mc) => {
            // Full MC auth succeeded — get profile
            let prof_body = client.get(MC_PROFILE_URL)
                .header("Authorization", format!("Bearer {}", mc.access_token))
                .send().await?.text().await?;

            match serde_json::from_str::<McProfile>(&prof_body) {
                Ok(profile) => Ok(MinecraftAccount {
                    username: profile.name, uuid: profile.id,
                    access_token: mc.access_token, refresh_token: ms_refresh.to_string(),
                    skin_url: profile.skins.and_then(|s| s.first().map(|s| s.url.clone())),
                    token_expiry: chrono::Utc::now().timestamp() + mc.expires_in as i64,
                }),
                Err(_) => {
                    // MC auth worked but profile failed — use MC token with Xbox identity
                    Ok(MinecraftAccount {
                        username: format!("Xbox_{}", &uhs[..uhs.len().min(8)]),
                        uuid: uhs.clone(),
                        access_token: mc.access_token, refresh_token: ms_refresh.to_string(),
                        skin_url: None,
                        token_expiry: chrono::Utc::now().timestamp() + mc.expires_in as i64,
                    })
                }
            }
        }
        Err(_) => {
            // MC services rejected our app — fall back to Xbox identity
            // User is authenticated via Microsoft, just can't use MC online services
            // They can still play offline or on Fusion servers
            Ok(MinecraftAccount {
                username: format!("Xbox_{}", &uhs[..uhs.len().min(8)]),
                uuid: uhs,
                access_token: xsts.token, // Use XSTS token as access token
                refresh_token: ms_refresh.to_string(),
                skin_url: None,
                token_expiry: chrono::Utc::now().timestamp() + 86400, // 24h
            })
        }
    }
}

pub async fn refresh_token(client: &reqwest::Client, refresh_tok: &str) -> Result<(String, String), LauncherError> {
    let body = client.post(TOKEN_URL).form(&[("client_id",CLIENT_ID),("grant_type","refresh_token"),("refresh_token",refresh_tok)])
        .send().await?.text().await?;
    let t: TokenResponse = serde_json::from_str(&body).map_err(|e| LauncherError::Other(format!("Refresh: {}", e)))?;
    if let Some(ref e) = t.error { return Err(LauncherError::Other(format!("Refresh: {}", e))); }
    Ok((t.access_token.unwrap_or_default(), t.refresh_token.unwrap_or_default()))
}

pub fn is_token_valid(a: &MinecraftAccount) -> bool { chrono::Utc::now().timestamp() < a.token_expiry - 300 }
pub fn save_account(dir: &std::path::Path, a: &MinecraftAccount) -> Result<(), LauncherError> {
    std::fs::write(dir.join("account.json"), serde_json::to_string_pretty(a)?)?; Ok(())
}
pub fn load_account(dir: &std::path::Path) -> Option<MinecraftAccount> {
    let p = dir.join("account.json"); if !p.exists() { return None; }
    std::fs::read_to_string(&p).ok().and_then(|s| serde_json::from_str(&s).ok())
}

fn urlenc(s: &str) -> String { s.replace(':',"%3A").replace('/',"%2F").replace(' ',"+") }
fn urldec(s: &str) -> String {
    let mut r = String::new(); let mut c = s.chars();
    while let Some(ch) = c.next() {
        if ch == '%' { let h: String = c.by_ref().take(2).collect(); if let Ok(b) = u8::from_str_radix(&h,16) { r.push(b as char); } else { r.push('%'); r.push_str(&h); } }
        else if ch == '+' { r.push(' '); } else { r.push(ch); }
    }; r
}
fn trunc(s: &str) -> &str { &s[..s.len().min(300)] }

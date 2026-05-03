import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";

interface MinecraftAccount {
  username: string;
  uuid: string;
  access_token: string;
  skin_url: string | null;
  token_expiry: number;
}

interface LoginStartInfo {
  auth_url: string;
  port: number;
}

export default function AccountSection() {
  const [account, setAccount] = useState<MinecraftAccount | null>(null);
  const [loginState, setLoginState] = useState<"idle" | "waiting">("idle");
  const [error, setError] = useState("");
  const [userClickedLogin, setUserClickedLogin] = useState(false);

  useEffect(() => {
    loadAccount();
  }, []);

  async function loadAccount() {
    // Silently try to load — never show errors from this
    try {
      const acc = await invoke<MinecraftAccount | null>("get_account");
      if (acc) setAccount(acc);
    } catch {
      // Completely silent — no account is the normal state
    }
  }

  async function startLogin() {
    setError("");
    setUserClickedLogin(true);
    setLoginState("waiting");
    try {
      const info = await invoke<LoginStartInfo>("start_ms_login");

      try {
        await open(info.auth_url);
      } catch {
        // If shell.open fails, the user can manually navigate
      }

      const result = await invoke<MinecraftAccount>("complete_ms_login", { port: info.port });
      setAccount(result);
      setLoginState("idle");
      setError("");
    } catch (e: any) {
      setLoginState("idle");
      // Only show error if the user explicitly clicked login
      if (userClickedLogin) {
        setError(String(e));
      }
    }
  }

  async function handleLogout() {
    try {
      await invoke("logout");
      setAccount(null);
      setError("");
    } catch {}
  }

  const sectionStyle: React.CSSProperties = {
    background: "#131313", border: "1px solid #1e1e1e", borderRadius: 12, padding: 20,
  };

  return (
    <div style={sectionStyle}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: "#e5e5e5", margin: "0 0 16px 0" }}>
        Microsoft Account
      </h2>

      {account ? (
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 10, overflow: "hidden",
            background: "#1a1a1a", flexShrink: 0,
          }}>
            <img src={`https://mc-heads.net/avatar/${account.uuid}/48`} alt=""
              style={{ width: "100%", height: "100%", imageRendering: "pixelated" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#e5e5e5" }}>{account.username}</div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>UUID: {account.uuid.slice(0, 8)}...</div>
            <div style={{ fontSize: 11, color: "#22c55e", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
              Logged in
            </div>
          </div>
          <button onClick={handleLogout} style={{
            padding: "6px 16px", borderRadius: 8, fontSize: 12,
            background: "#1a1a1a", border: "1px solid #2a2a2a",
            color: "#888", cursor: "pointer",
          }}>Logout</button>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: 13, color: "#888", marginBottom: 14 }}>
            Sign in with your Microsoft account to play online and download Minecraft.
          </p>
          {error && userClickedLogin && (
            <div style={{
              fontSize: 12, color: "#ef4444", marginBottom: 10,
              padding: "8px 12px", background: "#ef444410", borderRadius: 6,
              wordBreak: "break-word",
            }}>{error}</div>
          )}
          {loginState === "waiting" ? (
            <div>
              <div style={{
                padding: "12px 16px", background: "#0a0a0a", borderRadius: 8,
                border: "1px solid #1e1e1e", textAlign: "center", marginBottom: 10,
              }}>
                <div style={{ fontSize: 13, color: "#999", marginBottom: 4 }}>
                  Complete login in your browser...
                </div>
                <div style={{ fontSize: 11, color: "#555" }}>
                  Sign in with your Microsoft account in the browser window.
                </div>
              </div>
              <div style={{ height: 3, borderRadius: 2, background: "#1a1a1a", overflow: "hidden" }}>
                <div style={{
                  height: "100%", background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
                  width: "30%",
                  animation: "loading 1.5s ease-in-out infinite alternate",
                }} />
              </div>
              <style>{`@keyframes loading { from { margin-left: 0; } to { margin-left: 70%; } }`}</style>
            </div>
          ) : (
            <button onClick={startLogin} style={{
              padding: "10px 24px", borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: "linear-gradient(135deg, #6366f1, #4f46e5)",
              color: "#fff", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="white">
                <rect x="1" y="1" width="6.5" height="6.5" /><rect x="8.5" y="1" width="6.5" height="6.5" />
                <rect x="1" y="8.5" width="6.5" height="6.5" /><rect x="8.5" y="8.5" width="6.5" height="6.5" />
              </svg>
              Sign in with Microsoft
            </button>
          )}
        </div>
      )}
    </div>
  );
}

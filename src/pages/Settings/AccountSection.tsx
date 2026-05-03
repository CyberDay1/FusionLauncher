import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";

interface MinecraftAccount {
  username: string;
  uuid: string;
  access_token: string;
  skin_url: string | null;
  token_expiry: number;
}

interface DeviceCodeInfo {
  user_code: string;
  verification_uri: string;
  message: string;
  interval: number;
}

export default function AccountSection() {
  const [account, setAccount] = useState<MinecraftAccount | null>(null);
  const [loginState, setLoginState] = useState<"idle" | "code" | "authenticating">("idle");
  const [deviceCode, setDeviceCode] = useState<DeviceCodeInfo | null>(null);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadAccount();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function loadAccount() {
    try {
      const acc = await invoke<MinecraftAccount | null>("get_account");
      if (acc) setAccount(acc);
    } catch {}
  }

  async function startLogin() {
    setError("");
    setLoginState("code");
    try {
      const info = await invoke<DeviceCodeInfo>("start_ms_login");
      setDeviceCode(info);

      // Open browser to microsoft.com/link
      try { await open(info.verification_uri); } catch {}

      // Start polling for completion
      pollRef.current = setInterval(async () => {
        try {
          const result = await invoke<MinecraftAccount | null>("poll_ms_login");
          if (result) {
            // Success!
            setAccount(result);
            setLoginState("idle");
            setDeviceCode(null);
            if (pollRef.current) clearInterval(pollRef.current);
          }
          // null = still waiting, keep polling
        } catch (e: any) {
          setError(String(e));
          setLoginState("idle");
          setDeviceCode(null);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }, (info.interval || 5) * 1000);
    } catch (e: any) {
      setError(String(e));
      setLoginState("idle");
    }
  }

  async function handleLogout() {
    try { await invoke("logout"); setAccount(null); } catch {}
  }

  return (
    <div style={{ background: "#131313", border: "1px solid #1e1e1e", borderRadius: 12, padding: 20 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: "#e5e5e5", margin: "0 0 16px 0" }}>
        Microsoft Account
      </h2>

      {account ? (
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 10, overflow: "hidden", background: "#1a1a1a", flexShrink: 0 }}>
            <img src={`https://mc-heads.net/avatar/${account.uuid}/48`} alt=""
              style={{ width: "100%", height: "100%", imageRendering: "pixelated" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
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
            background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#888", cursor: "pointer",
          }}>Logout</button>
        </div>
      ) : loginState === "code" && deviceCode ? (
        <div>
          <p style={{ fontSize: 13, color: "#999", marginBottom: 12 }}>
            Go to <strong style={{ color: "#e5e5e5" }}>{deviceCode.verification_uri}</strong> and enter this code:
          </p>
          <div style={{
            background: "#0a0a0a", borderRadius: 10, padding: 20, textAlign: "center",
            border: "1px solid #1e1e1e", marginBottom: 12,
          }}>
            <div style={{
              fontSize: 32, fontWeight: 700, color: "#6366f1",
              letterSpacing: "0.2em", fontFamily: "monospace",
            }}>{deviceCode.user_code}</div>
          </div>
          <p style={{ fontSize: 11, color: "#555", marginBottom: 10 }}>
            A browser window should have opened. Sign in with your Microsoft account and enter the code above.
          </p>
          <div style={{ height: 3, borderRadius: 2, background: "#1a1a1a", overflow: "hidden" }}>
            <div style={{
              height: "100%", background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
              width: "30%", animation: "loading 1.5s ease-in-out infinite alternate",
            }} />
          </div>
          <style>{`@keyframes loading { from { margin-left: 0; } to { margin-left: 70%; } }`}</style>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: 13, color: "#888", marginBottom: 14 }}>
            Sign in with your Microsoft account to play online and download Minecraft.
          </p>
          {error && (
            <div style={{
              fontSize: 12, color: "#ef4444", marginBottom: 10,
              padding: "8px 12px", background: "#ef444410", borderRadius: 6, wordBreak: "break-word",
            }}>{error}</div>
          )}
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
        </div>
      )}
    </div>
  );
}

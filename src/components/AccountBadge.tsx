import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router";

interface MinecraftAccount {
  username: string;
  uuid: string;
  skin_url: string | null;
}

export default function AccountBadge() {
  const [account, setAccount] = useState<MinecraftAccount | null>(null);
  const [hover, setHover] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    invoke<MinecraftAccount | null>("get_account").then(setAccount).catch(() => {});
    const refresh = () => { invoke<MinecraftAccount | null>("get_account").then(setAccount).catch(() => {}); };
    window.addEventListener("account-changed", refresh);
    return () => window.removeEventListener("account-changed", refresh);
  }, []);

  const base: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 6,
    padding: "3px 10px 3px 3px", borderRadius: 6,
    background: hover ? "#1a1a1a" : "transparent",
    border: "none", cursor: "pointer",
    transition: "background 0.15s",
  };

  if (!account) {
    return (
      <button onClick={() => navigate("/settings")}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ ...base, padding: "3px 10px", gap: 5 }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#666" strokeWidth="1.2">
          <circle cx="6" cy="4.5" r="2.5" /><path d="M1 11 C1 8.5 3.5 7 6 7 C8.5 7 11 8.5 11 11" />
        </svg>
        <span style={{ fontSize: 11, color: "#666" }}>Sign In</span>
      </button>
    );
  }

  return (
    <button onClick={() => navigate("/settings")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={base}
    >
      <img
        src={`https://mc-heads.net/avatar/${account.uuid}/22`}
        alt=""
        style={{ width: 22, height: 22, borderRadius: 4, imageRendering: "pixelated" }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
      <span style={{ fontSize: 11, fontWeight: 600, color: "#b0b0b0" }}>{account.username}</span>
      <div style={{
        width: 5, height: 5, borderRadius: "50%",
        background: "#22c55e",
        boxShadow: "0 0 4px rgba(34,197,94,0.5)",
      }} />
    </button>
  );
}

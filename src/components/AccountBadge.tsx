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
  }, []);

  if (!account) {
    // Not logged in — show sign in button
    return (
      <button
        onClick={() => navigate("/settings")}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 14px", borderRadius: 8,
          background: hover ? "#1e1e1e" : "#151515",
          border: "1px solid #2a2a2a",
          color: "#888", fontSize: 12, cursor: "pointer",
          transition: "background 0.15s, border-color 0.15s",
          borderColor: hover ? "#3a3a3a" : "#2a2a2a",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
          <circle cx="7" cy="5" r="3" />
          <path d="M1 13 C1 10 4 8 7 8 C10 8 13 10 13 13" />
        </svg>
        Sign In
      </button>
    );
  }

  // Logged in — show skin head + username
  return (
    <button
      onClick={() => navigate("/settings")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "4px 12px 4px 4px", borderRadius: 8,
        background: hover ? "#1e1e1e" : "#151515",
        border: "1px solid #2a2a2a",
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
        borderColor: hover ? "#3a3a3a" : "#2a2a2a",
      }}
    >
      {/* Skin head */}
      <img
        src={`https://mc-heads.net/avatar/${account.uuid}/28`}
        alt=""
        style={{
          width: 28, height: 28, borderRadius: 6,
          imageRendering: "pixelated",
        }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
      <span style={{ fontSize: 12, fontWeight: 600, color: "#d1d5db" }}>
        {account.username}
      </span>
      {/* Online indicator */}
      <div style={{
        width: 6, height: 6, borderRadius: "50%",
        background: "#22c55e",
        boxShadow: "0 0 6px rgba(34,197,94,0.5)",
      }} />
    </button>
  );
}

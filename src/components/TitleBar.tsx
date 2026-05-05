import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useAccentColor } from "../hooks/useAccentColor";
import AccountBadge from "./AccountBadge";

function getWindow() {
  return getCurrentWindow();
}

function WinBtn({ onClick, hoverBg, children }: {
  onClick: () => void;
  hoverBg: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 44, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
        background: "transparent", border: "none", color: "#6b7280", cursor: "pointer",
        transition: "background 0.1s, color 0.1s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = hoverBg;
        e.currentTarget.style.color = "#fff";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "#6b7280";
      }}
    >
      {children}
    </button>
  );
}

export default function TitleBar() {
  const accentColor = useAccentColor();
  return (
    <div
      data-tauri-drag-region
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 40, paddingLeft: 12, background: "#0a0a0a",
        borderBottom: "1px solid #1a1a1a", userSelect: "none", flexShrink: 0,
      }}
    >
      {/* Left: app name */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }} data-tauri-drag-region>
        <div style={{
          width: 16, height: 16, borderRadius: 4,
          background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
        }} />
        <span style={{ color: "#9ca3af", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em" }}>
          FUSION LAUNCHER
        </span>
        <span style={{ color: "#3f3f46", fontSize: 10 }}>v0.1.0</span>
      </div>

      {/* Right: account + window controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {/* Account badge */}
        <div style={{ marginRight: 8 }}>
          <AccountBadge />
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 18, background: "#1e1e1e", marginRight: 4 }} />

        {/* Window controls */}
        <WinBtn onClick={() => getWindow().minimize()} hoverBg="#252525">
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor"><rect width="10" height="1" /></svg>
        </WinBtn>
        <WinBtn onClick={() => getWindow().toggleMaximize()} hoverBg="#252525">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="9" height="9" /></svg>
        </WinBtn>
        <WinBtn onClick={() => invoke("quit_app")} hoverBg="#dc2626">
          <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.5"><line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" /></svg>
        </WinBtn>
      </div>
    </div>
  );
}

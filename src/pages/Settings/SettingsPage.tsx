import { useState } from "react";
import AccountSection from "./AccountSection";

const sectionStyle: React.CSSProperties = {
  background: "#131313", border: "1px solid #1e1e1e", borderRadius: 12, padding: 20,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: "#888", marginBottom: 6, display: "block",
};

const inputStyle: React.CSSProperties = {
  background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8,
  padding: "8px 12px", fontSize: 13, color: "#e5e5e5", outline: "none",
  width: "100%", boxSizing: "border-box",
};

export default function SettingsPage() {
  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, width: "100%", boxSizing: "border-box", overflowY: "auto", height: "100%" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>Settings</h1>

      {/* Microsoft Account */}
      <AccountSection />

      {/* Java Runtime */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "#e5e5e5", margin: "0 0 16px 0" }}>Java Runtime</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={labelStyle}>Java Path</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="text" placeholder="Auto-detect" readOnly style={{ ...inputStyle, flex: 1 }} />
              <button style={{
                padding: "8px 14px", borderRadius: 8, fontSize: 12,
                background: "#1a1a1a", border: "1px solid #2a2a2a",
                color: "#888", cursor: "pointer",
              }}>Browse</button>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b" }} />
              <span style={{ fontSize: 13, color: "#f59e0b" }}>Not configured</span>
            </div>
          </div>
        </div>
      </div>

      {/* Memory */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "#e5e5e5", margin: "0 0 16px 0" }}>Memory</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={labelStyle}>Minimum (MB)</label>
            <input type="number" defaultValue={512} min={256} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Maximum (MB)</label>
            <input type="number" defaultValue={4096} min={512} style={inputStyle} />
          </div>
        </div>
        {/* Memory slider visual */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#555", marginBottom: 4 }}>
            <span>512 MB</span><span>System RAM</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: "#1a1a1a", position: "relative" }}>
            <div style={{
              height: "100%", borderRadius: 3, width: "50%",
              background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
            }} />
          </div>
        </div>
      </div>

      {/* JVM Arguments */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "#e5e5e5", margin: "0 0 16px 0" }}>JVM Arguments</h2>
        <input type="text" placeholder="-XX:+UseZGC -XX:+ZGenerational"
          style={{ ...inputStyle, fontFamily: "'Cascadia Code', 'Consolas', monospace" }} />
        <p style={{ fontSize: 11, color: "#555", marginTop: 6 }}>
          Additional JVM arguments. --enable-preview is always added automatically.
        </p>
      </div>

      {/* Launcher Behavior */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "#e5e5e5", margin: "0 0 16px 0" }}>Launcher Behavior</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <ToggleSetting label="Close launcher when game starts" defaultChecked={false} />
          <ToggleSetting label="Minimize to system tray" defaultChecked={true} />
          <ToggleSetting label="Check for updates on startup" defaultChecked={true} />
          <ToggleSetting label="Show notifications for server events" defaultChecked={true} />
        </div>
      </div>

      {/* About */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "#e5e5e5", margin: "0 0 12px 0" }}>About</h2>
        <div style={{ fontSize: 12, color: "#666", lineHeight: 1.8 }}>
          <div>Fusion Launcher v0.1.0</div>
          <div>Built with Tauri 2 + React + TypeScript</div>
          <div style={{ marginTop: 8 }}>
            <a href="https://github.com/CyberDay1/FusionLauncher" target="_blank"
              style={{ color: "#6366f1", textDecoration: "none" }}>
              GitHub Repository
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleSetting({ label, defaultChecked }: { label: string; defaultChecked: boolean }) {
  const [checked, setChecked] = useState(defaultChecked);

  return (
    <div
      onClick={() => setChecked(!checked)}
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        cursor: "pointer", userSelect: "none",
      }}
    >
      <span style={{ fontSize: 13, color: "#d1d5db" }}>{label}</span>
      <div style={{
        width: 38, height: 20, borderRadius: 10, padding: 2,
        background: checked ? "#6366f1" : "#2a2a2a",
        transition: "background 0.2s", position: "relative",
      }}>
        <div style={{
          width: 16, height: 16, borderRadius: "50%",
          background: checked ? "#fff" : "#666",
          transform: checked ? "translateX(18px)" : "translateX(0)",
          transition: "transform 0.2s, background 0.2s",
        }} />
      </div>
    </div>
  );
}

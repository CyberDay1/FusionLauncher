import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import AccountSection from "./AccountSection";

interface JavaRuntime {
  path: string;
  version: { major: number; minor: number; patch: number };
  vendor: string;
  arch: string;
}

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

// Cache Java detection results across page navigations
let cachedJavaRuntimes: JavaRuntime[] | null = null;
let cachedSelectedJava: string = "";

export default function SettingsPage() {
  const [javaRuntimes, setJavaRuntimes] = useState<JavaRuntime[]>(cachedJavaRuntimes || []);
  const [detecting, setDetecting] = useState(false);
  const [selectedJava, setSelectedJava] = useState(cachedSelectedJava);

  useEffect(() => {
    if (!cachedJavaRuntimes) {
      detectJava();
    }
  }, []);

  async function detectJava() {
    setDetecting(true);
    try {
      const runtimes = await invoke<JavaRuntime[]>("detect_java");
      setJavaRuntimes(runtimes);
      cachedJavaRuntimes = runtimes;
      if (runtimes.length > 0 && !selectedJava) {
        // Auto-select the first Java 25+
        const best = runtimes.find(r => r.version.major >= 25) || runtimes[0];
        setSelectedJava(best.path);
        cachedSelectedJava = best.path;
      }
    } catch (e) { console.error("Java detection failed:", e); }
    setDetecting(false);
  }

  const activeJava = javaRuntimes.find(r => r.path === selectedJava);
  const javaOk = activeJava && activeJava.version.major >= 25;

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, width: "100%", boxSizing: "border-box", overflowY: "auto", height: "100%" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>Settings</h1>

      {/* Microsoft Account */}
      <AccountSection />

      {/* Java Runtime */}
      <div style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#e5e5e5", margin: 0 }}>Java Runtime</h2>
          <button onClick={detectJava} disabled={detecting} style={{
            padding: "5px 14px", borderRadius: 6, fontSize: 11, fontWeight: 500,
            background: "#1a1a1a", border: "1px solid #2a2a2a",
            color: detecting ? "#555" : "#888", cursor: detecting ? "wait" : "pointer",
          }}>{detecting ? "Scanning..." : "Re-detect"}</button>
        </div>

        {javaRuntimes.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: detecting ? "#6366f1" : "#f59e0b" }} />
            <span style={{ fontSize: 13, color: detecting ? "#6366f1" : "#f59e0b" }}>
              {detecting ? "Scanning for Java..." : "No Java found — install Java 25+ or click Re-detect"}
            </span>
          </div>
        ) : (
          <div>
            <label style={labelStyle}>Detected Runtimes ({javaRuntimes.length})</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
              {javaRuntimes.map((rt) => {
                const isSelected = rt.path === selectedJava;
                const meetsReq = rt.version.major >= 25;
                return (
                  <div key={rt.path}
                    onClick={() => { setSelectedJava(rt.path); cachedSelectedJava = rt.path; }}
                    style={{
                      padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                      background: isSelected ? "#6366f118" : "#0f0f0f",
                      border: `1px solid ${isSelected ? "#6366f140" : "#1e1e1e"}`,
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      transition: "border-color 0.15s",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: isSelected ? "#e5e5e5" : "#999" }}>
                        Java {rt.version.major}.{rt.version.minor}.{rt.version.patch}
                        <span style={{ fontSize: 11, color: "#555", marginLeft: 8 }}>{rt.vendor}</span>
                      </div>
                      <div style={{
                        fontSize: 10, color: "#444", marginTop: 2,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        maxWidth: 500,
                      }}>{rt.path}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      {!meetsReq && (
                        <span style={{ fontSize: 9, color: "#f59e0b", padding: "2px 6px", borderRadius: 4, background: "#f59e0b18" }}>
                          Needs 25+
                        </span>
                      )}
                      {isSelected && (
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: meetsReq ? "#22c55e" : "#f59e0b" }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Status */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: javaOk ? "#22c55e" : "#f59e0b" }} />
              <span style={{ fontSize: 12, color: javaOk ? "#22c55e" : "#f59e0b" }}>
                {javaOk
                  ? `${activeJava!.vendor} Java ${activeJava!.version.major} selected`
                  : activeJava
                    ? `Java ${activeJava.version.major} selected — Fusion requires 25+`
                    : "Select a Java runtime"
                }
              </span>
            </div>
          </div>
        )}
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

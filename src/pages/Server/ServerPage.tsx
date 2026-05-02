import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface LogLine { timestamp: string; stream: string; text: string; }

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 500,
  background: active ? "linear-gradient(135deg, #6366f1, #4f46e5)" : "#1a1a1a",
  color: active ? "#fff" : "#888", border: "none", cursor: "pointer",
  transition: "background 0.15s",
});

const input: React.CSSProperties = {
  background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6,
  padding: "6px 10px", fontSize: 12, color: "#e5e5e5", outline: "none",
  fontFamily: "'Cascadia Code', 'Consolas', monospace",
};

export default function ServerPage() {
  const [activeTab, setActiveTab] = useState<"console" | "config" | "backups">("console");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [command, setCommand] = useState("");
  const [properties, setProperties] = useState<Record<string, string>>({});
  const [backups, setBackups] = useState<any[]>([]);
  const instanceId = "demo-server";

  useEffect(() => {
    const unlisten = listen<any>("process-log", (event) => {
      setLogs((prev) => [...prev.slice(-2000), {
        timestamp: event.payload.timestamp, stream: event.payload.stream, text: event.payload.line,
      }]);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  async function handleSendCommand() {
    if (!command.trim()) return;
    try { await invoke("send_server_command", { instanceId, command }); setCommand(""); }
    catch (e) { console.error("Failed:", e); }
  }

  useEffect(() => {
    if (activeTab === "config") invoke<Record<string, string>>("get_server_properties", { instanceId }).then(setProperties).catch(() => {});
    if (activeTab === "backups") invoke<any[]>("list_backups", { instanceId }).then(setBackups).catch(() => {});
  }, [activeTab]);

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, width: "100%", boxSizing: "border-box", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>Server Panel</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#555" }} />
          <span style={{ fontSize: 12, color: "#888" }}>Offline</span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4 }}>
        {(["console", "config", "backups"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={tabStyle(activeTab === tab)}>
            {tab === "console" ? "Console" : tab === "config" ? "Configuration" : "Backups"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>

        {activeTab === "console" && (
          <>
            {/* Log output */}
            <div style={{
              flex: 1, background: "#0a0a0a", border: "1px solid #1e1e1e", borderRadius: 10,
              padding: 14, overflowY: "auto", fontFamily: "'Cascadia Code', 'Consolas', monospace",
              fontSize: 11, lineHeight: 1.6,
            }}>
              {logs.length === 0 ? (
                <span style={{ color: "#444" }}>No output yet. Start a server instance to see logs here.</span>
              ) : logs.map((log, i) => (
                <div key={i} style={{ color: log.stream === "stderr" ? "#f87171" : "#d1d5db" }}>
                  <span style={{ color: "#444" }}>[{log.timestamp}]</span> {log.text}
                </div>
              ))}
            </div>

            {/* Command input */}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input type="text" placeholder="Enter command..." value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendCommand()}
                style={{ ...input, flex: 1, padding: "10px 14px", fontSize: 13, borderRadius: 10 }} />
              <button onClick={handleSendCommand} style={{
                padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: "linear-gradient(135deg, #6366f1, #4f46e5)",
                color: "#fff", border: "none", cursor: "pointer",
              }}>Send</button>
            </div>
          </>
        )}

        {activeTab === "config" && (
          <div style={{
            flex: 1, background: "#131313", border: "1px solid #1e1e1e", borderRadius: 12,
            padding: 20, overflowY: "auto",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: "#e5e5e5", margin: 0 }}>server.properties</h2>
              {Object.keys(properties).length > 0 && (
                <button onClick={() => invoke("set_server_properties", { instanceId, properties })}
                  style={{
                    padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                    background: "linear-gradient(135deg, #22c55e, #16a34a)",
                    color: "#fff", border: "none", cursor: "pointer",
                  }}>Save</button>
              )}
            </div>
            {Object.keys(properties).length === 0 ? (
              <p style={{ fontSize: 13, color: "#555" }}>No server.properties found. Start a server first.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {Object.entries(properties).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      fontSize: 12, color: "#888", width: 220, flexShrink: 0,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }} title={key}>{key}</span>
                    <input type="text" value={value}
                      onChange={(e) => setProperties({ ...properties, [key]: e.target.value })}
                      style={{ ...input, flex: 1 }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "backups" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
            <button onClick={() => invoke("create_backup", { instanceId }).then(() => invoke<any[]>("list_backups", { instanceId }).then(setBackups))}
              style={{
                padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: "linear-gradient(135deg, #6366f1, #4f46e5)",
                color: "#fff", border: "none", cursor: "pointer", alignSelf: "flex-start",
              }}>Create Backup Now</button>

            {backups.length === 0 ? (
              <div style={{
                background: "#131313", border: "1px solid #1e1e1e", borderRadius: 12,
                padding: "40px 20px", textAlign: "center",
              }}>
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#333" strokeWidth="1.5" style={{ marginBottom: 10 }}>
                  <rect x="2" y="6" width="24" height="18" rx="3"/><path d="M8 6 V3 h12 v3"/>
                </svg>
                <p style={{ fontSize: 13, color: "#555" }}>No backups yet</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, overflowY: "auto" }}>
                {backups.map((b: any) => (
                  <div key={b.id} style={{
                    background: "#131313", border: "1px solid #1e1e1e", borderRadius: 10,
                    padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#e5e5e5" }}>{b.name}</div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                        {b.world_name} &middot; {(b.size_bytes / 1024 / 1024).toFixed(1)} MB
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

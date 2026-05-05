import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface LogLine { timestamp: string; stream: string; text: string; }
interface InstanceConfig {
  id: string; name: string; instance_type: string; minecraft_version: string;
  install_status: string; auto_restart: boolean; restart_delay_secs: number;
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 500,
  background: active ? "linear-gradient(135deg, #6366f1, #4f46e5)" : "#1a1a1a",
  color: active ? "#fff" : "#888", border: "none", cursor: "pointer",
});

const input: React.CSSProperties = {
  background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6,
  padding: "6px 10px", fontSize: 12, color: "#e5e5e5", outline: "none",
  fontFamily: "'Cascadia Code', 'Consolas', monospace",
};

export default function ServerPage() {
  const [activeTab, setActiveTab] = useState<"console" | "config" | "backups" | "players">("console");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [command, setCommand] = useState("");
  const [properties, setProperties] = useState<Record<string, string>>({});
  const [backups, setBackups] = useState<any[]>([]);
  const [servers, setServers] = useState<InstanceConfig[]>([]);
  const [selectedServer, setSelectedServer] = useState("");
  const [serverRunning, setServerRunning] = useState(false);
  const [perfHistory, setPerfHistory] = useState<{ tps: number; mspt: number; time: string }[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadServers();
    const unlisten = listen<any>("process-log", (event) => {
      if (selectedServer && event.payload.instance_id === selectedServer) {
        const line: string = event.payload.line;
        setLogs((prev) => [...prev.slice(-3000), {
          timestamp: event.payload.timestamp, stream: event.payload.stream, text: line,
        }]);
        // Parse TPS from log lines (Spark, Paper, Vanilla "Can't keep up")
        if (line.includes("TPS")) {
          const nums = line.match(/(\d+\.?\d*)/g);
          if (nums) {
            const tps = parseFloat(nums[nums.length - 1]);
            if (tps > 0 && tps <= 20) {
              const mspt = 1000 / tps;
              setPerfHistory(prev => [...prev.slice(-60), {
                tps, mspt, time: event.payload.timestamp,
              }]);
            }
          }
        }
      }
    });
    const unlistenStatus = listen<any>("process-status", (event) => {
      if (event.payload.instance_id === selectedServer) {
        setServerRunning(event.payload.status === "running");
      }
    });
    return () => { unlisten.then(fn => fn()); unlistenStatus.then(fn => fn()); };
  }, [selectedServer]);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  async function loadServers() {
    try {
      const list = await invoke<InstanceConfig[]>("list_instances");
      const serverList = list.filter(i => i.instance_type === "Server");
      setServers(serverList);
      if (serverList.length > 0 && !selectedServer) {
        setSelectedServer(serverList[0].id);
      }
    } catch {}
  }

  async function handleStart() {
    if (!selectedServer) return;
    try {
      await invoke("install_instance", { instanceId: selectedServer });
      await invoke("launch_instance", { instanceId: selectedServer });
      setServerRunning(true);
    } catch (e: any) { console.error("Start failed:", e); }
  }

  async function handleStop() {
    if (!selectedServer) return;
    try {
      await invoke("stop_instance", { instanceId: selectedServer });
      setServerRunning(false);
    } catch (e: any) { console.error("Stop failed:", e); }
  }

  async function handleSendCommand() {
    if (!command.trim() || !selectedServer) return;
    try {
      await invoke("send_server_command", { instanceId: selectedServer, command });
      setCommand("");
    } catch {}
  }

  useEffect(() => {
    if (activeTab === "config" && selectedServer) {
      invoke<Record<string, string>>("get_server_properties", { instanceId: selectedServer }).then(setProperties).catch(() => {});
    }
    if (activeTab === "backups" && selectedServer) {
      invoke<any[]>("list_backups", { instanceId: selectedServer }).then(setBackups).catch(() => {});
    }
  }, [activeTab, selectedServer]);

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, width: "100%", boxSizing: "border-box", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>Server Panel</h1>
          {servers.length > 1 && (
            <select value={selectedServer} onChange={(e) => { setSelectedServer(e.target.value); setLogs([]); }}
              style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, padding: "4px 8px", fontSize: 12, color: "#e5e5e5", cursor: "pointer", outline: "none" }}>
              {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: serverRunning ? "#22c55e" : "#555" }} />
            <span style={{ fontSize: 12, color: serverRunning ? "#22c55e" : "#888" }}>
              {serverRunning ? "Running" : "Offline"}
            </span>
          </div>
          {servers.length > 0 && (
            serverRunning ? (
              <button onClick={handleStop} style={{
                padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: "#dc2626", color: "#fff", border: "none", cursor: "pointer",
              }}>Stop</button>
            ) : (
              <button onClick={handleStart} style={{
                padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: "linear-gradient(135deg, #22c55e, #16a34a)",
                color: "#fff", border: "none", cursor: "pointer",
              }}>Start</button>
            )
          )}
        </div>
      </div>

      {servers.length === 0 ? (
        <div style={{
          background: "#131313", border: "1px solid #1e1e1e", borderRadius: 12,
          padding: "48px 20px", textAlign: "center", flex: 1,
        }}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="#333" strokeWidth="1.5" style={{ marginBottom: 12 }}>
            <rect x="4" y="4" width="24" height="24" rx="4"/><line x1="16" y1="10" x2="16" y2="22"/><line x1="10" y1="16" x2="22" y2="16"/>
          </svg>
          <p style={{ fontSize: 13, color: "#555", marginBottom: 14 }}>No server instances yet</p>
          <p style={{ fontSize: 11, color: "#444" }}>Create a Server instance from the Instances page to get started.</p>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 4 }}>
            {(["console", "config", "players", "backups"] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={tabStyle(activeTab === tab)}>
                {tab === "console" ? "Console" : tab === "config" ? "Configuration" : tab === "players" ? "Players" : "Backups"}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {activeTab === "console" && (
              <>
                {/* Performance strip */}
                {perfHistory.length > 0 && (
                  <div style={{
                    background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 10,
                    padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 16,
                  }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontSize: 10, color: "#666" }}>TPS</span>
                      <span style={{
                        fontSize: 20, fontWeight: 700, fontFamily: "monospace",
                        color: perfHistory[perfHistory.length - 1].tps >= 19 ? "#22c55e"
                          : perfHistory[perfHistory.length - 1].tps >= 15 ? "#f59e0b" : "#ef4444",
                      }}>{perfHistory[perfHistory.length - 1].tps.toFixed(1)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontSize: 10, color: "#666" }}>MSPT</span>
                      <span style={{
                        fontSize: 20, fontWeight: 700, fontFamily: "monospace",
                        color: perfHistory[perfHistory.length - 1].mspt <= 50 ? "#22c55e"
                          : perfHistory[perfHistory.length - 1].mspt <= 66 ? "#f59e0b" : "#ef4444",
                      }}>{perfHistory[perfHistory.length - 1].mspt.toFixed(1)}</span>
                    </div>
                    {/* Mini bar chart */}
                    <div style={{ flex: 1, display: "flex", alignItems: "end", gap: 1, height: 24 }}>
                      {perfHistory.slice(-40).map((p, i) => (
                        <div key={i} style={{
                          flex: 1, minWidth: 2,
                          height: `${Math.min(100, (p.mspt / 100) * 100)}%`,
                          background: p.mspt <= 50 ? "#22c55e40" : p.mspt <= 66 ? "#f59e0b40" : "#ef444440",
                          borderRadius: 1,
                        }} />
                      ))}
                    </div>
                  </div>
                )}
                <div style={{
                  flex: 1, background: "#0a0a0a", border: "1px solid #1e1e1e", borderRadius: 10,
                  padding: 14, overflowY: "auto", fontFamily: "'Cascadia Code', 'Consolas', monospace",
                  fontSize: 11, lineHeight: 1.6,
                }}>
                  {logs.length === 0 ? (
                    <span style={{ color: "#444" }}>
                      {serverRunning ? "Waiting for output..." : "Server is offline. Click Start to begin."}
                    </span>
                  ) : logs.map((log, i) => (
                    <div key={i} style={{ color: log.stream === "stderr" ? "#f87171" : "#d1d5db" }}>
                      <span style={{ color: "#444" }}>[{log.timestamp}]</span> {log.text}
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <input type="text" placeholder={serverRunning ? "Enter command..." : "Server is offline"} value={command}
                    disabled={!serverRunning}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendCommand()}
                    style={{ ...input, flex: 1, padding: "10px 14px", fontSize: 13, borderRadius: 10, opacity: serverRunning ? 1 : 0.5 }} />
                  <button onClick={handleSendCommand} disabled={!serverRunning} style={{
                    padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                    background: serverRunning ? "linear-gradient(135deg, #6366f1, #4f46e5)" : "#333",
                    color: "#fff", border: "none", cursor: serverRunning ? "pointer" : "not-allowed",
                  }}>Send</button>
                </div>
              </>
            )}

            {activeTab === "config" && (() => {
              const serverConfig = servers.find(s => s.id === selectedServer);
              return (
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Restart Settings */}
                {serverConfig && (
                <div style={{ background: "#131313", border: "1px solid #1e1e1e", borderRadius: 12, padding: 16 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 600, color: "#e5e5e5", margin: "0 0 12px 0" }}>Restart Settings</h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {/* Auto-restart toggle */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 13, color: "#ccc" }}>Auto-restart on crash</div>
                        <div style={{ fontSize: 11, color: "#555" }}>Automatically restart the server if the process exits unexpectedly</div>
                      </div>
                      <div
                        onClick={async () => {
                          const newVal = !serverConfig.auto_restart;
                          setServers(prev => prev.map(s => s.id === selectedServer ? { ...s, auto_restart: newVal } : s));
                          await invoke("update_instance", { instanceId: selectedServer, autoRestart: newVal }).catch(() => {});
                        }}
                        style={{
                          width: 40, height: 22, borderRadius: 11, padding: 2, cursor: "pointer",
                          background: serverConfig.auto_restart ? "#22c55e" : "#2a2a2a",
                          transition: "background 0.2s", flexShrink: 0,
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: "50%",
                          background: serverConfig.auto_restart ? "#fff" : "#666",
                          transform: serverConfig.auto_restart ? "translateX(18px)" : "translateX(0)",
                          transition: "transform 0.2s, background 0.2s",
                        }} />
                      </div>
                    </div>
                    {/* Restart delay */}
                    {serverConfig.auto_restart && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 12, color: "#888", width: 120, flexShrink: 0 }}>Restart delay</span>
                        <input type="number" min={0} max={300} value={serverConfig.restart_delay_secs}
                          onChange={e => {
                            const val = parseInt(e.target.value) || 10;
                            setServers(prev => prev.map(s => s.id === selectedServer ? { ...s, restart_delay_secs: val } : s));
                          }}
                          onBlur={async e => {
                            await invoke("update_instance", { instanceId: selectedServer, restartDelay: parseInt(e.target.value) || 10 }).catch(() => {});
                          }}
                          style={{ ...input, width: 80 }}
                        />
                        <span style={{ fontSize: 11, color: "#555" }}>seconds</span>
                      </div>
                    )}
                  </div>
                </div>
                )}

                {/* server.properties */}
              <div style={{ background: "#131313", border: "1px solid #1e1e1e", borderRadius: 12, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 600, color: "#e5e5e5", margin: 0 }}>server.properties</h2>
                  {Object.keys(properties).length > 0 && (
                    <button onClick={() => invoke("set_server_properties", { instanceId: selectedServer, properties })} style={{
                      padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                      background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff", border: "none", cursor: "pointer",
                    }}>Save</button>
                  )}
                </div>
                {Object.keys(properties).length === 0 ? (
                  <p style={{ fontSize: 13, color: "#555" }}>No server.properties found. Start the server first to generate one.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {Object.entries(properties).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => (
                      <div key={key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 12, color: "#888", width: 220, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={key}>{key}</span>
                        <input type="text" value={value} onChange={(e) => setProperties({ ...properties, [key]: e.target.value })} style={{ ...input, flex: 1 }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </div>
              );
            })()}

            {activeTab === "players" && (
              <div style={{ flex: 1, background: "#131313", border: "1px solid #1e1e1e", borderRadius: 12, padding: 20 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: "#e5e5e5", margin: "0 0 12px 0" }}>Online Players</h2>
                {!serverRunning ? (
                  <p style={{ fontSize: 13, color: "#555" }}>Server is offline</p>
                ) : (
                  <p style={{ fontSize: 13, color: "#888" }}>Player tracking from server logs — join/leave events will appear here when the server is running.</p>
                )}
              </div>
            )}

            {activeTab === "backups" && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                <button onClick={() => {
                  invoke("create_backup", { instanceId: selectedServer })
                    .then(() => invoke<any[]>("list_backups", { instanceId: selectedServer }).then(setBackups));
                }} style={{
                  padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                  background: "linear-gradient(135deg, #6366f1, #4f46e5)",
                  color: "#fff", border: "none", cursor: "pointer", alignSelf: "flex-start",
                }}>Create Backup Now</button>

                {backups.length === 0 ? (
                  <div style={{ background: "#131313", border: "1px solid #1e1e1e", borderRadius: 12, padding: "40px 20px", textAlign: "center" }}>
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
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import { useAccentColor } from "../../hooks/useAccentColor";

interface JavaRuntime {
  path: string;
  version: { major: number; minor: number; patch: number };
  vendor: string;
  arch: string;
}

interface InstanceConfig {
  id: string;
  name: string;
  instance_type: string;
  minecraft_version: string;
  fusion_version: string;
  install_status: string;
  java_path: string | null;
  min_memory_mb: number;
  max_memory_mb: number;
  jvm_args: string[];
}

interface ModInfo {
  filename: string;
  mod_id: string;
  name: string;
  version: string;
  description: string;
  authors: string[];
  origin: string;
  enabled: boolean;
  file_size: number;
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 500,
  background: active ? "linear-gradient(135deg, #6366f1, #4f46e5)" : "#1a1a1a",
  color: active ? "#fff" : "#888", border: "none", cursor: "pointer",
});

export default function InstanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [instance, setInstance] = useState<InstanceConfig | null>(null);
  const [mods, setMods] = useState<ModInfo[]>([]);
  const [activeTab, setActiveTab] = useState<"mods" | "config" | "worlds">("mods");
  const [toggling, setToggling] = useState<string | null>(null);
  const [javaRuntimes, setJavaRuntimes] = useState<JavaRuntime[]>([]);
  const [configDirty, setConfigDirty] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadInstance();
    loadMods();
    loadJavaRuntimes();
  }, [id]);

  async function loadInstance() {
    try {
      const list = await invoke<InstanceConfig[]>("list_instances");
      setInstance(list.find(i => i.id === id) || null);
    } catch {}
  }

  async function loadJavaRuntimes() {
    try {
      const runtimes = await invoke<JavaRuntime[]>("detect_java");
      setJavaRuntimes(runtimes);
    } catch {}
  }

  async function saveConfig(patch: {
    java_path?: string | null;
    min_memory_mb?: number;
    max_memory_mb?: number;
    jvm_args?: string[];
  }) {
    if (!id || !instance) return;
    try {
      await invoke("update_instance", {
        instanceId: id,
        javaPath: patch.java_path !== undefined ? (patch.java_path || "") : undefined,
        minMemoryMb: patch.min_memory_mb,
        maxMemoryMb: patch.max_memory_mb,
        jvmArgs: patch.jvm_args,
      });
      await loadInstance();
      setConfigDirty(false);
    } catch (e) { console.error(e); }
  }

  async function loadMods() {
    if (!id) return;
    try {
      const list = await invoke<ModInfo[]>("scan_mods", { instanceId: id });
      setMods(list);
    } catch {}
  }

  async function handleToggle(filename: string, enable: boolean) {
    if (!id) return;
    setToggling(filename);
    try {
      await invoke("toggle_mod", { instanceId: id, filename, enabled: enable });
      await loadMods();
    } catch (e) { console.error(e); }
    setToggling(null);
  }

  if (!instance) {
    return (
      <div style={{ padding: 24, color: "#666" }}>Loading instance...</div>
    );
  }

  const isServer = instance.instance_type === "Server";
  const globalAccent = useAccentColor();
  const accent = isServer ? "#f59e0b" : globalAccent;

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, width: "100%", boxSizing: "border-box", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button onClick={() => navigate("/instances")} style={{
          background: "none", border: "none", color: "#666", cursor: "pointer",
          fontSize: 20, padding: 0,
        }}>&larr;</button>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: `${accent}18`, display: "flex", alignItems: "center", justifyContent: "center",
          color: accent, fontWeight: 700, fontSize: 18,
        }}>{isServer ? "S" : "C"}</div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>{instance.name}</h1>
          <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
            MC {instance.minecraft_version} &middot; Fusion {instance.fusion_version}
            <span style={{
              marginLeft: 8, fontSize: 9, padding: "2px 6px", borderRadius: 4,
              background: `${accent}20`, color: accent, fontWeight: 600,
            }}>{isServer ? "SERVER" : "CLIENT"}</span>
          </div>
        </div>
        <button onClick={() => navigate(`/instances/${id}/mods`)} style={{
          padding: "8px 18px", borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: "linear-gradient(135deg, #22c55e, #16a34a)",
          color: "#fff", border: "none", cursor: "pointer",
        }}>+ Add Mods</button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4 }}>
        {(["mods", "config", "worlds"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={tabStyle(activeTab === tab)}>
            {tab === "mods" ? `Mods (${mods.length})` : tab === "config" ? "Config" : "Worlds"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {activeTab === "mods" && (
          <div>
            {mods.length === 0 ? (
              <div style={{
                background: "#131313", border: "1px solid #1e1e1e", borderRadius: 12,
                padding: "48px 20px", textAlign: "center",
              }}>
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#333" strokeWidth="1.5" style={{ marginBottom: 10 }}>
                  <circle cx="14" cy="14" r="11"/><line x1="14" y1="8" x2="14" y2="20"/><line x1="8" y1="14" x2="20" y2="14"/>
                </svg>
                <p style={{ fontSize: 13, color: "#555", marginBottom: 14 }}>No mods installed</p>
                <button onClick={() => navigate(`/instances/${id}/mods`)} style={{
                  padding: "8px 20px", borderRadius: 8, fontSize: 12, fontWeight: 500,
                  background: "linear-gradient(135deg, #6366f1, #4f46e5)",
                  color: "#fff", border: "none", cursor: "pointer",
                }}>Browse Mods</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {mods.map(mod => (
                  <div key={mod.filename} style={{
                    background: "#131313", border: "1px solid #1e1e1e", borderRadius: 10,
                    padding: "10px 14px", display: "flex", alignItems: "center", gap: 12,
                    opacity: mod.enabled ? 1 : 0.5,
                    transition: "opacity 0.15s, border-color 0.15s",
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e1e1e"; }}
                  >
                    {/* Origin badge */}
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                      background: mod.origin === "fabric" ? "#dbb98f15" : mod.origin === "neoforge" ? "#d4541415" : "#1a1a1a",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                      color: mod.origin === "fabric" ? "#dbb98f" : mod.origin === "neoforge" ? "#d45414" : "#555",
                    }}>{mod.origin.slice(0, 3)}</div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#e5e5e5" }}>{mod.name}</span>
                        <span style={{ fontSize: 10, color: "#555" }}>{mod.version}</span>
                      </div>
                      {mod.description && (
                        <div style={{
                          fontSize: 11, color: "#666", marginTop: 2,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>{mod.description}</div>
                      )}
                      <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>
                        {mod.authors.length > 0 && `by ${mod.authors.join(", ")} · `}
                        {(mod.file_size / 1024).toFixed(0)} KB
                      </div>
                    </div>

                    {/* Toggle + delete */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      {/* Toggle switch */}
                      <div
                        onClick={() => handleToggle(mod.filename, !mod.enabled)}
                        style={{
                          width: 36, height: 20, borderRadius: 10, padding: 2,
                          background: mod.enabled ? "#22c55e" : "#2a2a2a",
                          cursor: toggling === mod.filename ? "wait" : "pointer",
                          transition: "background 0.2s", position: "relative",
                        }}
                      >
                        <div style={{
                          width: 16, height: 16, borderRadius: "50%",
                          background: mod.enabled ? "#fff" : "#666",
                          transform: mod.enabled ? "translateX(16px)" : "translateX(0)",
                          transition: "transform 0.2s, background 0.2s",
                        }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "config" && instance && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Java Runtime */}
            <div style={{ background: "#131313", border: "1px solid #1e1e1e", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#e5e5e5", marginBottom: 10 }}>Java Runtime</div>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 10 }}>
                {instance.java_path ? "Using instance-specific Java" : "Using global Java (from Settings)"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {/* Global default option */}
                <div
                  onClick={() => saveConfig({ java_path: null })}
                  style={{
                    padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                    background: !instance.java_path ? `${accent}18` : "#0f0f0f",
                    border: `1px solid ${!instance.java_path ? `${accent}40` : "#1e1e1e"}`,
                    display: "flex", alignItems: "center", gap: 10,
                    transition: "border-color 0.15s",
                  }}
                >
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: !instance.java_path ? accent : "#333",
                  }} />
                  <div>
                    <div style={{ fontSize: 12, color: "#ccc", fontWeight: 500 }}>Use global default</div>
                    <div style={{ fontSize: 10, color: "#555" }}>Inherits from Settings page</div>
                  </div>
                </div>
                {/* Detected runtimes */}
                {javaRuntimes.map(rt => {
                  const isSelected = instance.java_path === rt.path;
                  const v = rt.version;
                  return (
                    <div
                      key={rt.path}
                      onClick={() => saveConfig({ java_path: rt.path })}
                      style={{
                        padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                        background: isSelected ? `${accent}18` : "#0f0f0f",
                        border: `1px solid ${isSelected ? `${accent}40` : "#1e1e1e"}`,
                        display: "flex", alignItems: "center", gap: 10,
                        transition: "border-color 0.15s",
                      }}
                    >
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: isSelected ? accent : v.major >= 21 ? "#22c55e" : "#f59e0b",
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: "#ccc", fontWeight: 500 }}>
                          Java {v.major}.{v.minor}.{v.patch}
                          <span style={{ color: "#555", fontWeight: 400, marginLeft: 6 }}>{rt.vendor}</span>
                          <span style={{ color: "#444", fontWeight: 400, marginLeft: 4, fontSize: 10 }}>{rt.arch}</span>
                        </div>
                        <div style={{
                          fontSize: 10, color: "#444", marginTop: 1,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>{rt.path}</div>
                      </div>
                    </div>
                  );
                })}
                {javaRuntimes.length === 0 && (
                  <div style={{ fontSize: 11, color: "#555", padding: "8px 0" }}>
                    Detecting Java runtimes...
                  </div>
                )}
              </div>
            </div>

            {/* Memory */}
            <div style={{ background: "#131313", border: "1px solid #1e1e1e", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#e5e5e5", marginBottom: 10 }}>Memory</div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>Min (MB)</label>
                  <input
                    type="number" min={256} step={256}
                    value={instance.min_memory_mb}
                    onChange={e => {
                      const val = parseInt(e.target.value) || 512;
                      setInstance({ ...instance, min_memory_mb: val });
                      setConfigDirty(true);
                    }}
                    onBlur={() => { if (configDirty) saveConfig({ min_memory_mb: instance.min_memory_mb }); }}
                    style={{
                      width: "100%", padding: "7px 10px", borderRadius: 6, fontSize: 13,
                      background: "#0a0a0a", border: "1px solid #1e1e1e", color: "#e5e5e5",
                      outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>Max (MB)</label>
                  <input
                    type="number" min={512} step={256}
                    value={instance.max_memory_mb}
                    onChange={e => {
                      const val = parseInt(e.target.value) || 4096;
                      setInstance({ ...instance, max_memory_mb: val });
                      setConfigDirty(true);
                    }}
                    onBlur={() => { if (configDirty) saveConfig({ max_memory_mb: instance.max_memory_mb }); }}
                    style={{
                      width: "100%", padding: "7px 10px", borderRadius: 6, fontSize: 13,
                      background: "#0a0a0a", border: "1px solid #1e1e1e", color: "#e5e5e5",
                      outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* JVM Arguments */}
            <div style={{ background: "#131313", border: "1px solid #1e1e1e", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#e5e5e5", marginBottom: 10 }}>JVM Arguments</div>
              <textarea
                value={instance.jvm_args.join("\n")}
                placeholder="One argument per line (e.g. -XX:+UseG1GC)"
                onChange={e => {
                  const args = e.target.value.split("\n");
                  setInstance({ ...instance, jvm_args: args });
                  setConfigDirty(true);
                }}
                onBlur={() => {
                  if (configDirty) saveConfig({ jvm_args: instance.jvm_args.filter(a => a.trim()) });
                }}
                rows={3}
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 6, fontSize: 12,
                  background: "#0a0a0a", border: "1px solid #1e1e1e", color: "#e5e5e5",
                  outline: "none", resize: "vertical", fontFamily: "monospace",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>
        )}

        {activeTab === "worlds" && (
          <div style={{
            background: "#131313", border: "1px solid #1e1e1e", borderRadius: 12,
            padding: "40px 20px", textAlign: "center", color: "#555", fontSize: 13,
          }}>
            World management coming soon
          </div>
        )}
      </div>
    </div>
  );
}

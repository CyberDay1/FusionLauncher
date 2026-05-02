import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface InstanceConfig {
  id: string;
  name: string;
  instance_type: string;
  minecraft_version: string;
  fusion_version: string;
  install_status: string | { Failed: string };
  last_played: string | null;
}

const input: React.CSSProperties = {
  background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8,
  padding: "8px 12px", fontSize: 13, color: "#e5e5e5", outline: "none",
  width: "100%", boxSizing: "border-box",
};

const btn: React.CSSProperties = {
  padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
  border: "none", cursor: "pointer", color: "#fff", whiteSpace: "nowrap",
};

export default function InstancesPage() {
  const [instances, setInstances] = useState<InstanceConfig[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("client");
  const [newVersion, setNewVersion] = useState("26.1.2");
  const [installing, setInstalling] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  useEffect(() => {
    loadInstances();
    const unlisten = listen("install-progress", (e: any) => {
      setProgress(`${e.payload.step}: ${e.payload.percent?.toFixed(0)}%`);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  async function loadInstances() {
    try {
      const list = await invoke<InstanceConfig[]>("list_instances");
      setInstances(list);
    } catch {}
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    await invoke("create_instance", { name: newName, instanceType: newType, mcVersion: newVersion });
    setNewName(""); setCreating(false); loadInstances();
  }

  async function handleInstall(id: string) {
    setInstalling(id); setProgress("Starting...");
    try { await invoke("install_instance", { instanceId: id }); setProgress("Complete!"); }
    catch (e: any) { setProgress(`Failed: ${e}`); }
    loadInstances();
    setTimeout(() => { setInstalling(null); setProgress(""); }, 2000);
  }

  async function handleLaunch(id: string) {
    try { await invoke("launch_instance", { instanceId: id }); }
    catch (e: any) { alert(`Launch failed: ${e}`); }
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, width: "100%", boxSizing: "border-box" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>Instances</h1>
        <button onClick={() => setCreating(!creating)}
          style={{ ...btn, background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}>
          + New Instance
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div style={{ background: "#131313", border: "1px solid #1e1e1e", borderRadius: 12, padding: 20 }}>
          <input type="text" placeholder="Instance name" value={newName} autoFocus
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            style={{ ...input, marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 10 }}>
            <select value={newType} onChange={(e) => setNewType(e.target.value)}
              style={{ ...input, width: 120, cursor: "pointer" }}>
              <option value="client">Client</option>
              <option value="server">Server</option>
            </select>
            <input type="text" value={newVersion} placeholder="MC version"
              onChange={(e) => setNewVersion(e.target.value)} style={{ ...input, width: 120 }} />
            <button onClick={handleCreate}
              style={{ ...btn, background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}>
              Create
            </button>
            <button onClick={() => setCreating(false)}
              style={{ ...btn, background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#888" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Instance list */}
      {instances.length === 0 ? (
        <div style={{
          background: "#131313", border: "1px solid #1e1e1e", borderRadius: 12,
          padding: "48px 20px", textAlign: "center",
        }}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="#333" strokeWidth="1.5" style={{ marginBottom: 12 }}>
            <rect x="4" y="4" width="24" height="24" rx="4"/><line x1="16" y1="10" x2="16" y2="22"/><line x1="10" y1="16" x2="22" y2="16"/>
          </svg>
          <p style={{ fontSize: 13, color: "#555", marginBottom: 16 }}>No instances yet. Create one to get started.</p>
          <button onClick={() => setCreating(true)}
            style={{ ...btn, background: "linear-gradient(135deg, #6366f1, #4f46e5)", fontSize: 12 }}>
            + Create Instance
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {instances.map((inst) => {
            const isServer = inst.instance_type === "Server";
            const accent = isServer ? "#f59e0b" : "#6366f1";
            return (
              <div key={inst.id} style={{
                background: "#131313", border: "1px solid #1e1e1e", borderRadius: 10,
                padding: "12px 16px", display: "flex", alignItems: "center", gap: 14,
                transition: "border-color 0.15s", cursor: "pointer",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e1e1e"; }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: `${accent}18`, display: "flex", alignItems: "center", justifyContent: "center",
                  color: accent, fontWeight: 700, fontSize: 16,
                }}>{isServer ? "S" : "C"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#e5e5e5" }}>{inst.name}</span>
                    <span style={{
                      fontSize: 9, padding: "2px 6px", borderRadius: 4,
                      background: `${accent}20`, color: accent, fontWeight: 600,
                    }}>{isServer ? "SERVER" : "CLIENT"}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                    MC {inst.minecraft_version} &middot; Fusion {inst.fusion_version}
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {installing === inst.id ? (
                    <span style={{ fontSize: 11, color: "#f59e0b" }}>{progress}</span>
                  ) : inst.install_status === "Ready" ? (
                    <button onClick={() => handleLaunch(inst.id)}
                      style={{ ...btn, padding: "6px 16px", fontSize: 12, background: "linear-gradient(135deg, #22c55e, #16a34a)" }}>
                      Launch
                    </button>
                  ) : (
                    <button onClick={() => handleInstall(inst.id)}
                      style={{ ...btn, padding: "6px 16px", fontSize: 12, background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}>
                      Install
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

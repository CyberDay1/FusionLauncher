import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAccentColor } from "../../hooks/useAccentColor";
import atomWhite from "../../assets/atom_white.png";

interface UpdateInfo {
  available: boolean;
  latest_version: string;
  current_version: string;
  release_url: string;
  release_notes: string;
}

interface InstanceConfig {
  id: string;
  name: string;
  instance_type: string;
  minecraft_version: string;
  fusion_version: string;
  install_status: string;
  last_played: string | null;
  icon: string | null;
}

export default function HomePage() {
  const accentColor = useAccentColor();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(true);
  const [heroExpanded, setHeroExpanded] = useState(false);
  const [instances, setInstances] = useState<InstanceConfig[]>([]);
  const [launching, setLaunching] = useState("");

  useEffect(() => {
    checkForUpdates();
    loadInstances();
  }, []);

  async function checkForUpdates() {
    setCheckingUpdate(true);
    try {
      const info = await invoke<UpdateInfo>("check_for_updates");
      setUpdateInfo(info);
    } catch { setUpdateInfo(null); }
    setCheckingUpdate(false);
  }

  async function loadInstances() {
    try {
      const list = await invoke<InstanceConfig[]>("list_instances");
      setInstances(list);
    } catch {}
  }

  async function handleQuickPlay(type: string) {
    setLaunching(type);
    try {
      const instanceId = await invoke<string>("quick_play", { instanceType: type });
      // Install if needed
      await invoke("install_instance", { instanceId });
      // Launch
      await invoke("launch_instance", { instanceId });
    } catch (e: any) {
      console.error("Quick play failed:", e);
    }
    setLaunching("");
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, width: "100%", boxSizing: "border-box" }}>
      {/* Update banner */}
      {updateInfo?.available && (
        <div style={{
          background: "linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.04))",
          border: "1px solid rgba(34,197,94,0.25)", borderRadius: 12,
          padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: "#22c55e", fontSize: 18 }}>&#8593;</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>
                Fusion Loader {updateInfo.latest_version} available
              </div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>Current: {updateInfo.current_version}</div>
            </div>
          </div>
          <button style={{
            padding: "6px 16px", borderRadius: 8, fontSize: 13,
            fontWeight: 500, background: "#22c55e", color: "#000", border: "none", cursor: "pointer",
          }}>Update</button>
        </div>
      )}

      {/* Hero — collapsible */}
      <div style={{
        background: `linear-gradient(145deg, ${accentColor}20 0%, ${accentColor}10 40%, #0f0f14 100%)`,
        border: `1px solid ${accentColor}33`, borderRadius: 16,
        padding: heroExpanded ? "28px 32px" : "20px 32px",
        position: "relative", overflow: "hidden",
        transition: "padding 0.2s ease",
      }}>
        {/* Glow */}
        <div style={{
          position: "absolute", top: -60, right: -60, width: 250, height: 250, borderRadius: "50%",
          background: `radial-gradient(circle, ${accentColor}33 0%, transparent 70%)`,
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative" }}>
          {/* Header row — always visible */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 36, height: 36,
                background: accentColor,
                WebkitMaskImage: `url(${atomWhite})`,
                WebkitMaskSize: "contain",
                WebkitMaskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskImage: `url(${atomWhite})`,
                maskSize: "contain",
                maskRepeat: "no-repeat",
                maskPosition: "center",
              }} />
              <h1 style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: 0 }}>Fusion Loader</h1>
            </div>
            <button
              onClick={() => setHeroExpanded(!heroExpanded)}
              style={{
                background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 6,
                padding: "4px 8px", cursor: "pointer", color: "#666", fontSize: 11,
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              {heroExpanded ? "Less" : "More"}
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5"
                style={{ transform: heroExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                <path d="M1 1 L5 5 L9 1" />
              </svg>
            </button>
          </div>

          {/* Description — collapsible */}
          <div style={{
            maxHeight: heroExpanded ? 100 : 0,
            opacity: heroExpanded ? 1 : 0,
            overflow: "hidden",
            transition: "max-height 0.25s ease, opacity 0.2s ease, margin 0.25s ease",
            marginTop: heroExpanded ? 12 : 0,
          }}>
            <p style={{ fontSize: 13, color: "#8b8fa3", maxWidth: 480, lineHeight: 1.6, margin: 0 }}>
              Unified mod loader for Minecraft 26.1+ with built-in performance engine,
              immersive portals, minimap, and chunk claiming.
            </p>
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 10, marginTop: heroExpanded ? 20 : 14 }}>
            <button onClick={() => handleQuickPlay("client")} disabled={!!launching} style={{
              padding: "10px 24px", borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: launching === "client" ? "#333" : `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
              boxShadow: launching ? "none" : `0 4px 20px ${accentColor}59`,
              color: "#fff", border: "none", cursor: launching ? "wait" : "pointer",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <svg width="10" height="12" viewBox="0 0 10 12" fill="white"><path d="M0 0 L10 6 L0 12 Z"/></svg>
              {launching === "client" ? "Launching..." : "Play Client"}
            </button>
            <button onClick={() => handleQuickPlay("server")} disabled={!!launching} style={{
              padding: "10px 24px", borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: launching === "server" ? "#333" : "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#999", cursor: launching ? "wait" : "pointer",
            }}>{launching === "server" ? "Starting..." : "Start Server"}</button>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <StatCard label="MC VERSION" value="26.1.2" color={accentColor} />
        <StatCard label="FUSION" value="0.1.0-alpha" color={accentColor} />
        <StatCard label="INSTANCES" value={String(instances.length)} color="#22c55e" />
        <StatCard label="MODS" value="0" color="#f59e0b" />
      </div>

      {/* Recent Instances */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "#fff", margin: 0 }}>Recent Instances</h2>
          <button style={{
            fontSize: 11, color: accentColor, background: `${accentColor}14`,
            padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer",
          }}>View All</button>
        </div>

        {instances.length === 0 ? (
          <div style={{
            background: "#131313", border: "1px solid #1e1e1e",
            borderRadius: 12, padding: "40px 20px", textAlign: "center",
          }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#333" strokeWidth="1.5" style={{ marginBottom: 10 }}>
              <rect x="2" y="2" width="24" height="24" rx="3"/><line x1="2" y1="14" x2="26" y2="14"/><line x1="14" y1="2" x2="14" y2="26"/>
            </svg>
            <p style={{ fontSize: 13, color: "#555", marginBottom: 14 }}>No instances yet</p>
            <button style={{
              padding: "8px 20px", borderRadius: 8, fontSize: 12, fontWeight: 500,
              background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
              boxShadow: `0 2px 10px ${accentColor}40`,
              color: "#fff", border: "none", cursor: "pointer",
            }}>+ Create Instance</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {instances.map((inst) => (
              <InstanceCard key={inst.id} instance={inst} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        display: "flex", justifyContent: "space-between",
        paddingTop: 8, borderTop: "1px solid #1a1a1a", fontSize: 10, color: "#333",
      }}>
        <span>{checkingUpdate ? "Checking for updates..." : updateInfo?.available ? "Update available" : "Up to date"}</span>
        <span>Fusion Launcher v0.1.0</span>
      </div>
    </div>
  );
}

function InstanceCard({ instance }: { instance: InstanceConfig }) {
  const isServer = instance.instance_type === "Server";
  const globalAccent = useAccentColor();
  const accentColor = isServer ? "#f59e0b" : globalAccent;

  return (
    <div style={{
      background: "#131313", border: "1px solid #1e1e1e", borderRadius: 12,
      padding: 12, display: "flex", alignItems: "center", gap: 14,
      cursor: "pointer", transition: "border-color 0.15s",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e1e1e"; }}
    >
      {/* Screenshot thumbnail or placeholder */}
      <div style={{
        width: 64, height: 40, borderRadius: 6, overflow: "hidden",
        background: "#0a0a0a", border: "1px solid #222",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        {instance.icon ? (
          <img src={instance.icon} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#333" strokeWidth="1">
            <rect x="2" y="2" width="16" height="16" rx="2" />
            <path d="M2 14 L7 9 L10 12 L14 7 L18 11" />
            <circle cx="13" cy="6" r="2" />
          </svg>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#e5e5e5" }}>{instance.name}</span>
          <span style={{
            fontSize: 9, padding: "2px 6px", borderRadius: 4,
            background: `${accentColor}20`, color: accentColor, fontWeight: 600,
          }}>{isServer ? "SERVER" : "CLIENT"}</span>
        </div>
        <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
          MC {instance.minecraft_version} &middot; Fusion {instance.fusion_version}
        </div>
      </div>

      {/* Launch */}
      <button style={{
        padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
        background: instance.install_status === "Ready"
          ? "linear-gradient(135deg, #22c55e, #16a34a)"
          : `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
        color: "#fff", border: "none", cursor: "pointer", flexShrink: 0,
      }}>
        {instance.install_status === "Ready" ? "Launch" : "Install"}
      </button>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: "#131313", border: "1px solid #1e1e1e",
      borderRadius: 12, padding: 14, overflow: "hidden",
    }}>
      <div style={{ fontSize: 10, color: "#555", fontWeight: 600, letterSpacing: "0.05em", marginBottom: 6 }}>{label}</div>
      <div style={{
        fontSize: 20, fontWeight: 700, color,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{value}</div>
    </div>
  );
}

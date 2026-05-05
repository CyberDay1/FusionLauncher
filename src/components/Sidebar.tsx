import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAccentColor } from "../hooks/useAccentColor";

const navItems = [
  { path: "/", label: "Home", icon: "\u2302" },
  { path: "/instances", label: "Instances", icon: "\u25A6" },
  { path: "/mods", label: "Mods", icon: "\u29C9" },
  { path: "/server", label: "Server", icon: "\u2630" },
  { path: "/settings", label: "Settings", icon: "\u2699" },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const accentColor = useAccentColor();
  const [serverRunning, setServerRunning] = useState(false);
  const [instanceCount, setInstanceCount] = useState(0);

  useEffect(() => {
    // Load instance count
    invoke<any[]>("list_instances").then(list => {
      setInstanceCount(list.length);
    }).catch(() => {});

    // Listen for server status
    const unlisten = listen<any>("process-status", (e) => {
      setServerRunning(e.payload.status === "running");
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  return (
    <div
      style={{ width: 192, display: "flex", flexDirection: "column", height: "100%", flexShrink: 0, background: "#111111", borderRight: "1px solid #1e1e1e" }}
    >
      <nav style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path !== "/" && location.pathname.startsWith(item.path));
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                background: isActive ? `linear-gradient(135deg, ${accentColor}cc, ${accentColor})` : "transparent",
                color: isActive ? "#fff" : "#808080", border: "none", cursor: "pointer",
                boxShadow: isActive ? "0 2px 12px rgba(79,70,229,0.3)" : "none",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = "#1a1a1a"; e.currentTarget.style.color = "#d1d5db"; } }}
              onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#808080"; } }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 14, width: 20, textAlign: "center", opacity: isActive ? 1 : 0.6 }}>
                  {item.icon}
                </span>
                {item.label}
              </div>
              {/* Badges */}
              {item.path === "/server" && serverRunning && (
                <div style={{
                  width: 6, height: 6, borderRadius: "50%", background: "#22c55e",
                  boxShadow: "0 0 6px rgba(34,197,94,0.6)",
                }} />
              )}
              {item.path === "/instances" && instanceCount > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 600, color: isActive ? "#fff" : "#555",
                  background: isActive ? "rgba(255,255,255,0.2)" : "#1a1a1a",
                  padding: "1px 6px", borderRadius: 8,
                }}>{instanceCount}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div style={{ padding: "8px 12px", borderTop: "1px solid #1e1e1e" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#4b5563" }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e" }} />
          Ready
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ModrinthProject {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  icon_url: string | null;
  categories: string[];
}

interface InstallResult {
  installed: string[];
  skipped: string[];
  failed: string[];
}

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

const MC_VERSIONS = ["26.1.2", "26.1.1", "26.1", "1.21.5", "1.21.4", "1.21.1", "1.20.4", "1.20.1"];

export default function ModBrowserPage() {
  const [query, setQuery] = useState("");
  const [mcVersion, setMcVersion] = useState("26.1.2");
  const [results, setResults] = useState<ModrinthProject[]>([]);
  const [trending, setTrending] = useState<ModrinthProject[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installMsg, setInstallMsg] = useState("");

  // Load trending on mount and version change
  useEffect(() => {
    loadTrending();
    setSearched(false);
    setResults([]);
  }, [mcVersion]);

  async function loadTrending() {
    try {
      const mods = await invoke<ModrinthProject[]>("get_trending_mods", { mcVersion });
      setTrending(mods);
    } catch (e) { console.error("Trending failed:", e); }
  }

  async function handleSearch() {
    if (!query.trim()) { setSearched(false); return; }
    setSearching(true); setSearched(true);
    try {
      const mods = await invoke<ModrinthProject[]>("search_modrinth", { query, mcVersion });
      setResults(mods);
    } catch (e) { console.error("Search failed:", e); }
    setSearching(false);
  }

  async function handleInstall(projectId: string, _title: string) {
    setInstalling(projectId);
    setInstallMsg("Installing...");
    try {
      // TODO: use actual instance ID once instance selector is wired
      const result = await invoke<InstallResult>("install_mod_with_deps", {
        instanceId: "default",
        projectId,
        mcVersion,
      });
      const parts: string[] = [];
      if (result.installed.length > 0) parts.push(`${result.installed.length} installed`);
      if (result.skipped.length > 0) parts.push(`${result.skipped.length} already present`);
      if (result.failed.length > 0) parts.push(`${result.failed.length} failed`);
      setInstallMsg(parts.join(", ") || "Done");
    } catch (e: any) {
      setInstallMsg(`Error: ${e}`);
    }
    setTimeout(() => { setInstalling(null); setInstallMsg(""); }, 3000);
  }

  const displayMods = searched ? results : trending;
  const sectionTitle = searched ? `Results for "${query}"` : "Popular Mods";

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, width: "100%", boxSizing: "border-box", height: "100%", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>Mod Browser</h1>
        {/* Version selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#666" }}>MC Version:</span>
          <select value={mcVersion} onChange={(e) => setMcVersion(e.target.value)}
            style={{
              background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6,
              padding: "4px 8px", fontSize: 12, color: "#e5e5e5", cursor: "pointer", outline: "none",
            }}>
            {MC_VERSIONS.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ display: "flex", gap: 8 }}>
        <input type="text" placeholder="Search Modrinth for mods..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch();
            if (e.key === "Escape") { setQuery(""); setSearched(false); }
          }}
          style={{
            flex: 1, background: "#131313", border: "1px solid #1e1e1e", borderRadius: 10,
            padding: "10px 16px", fontSize: 13, color: "#e5e5e5", outline: "none",
          }}
        />
        {searched && (
          <button onClick={() => { setQuery(""); setSearched(false); }}
            style={{
              padding: "10px 16px", borderRadius: 10, fontSize: 13,
              background: "#1a1a1a", border: "1px solid #2a2a2a",
              color: "#888", cursor: "pointer",
            }}>Clear</button>
        )}
        <button onClick={handleSearch} disabled={searching}
          style={{
            padding: "10px 24px", borderRadius: 10, fontSize: 13, fontWeight: 600,
            background: searching ? "#333" : "linear-gradient(135deg, #6366f1, #4f46e5)",
            color: "#fff", border: "none", cursor: searching ? "wait" : "pointer",
            whiteSpace: "nowrap",
          }}>
          {searching ? "Searching..." : "Search"}
        </button>
      </div>

      {/* Section header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "#999", margin: 0 }}>{sectionTitle}</h2>
        <span style={{ fontSize: 11, color: "#444" }}>{displayMods.length} mods</span>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {displayMods.length === 0 ? (
          <div style={{
            background: "#131313", border: "1px solid #1e1e1e", borderRadius: 12,
            padding: "48px 20px", textAlign: "center",
          }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#333" strokeWidth="1.5" style={{ marginBottom: 10 }}>
              <circle cx="12" cy="12" r="9"/><line x1="18" y1="18" x2="25" y2="25"/>
            </svg>
            <p style={{ fontSize: 13, color: "#555" }}>
              {searching ? "Searching..." : searched ? "No results found" : "Loading popular mods..."}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {displayMods.map((mod) => (
              <ModCard
                key={mod.project_id}
                mod={mod}
                installing={installing === mod.project_id}
                installMsg={installing === mod.project_id ? installMsg : ""}
                onInstall={() => handleInstall(mod.project_id, mod.title)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ModCard({ mod, installing, installMsg, onInstall }: {
  mod: ModrinthProject;
  installing: boolean;
  installMsg: string;
  onInstall: () => void;
}) {
  return (
    <div style={{
      background: "#131313", border: "1px solid #1e1e1e", borderRadius: 10,
      padding: 14, display: "flex", gap: 14, alignItems: "flex-start",
      transition: "border-color 0.15s",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e1e1e"; }}
    >
      {/* Icon */}
      {mod.icon_url ? (
        <img src={mod.icon_url} alt="" style={{
          width: 44, height: 44, borderRadius: 8, flexShrink: 0, objectFit: "cover",
        }} />
      ) : (
        <div style={{
          width: 44, height: 44, borderRadius: 8, flexShrink: 0,
          background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center",
          color: "#444", fontSize: 18, fontWeight: 700,
        }}>{mod.title.charAt(0)}</div>
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#e5e5e5" }}>{mod.title}</span>
          <span style={{ fontSize: 11, color: "#555" }}>by {mod.author}</span>
        </div>
        <p style={{
          fontSize: 12, color: "#777", marginTop: 4, lineHeight: 1.4,
          overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        }}>{mod.description}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
          <span style={{ fontSize: 10, color: "#555" }}>
            {formatDownloads(mod.downloads)} downloads
          </span>
          {mod.categories.slice(0, 3).map((cat) => (
            <span key={cat} style={{
              fontSize: 9, padding: "2px 8px", borderRadius: 10,
              background: "#1a1a1a", color: "#666",
            }}>{cat}</span>
          ))}
        </div>
      </div>

      {/* Install button */}
      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        {installing ? (
          <span style={{ fontSize: 11, color: "#f59e0b", whiteSpace: "nowrap" }}>{installMsg}</span>
        ) : (
          <button onClick={onInstall} style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 600,
            background: "linear-gradient(135deg, #22c55e, #16a34a)",
            color: "#fff", border: "none", cursor: "pointer", whiteSpace: "nowrap",
          }}>Install</button>
        )}
      </div>
    </div>
  );
}

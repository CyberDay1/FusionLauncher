import { useEffect, useRef, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useParams, useNavigate } from "react-router";
import { useAccentColor } from "../../hooks/useAccentColor";
import ModDetailPanel from "./ModDetailPanel";

interface InstanceConfig {
  id: string;
  name: string;
  instance_type: string;
  minecraft_version: string;
}

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

interface SearchResult {
  mods: ModrinthProject[];
  total_hits: number;
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
  const { id: routeInstanceId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const accentColor = useAccentColor();
  const [query, setQuery] = useState("");
  const [mcVersion, setMcVersion] = useState("26.1.2");
  const [mods, setMods] = useState<ModrinthProject[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installMsg, setInstallMsg] = useState("");
  const [selectedMod, setSelectedMod] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Instance management
  const [instances, setInstances] = useState<InstanceConfig[]>([]);
  const [targetInstance, setTargetInstance] = useState<string>(routeInstanceId || "");

  useEffect(() => {
    invoke<InstanceConfig[]>("list_instances").then(list => {
      setInstances(list);
      if (routeInstanceId) {
        setTargetInstance(routeInstanceId);
        const inst = list.find(i => i.id === routeInstanceId);
        if (inst) setMcVersion(inst.minecraft_version);
      } else if (list.length > 0 && !targetInstance) {
        setTargetInstance(list[0].id);
      }
    }).catch(() => {});
  }, []);

  // Load trending on mount and version change
  useEffect(() => {
    setMods([]);
    setSearched(false);
    setQuery("");
    loadTrending(0, false);
  }, [mcVersion]);

  async function loadTrending(offset: number, append: boolean) {
    if (offset === 0) setSearching(true);
    else setLoadingMore(true);
    try {
      const result = await invoke<SearchResult>("get_trending_mods", { mcVersion, offset });
      setMods(prev => append ? [...prev, ...result.mods] : result.mods);
      setTotalHits(result.total_hits);
    } catch (e) { console.error("Trending failed:", e); }
    setSearching(false);
    setLoadingMore(false);
  }

  async function handleSearch(offset: number, append: boolean) {
    if (!query.trim()) { setSearched(false); loadTrending(0, false); return; }
    if (offset === 0) { setSearching(true); setSearched(true); }
    else setLoadingMore(true);
    try {
      const result = await invoke<SearchResult>("search_modrinth", { query, mcVersion, offset });
      setMods(prev => append ? [...prev, ...result.mods] : result.mods);
      setTotalHits(result.total_hits);
    } catch (e) { console.error("Search failed:", e); }
    setSearching(false);
    setLoadingMore(false);
  }

  function loadMore() {
    const offset = mods.length;
    if (searched) handleSearch(offset, true);
    else loadTrending(offset, true);
  }

  // Infinite scroll detection
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loadingMore || searching) return;
    if (mods.length >= totalHits) return;
    // Trigger when within 200px of bottom
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      loadMore();
    }
  }, [mods.length, totalHits, loadingMore, searching, searched, query]);

  async function handleInstall(projectId: string) {
    setInstalling(projectId);
    setInstallMsg("Installing...");
    try {
      const result = await invoke<InstallResult>("install_mod_with_deps", {
        instanceId: targetInstance || "default", projectId, mcVersion,
      });
      const parts: string[] = [];
      if (result.installed.length > 0) parts.push(`${result.installed.length} installed`);
      if (result.skipped.length > 0) parts.push(`${result.skipped.length} present`);
      if (result.failed.length > 0) parts.push(`${result.failed.length} failed`);
      setInstallMsg(parts.join(", ") || "Done");
    } catch (e: any) { setInstallMsg(`Error: ${e}`); }
    setTimeout(() => { setInstalling(null); setInstallMsg(""); }, 3000);
  }

  const hasMore = mods.length < totalHits;
  const sectionTitle = searched ? `Results for "${query}"` : "Popular Mods";

  // Show detail panel when a mod is selected
  if (selectedMod) {
    return (
      <ModDetailPanel
        projectId={selectedMod}
        mcVersion={mcVersion}
        onClose={() => setSelectedMod(null)}
      />
    );
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, width: "100%", boxSizing: "border-box", height: "100%", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {routeInstanceId && (
            <button onClick={() => navigate(`/instances/${routeInstanceId}`)} style={{
              background: "none", border: "none", color: "#666", cursor: "pointer",
              fontSize: 18, padding: 0,
            }}>&larr;</button>
          )}
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>Mod Browser</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Instance selector */}
          {instances.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "#555" }}>Install to:</span>
              <select value={targetInstance}
                onChange={(e) => {
                  setTargetInstance(e.target.value);
                  const inst = instances.find(i => i.id === e.target.value);
                  if (inst) setMcVersion(inst.minecraft_version);
                }}
                style={{
                  background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6,
                  padding: "4px 8px", fontSize: 12, color: "#e5e5e5", cursor: "pointer", outline: "none",
                  maxWidth: 150,
                }}>
                {instances.map(i => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>
          )}
          {/* MC version */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "#555" }}>MC:</span>
            <select value={mcVersion} onChange={(e) => setMcVersion(e.target.value)}
              style={{
                background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6,
                padding: "4px 8px", fontSize: 12, color: "#e5e5e5", cursor: "pointer", outline: "none",
              }}>
              {MC_VERSIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ display: "flex", gap: 8 }}>
        <input type="text" placeholder="Search Modrinth for mods..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch(0, false);
            if (e.key === "Escape") { setQuery(""); setSearched(false); loadTrending(0, false); }
          }}
          style={{
            flex: 1, background: "#131313", border: "1px solid #1e1e1e", borderRadius: 10,
            padding: "10px 16px", fontSize: 13, color: "#e5e5e5", outline: "none",
          }}
        />
        {searched && (
          <button onClick={() => { setQuery(""); setSearched(false); loadTrending(0, false); }}
            style={{
              padding: "10px 16px", borderRadius: 10, fontSize: 13,
              background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#888", cursor: "pointer",
            }}>Clear</button>
        )}
        <button onClick={() => handleSearch(0, false)} disabled={searching}
          style={{
            padding: "10px 24px", borderRadius: 10, fontSize: 13, fontWeight: 600,
            background: searching ? "#333" : `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
            color: "#fff", border: "none", cursor: searching ? "wait" : "pointer", whiteSpace: "nowrap",
          }}>
          {searching ? "Searching..." : "Search"}
        </button>
      </div>

      {/* Section header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "#999", margin: 0 }}>{sectionTitle}</h2>
        <span style={{ fontSize: 11, color: "#444" }}>
          {mods.length} of {totalHits.toLocaleString()} mods
        </span>
      </div>

      {/* Results with scroll */}
      <div ref={scrollRef} onScroll={handleScroll}
        style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {mods.length === 0 && !searching ? (
          <div style={{
            background: "#131313", border: "1px solid #1e1e1e", borderRadius: 12,
            padding: "48px 20px", textAlign: "center",
          }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#333" strokeWidth="1.5" style={{ marginBottom: 10 }}>
              <circle cx="12" cy="12" r="9"/><line x1="18" y1="18" x2="25" y2="25"/>
            </svg>
            <p style={{ fontSize: 13, color: "#555" }}>
              {searched ? "No results found" : "Loading popular mods..."}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {mods.map((mod) => (
              <ModCard key={mod.project_id} mod={mod}
                installing={installing === mod.project_id}
                installMsg={installing === mod.project_id ? installMsg : ""}
                onInstall={() => handleInstall(mod.project_id)}
                onSelect={() => setSelectedMod(mod.project_id)}
              />
            ))}

            {/* Load more / end indicator */}
            {loadingMore ? (
              <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "#555" }}>
                Loading more...
              </div>
            ) : hasMore ? (
              <button onClick={loadMore} style={{
                padding: "12px 0", borderRadius: 10, fontSize: 13, fontWeight: 500,
                background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#888",
                cursor: "pointer", width: "100%", marginTop: 4,
              }}>
                Load More ({totalHits - mods.length} remaining)
              </button>
            ) : mods.length > 0 ? (
              <div style={{ padding: 16, textAlign: "center", fontSize: 11, color: "#333" }}>
                End of results
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function ModCard({ mod, installing, installMsg, onInstall, onSelect }: {
  mod: ModrinthProject; installing: boolean; installMsg: string; onInstall: () => void; onSelect: () => void;
}) {
  return (
    <div style={{
      background: "#131313", border: "1px solid #1e1e1e", borderRadius: 10,
      padding: 14, display: "flex", gap: 14, alignItems: "flex-start",
      transition: "border-color 0.15s", cursor: "pointer",
    }}
      onClick={onSelect}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e1e1e"; }}
    >
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: "#555" }}>
            {formatDownloads(mod.downloads)} downloads
          </span>
          {mod.categories.slice(0, 3).map((cat) => (
            <span key={cat} style={{
              fontSize: 9, padding: "2px 8px", borderRadius: 10, background: "#1a1a1a", color: "#666",
            }}>{cat}</span>
          ))}
        </div>
      </div>
      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        {installing ? (
          <span style={{ fontSize: 11, color: "#f59e0b", whiteSpace: "nowrap", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>{installMsg}</span>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); onInstall(); }} style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 600,
            background: "linear-gradient(135deg, #22c55e, #16a34a)",
            color: "#fff", border: "none", cursor: "pointer", whiteSpace: "nowrap",
          }}>Install</button>
        )}
      </div>
    </div>
  );
}

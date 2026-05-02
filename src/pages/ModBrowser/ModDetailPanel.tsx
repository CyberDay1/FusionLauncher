import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ModDetail {
  id: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  icon_url: string | null;
  downloads: number;
  followers: number;
  categories: string[];
  client_side: string;
  server_side: string;
  license: { id: string | null; name: string | null } | null;
  source_url: string | null;
  issues_url: string | null;
  wiki_url: string | null;
  discord_url: string | null;
  gallery: { url: string; title: string | null }[] | null;
  published: string;
  updated: string;
}

interface ModVersion {
  id: string;
  project_id: string;
  version_number: string;
  name: string;
  game_versions: string[];
  loaders: string[];
  files: { url: string; filename: string; size: number; primary: boolean }[];
  dependencies: { version_id: string | null; project_id: string | null; dependency_type: string }[];
}

interface InstallResult {
  installed: string[];
  skipped: string[];
  failed: string[];
}

function formatBytes(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default function ModDetailPanel({ projectId, mcVersion, onClose }: {
  projectId: string; mcVersion: string; onClose: () => void;
}) {
  const [detail, setDetail] = useState<ModDetail | null>(null);
  const [versions, setVersions] = useState<ModVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installMsg, setInstallMsg] = useState("");
  const [activeTab, setActiveTab] = useState<"about" | "versions" | "gallery">("about");

  useEffect(() => {
    setLoading(true);
    setActiveTab("about");
    Promise.all([
      invoke<ModDetail>("get_mod_detail", { projectId }),
      invoke<ModVersion[]>("get_mod_versions", { projectId, mcVersion }),
    ]).then(([d, v]) => {
      setDetail(d);
      setVersions(v);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [projectId, mcVersion]);

  async function handleInstallVersion(versionId: string) {
    setInstalling(versionId);
    setInstallMsg("Installing...");
    try {
      const result = await invoke<InstallResult>("install_mod_with_deps", {
        instanceId: "default", projectId, mcVersion,
      });
      const parts: string[] = [];
      if (result.installed.length > 0) parts.push(`${result.installed.length} installed`);
      if (result.skipped.length > 0) parts.push(`${result.skipped.length} present`);
      if (result.failed.length > 0) parts.push(`${result.failed.length} failed`);
      setInstallMsg(parts.join(", "));
    } catch (e: any) { setInstallMsg(`Error: ${e}`); }
    setTimeout(() => { setInstalling(null); setInstallMsg(""); }, 3000);
  }

  if (loading) {
    return (
      <div style={panelStyle}>
        <div style={{ padding: 24, color: "#666", fontSize: 13 }}>Loading mod details...</div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div style={panelStyle}>
        <div style={{ padding: 24, color: "#666", fontSize: 13 }}>Failed to load mod details.</div>
      </div>
    );
  }

  const reqDeps = versions[0]?.dependencies.filter(d => d.dependency_type === "required") || [];

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "flex-start", gap: 14 }}>
        <button onClick={onClose} style={{
          background: "none", border: "none", color: "#666", cursor: "pointer",
          fontSize: 18, padding: 0, lineHeight: 1, flexShrink: 0, marginTop: 2,
        }}>&larr;</button>
        {detail.icon_url && (
          <img src={detail.icon_url} alt="" style={{ width: 48, height: 48, borderRadius: 10, flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: 0 }}>{detail.title}</h2>
          <p style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{detail.description}</p>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ padding: "10px 20px", display: "flex", gap: 16, borderBottom: "1px solid #1e1e1e", fontSize: 11, color: "#666" }}>
        <span>{formatDownloads(detail.downloads)} downloads</span>
        <span>{detail.followers.toLocaleString()} followers</span>
        <span>{detail.client_side} / {detail.server_side}</span>
        {detail.license?.name && <span>{detail.license.name}</span>}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, padding: "8px 20px", borderBottom: "1px solid #1e1e1e" }}>
        {(["about", "versions", "gallery"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 500,
            background: activeTab === tab ? "#6366f1" : "transparent",
            color: activeTab === tab ? "#fff" : "#888",
            border: "none", cursor: "pointer", textTransform: "capitalize",
          }}>{tab} {tab === "versions" ? `(${versions.length})` : ""}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>

        {activeTab === "about" && (
          <div>
            {/* Categories */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
              {detail.categories.map(cat => (
                <span key={cat} style={{
                  fontSize: 10, padding: "3px 10px", borderRadius: 10,
                  background: "#1a1a1a", color: "#888",
                }}>{cat}</span>
              ))}
            </div>

            {/* Dependencies */}
            {reqDeps.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 12, fontWeight: 600, color: "#999", marginBottom: 8 }}>
                  Required Dependencies ({reqDeps.length})
                </h3>
                {reqDeps.map((dep, i) => (
                  <div key={i} style={{
                    fontSize: 11, color: "#f59e0b", padding: "4px 0",
                  }}>
                    {dep.project_id || dep.version_id || "unknown"} (auto-installed)
                  </div>
                ))}
              </div>
            )}

            {/* Links */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {detail.source_url && <ExtLink label="Source Code" url={detail.source_url} />}
              {detail.issues_url && <ExtLink label="Issue Tracker" url={detail.issues_url} />}
              {detail.wiki_url && <ExtLink label="Wiki" url={detail.wiki_url} />}
              {detail.discord_url && <ExtLink label="Discord" url={detail.discord_url} />}
              <ExtLink label="Modrinth Page" url={`https://modrinth.com/mod/${detail.slug}`} />
            </div>

            {/* Dates */}
            <div style={{ fontSize: 11, color: "#444" }}>
              <div>Published: {formatDate(detail.published)}</div>
              <div>Updated: {formatDate(detail.updated)}</div>
            </div>

            {/* Body (markdown — render as plain text for now) */}
            <div style={{
              marginTop: 16, padding: 16, background: "#0f0f0f", borderRadius: 10,
              border: "1px solid #1a1a1a", fontSize: 12, color: "#999", lineHeight: 1.7,
              whiteSpace: "pre-wrap", maxHeight: 300, overflowY: "auto",
            }}>
              {detail.body.slice(0, 2000)}{detail.body.length > 2000 ? "..." : ""}
            </div>
          </div>
        )}

        {activeTab === "versions" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {versions.length === 0 ? (
              <div style={{ fontSize: 13, color: "#555", padding: 20, textAlign: "center" }}>
                No versions for MC {mcVersion}
              </div>
            ) : versions.map(ver => {
              const file = ver.files.find(f => f.primary) || ver.files[0];
              return (
                <div key={ver.id} style={{
                  background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 10,
                  padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#e5e5e5" }}>
                        {ver.version_number}
                      </span>
                      {ver.loaders.map(l => (
                        <span key={l} style={{
                          fontSize: 9, padding: "2px 6px", borderRadius: 4,
                          background: l === "fabric" ? "#dbb98f20" : l === "neoforge" ? "#d4541420" : "#33333340",
                          color: l === "fabric" ? "#dbb98f" : l === "neoforge" ? "#d45414" : "#888",
                          fontWeight: 600, textTransform: "capitalize",
                        }}>{l}</span>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
                      {ver.name !== ver.version_number ? ver.name : ""}
                    </div>
                    <div style={{ fontSize: 10, color: "#444", marginTop: 4, display: "flex", gap: 12 }}>
                      <span>MC: {ver.game_versions.slice(0, 3).join(", ")}{ver.game_versions.length > 3 ? "..." : ""}</span>
                      {file && <span>{formatBytes(file.size)}</span>}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    {installing === ver.id ? (
                      <span style={{ fontSize: 11, color: "#f59e0b" }}>{installMsg}</span>
                    ) : (
                      <button onClick={() => handleInstallVersion(ver.id)} style={{
                        padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                        background: "linear-gradient(135deg, #22c55e, #16a34a)",
                        color: "#fff", border: "none", cursor: "pointer",
                      }}>Install</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "gallery" && (
          <div>
            {(!detail.gallery || detail.gallery.length === 0) ? (
              <div style={{ fontSize: 13, color: "#555", padding: 20, textAlign: "center" }}>
                No gallery images
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {detail.gallery.map((img, i) => (
                  <div key={i}>
                    <img src={img.url} alt={img.title || ""} style={{
                      width: "100%", borderRadius: 8, border: "1px solid #1e1e1e",
                    }} />
                    {img.title && <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{img.title}</div>}
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

function ExtLink({ label, url }: { label: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{
      fontSize: 12, color: "#6366f1", textDecoration: "none",
      display: "flex", alignItems: "center", gap: 6,
    }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 1 H9 V6" /><path d="M9 1 L3 7" />
      </svg>
      {label}
    </a>
  );
}

const panelStyle: React.CSSProperties = {
  width: "100%", height: "100%", display: "flex", flexDirection: "column",
  background: "#111", overflow: "hidden",
};

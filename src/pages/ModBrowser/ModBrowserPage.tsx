import { useState } from "react";
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

export default function ModBrowserPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ModrinthProject[]>([]);
  const [searching, setSearching] = useState(false);

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const mods = await invoke<ModrinthProject[]>("search_modrinth", {
        query: query,
        mcVersion: "26.1.2",
      });
      setResults(mods);
    } catch (e: any) {
      console.error("Search failed:", e);
    }
    setSearching(false);
  }

  function formatDownloads(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Mod Browser</h1>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search Modrinth..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={handleSearch}
          disabled={searching}
          className="px-6 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {searching ? "Searching..." : "Search"}
        </button>
      </div>

      {results.length === 0 ? (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-12 text-center text-gray-500">
          {query ? "No results found" : "Search for mods on Modrinth"}
        </div>
      ) : (
        <div className="space-y-2">
          {results.map((mod) => (
            <div
              key={mod.project_id}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4 flex items-start gap-4 hover:border-[var(--border-light)] transition-colors"
            >
              {mod.icon_url ? (
                <img src={mod.icon_url} alt="" className="w-12 h-12 rounded-lg" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center text-lg font-bold text-gray-600">
                  {mod.title.charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold truncate">{mod.title}</span>
                  <span className="text-xs text-gray-500">by {mod.author}</span>
                </div>
                <p className="text-sm text-gray-400 mt-1 line-clamp-2">{mod.description}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs text-gray-500">
                    {formatDownloads(mod.downloads)} downloads
                  </span>
                  {mod.categories.slice(0, 3).map((cat) => (
                    <span key={cat} className="text-[10px] px-2 py-0.5 bg-[var(--bg-tertiary)] text-gray-400 rounded-full">
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
              <button className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs rounded-lg transition-colors whitespace-nowrap">
                Install
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

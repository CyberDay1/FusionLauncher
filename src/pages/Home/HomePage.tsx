export default function HomePage() {
  return (
    <div className="p-6 space-y-6">
      {/* Hero section */}
      <div className="bg-gradient-to-br from-indigo-600/20 to-purple-600/10 border border-indigo-500/20 rounded-xl p-8">
        <h1 className="text-3xl font-bold mb-2">Fusion Loader</h1>
        <p className="text-gray-400 mb-6">
          Unified mod loader for Minecraft 26.1+ with built-in performance engine,
          immersive portals, minimap, and chunk claiming.
        </p>
        <div className="flex gap-3">
          <button className="px-6 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold rounded-lg transition-colors shadow-lg shadow-indigo-500/25">
            Play Client
          </button>
          <button className="px-6 py-2.5 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-gray-300 font-semibold rounded-lg border border-[var(--border)] transition-colors">
            Start Server
          </button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="MC Version" value="26.1.2" />
        <StatCard label="Fusion Version" value="0.1.0-alpha.1" />
        <StatCard label="Instances" value="0" />
        <StatCard label="Mods Installed" value="0" />
      </div>

      {/* Instances */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Recent Instances</h2>
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-8 text-center text-gray-500">
          <p className="mb-3">No instances yet</p>
          <button className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm rounded-lg transition-colors">
            Create Instance
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

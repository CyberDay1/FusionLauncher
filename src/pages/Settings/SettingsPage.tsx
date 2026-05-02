export default function SettingsPage() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Java Settings */}
      <section className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-5 space-y-4">
        <h2 className="text-lg font-semibold">Java Runtime</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Java Path</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Auto-detect"
                className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-[var(--accent)]"
                readOnly
              />
              <button className="px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg text-sm text-gray-400 hover:text-gray-200 hover:border-[var(--border-light)] transition-colors">
                Browse
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Status</label>
            <div className="flex items-center gap-2 py-2">
              <div className="w-2 h-2 rounded-full bg-yellow-500" />
              <span className="text-sm text-yellow-400">Not configured</span>
            </div>
          </div>
        </div>
      </section>

      {/* Memory Settings */}
      <section className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-5 space-y-4">
        <h2 className="text-lg font-semibold">Memory</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Minimum (MB)</label>
            <input
              type="number"
              defaultValue={512}
              min={256}
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Maximum (MB)</label>
            <input
              type="number"
              defaultValue={4096}
              min={512}
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>
      </section>

      {/* Launcher Behavior */}
      <section className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-5 space-y-4">
        <h2 className="text-lg font-semibold">Launcher Behavior</h2>
        <ToggleSetting label="Close launcher when game starts" defaultChecked={false} />
        <ToggleSetting label="Minimize to system tray" defaultChecked={true} />
        <ToggleSetting label="Check for updates on startup" defaultChecked={true} />
      </section>
    </div>
  );
}

function ToggleSetting({ label, defaultChecked }: { label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-sm text-gray-300">{label}</span>
      <div className="relative">
        <input type="checkbox" defaultChecked={defaultChecked} className="sr-only peer" />
        <div className="w-10 h-5 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-full peer-checked:bg-[var(--accent)] transition-colors" />
        <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-gray-400 rounded-full peer-checked:translate-x-5 peer-checked:bg-white transition-transform" />
      </div>
    </label>
  );
}

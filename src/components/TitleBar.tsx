import { getCurrentWindow } from "@tauri-apps/api/window";

const appWindow = getCurrentWindow();

export default function TitleBar() {
  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between h-9 bg-[#0a0a0a] border-b border-[var(--border)] px-3 select-none"
    >
      {/* App title */}
      <div className="flex items-center gap-2" data-tauri-drag-region>
        <div className="w-4 h-4 bg-[var(--accent)] rounded-sm" />
        <span className="text-xs font-semibold tracking-wide text-gray-300">
          FUSION LAUNCHER
        </span>
        <span className="text-[10px] text-gray-600 ml-1">v0.1.0</span>
      </div>

      {/* Window controls */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => appWindow.minimize()}
          className="w-8 h-7 flex items-center justify-center hover:bg-[var(--bg-hover)] rounded text-gray-500 hover:text-gray-300 transition-colors"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
            <rect width="10" height="1" />
          </svg>
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          className="w-8 h-7 flex items-center justify-center hover:bg-[var(--bg-hover)] rounded text-gray-500 hover:text-gray-300 transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="0.5" y="0.5" width="9" height="9" />
          </svg>
        </button>
        <button
          onClick={() => appWindow.close()}
          className="w-8 h-7 flex items-center justify-center hover:bg-red-600 rounded text-gray-500 hover:text-white transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.5">
            <line x1="1" y1="1" x2="9" y2="9" />
            <line x1="9" y1="1" x2="1" y2="9" />
          </svg>
        </button>
      </div>
    </div>
  );
}

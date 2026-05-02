import { useLocation, useNavigate } from "react-router";

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const navItems: NavItem[] = [
  { path: "/", label: "Home", icon: "H" },
  { path: "/instances", label: "Instances", icon: "I" },
  { path: "/mods", label: "Mods", icon: "M" },
  { path: "/server", label: "Server", icon: "S" },
  { path: "/settings", label: "Settings", icon: "G" },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="w-52 bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col h-full">
      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                ${isActive
                  ? "bg-[var(--accent)] text-white shadow-lg shadow-indigo-500/20"
                  : "text-gray-400 hover:text-gray-200 hover:bg-[var(--bg-hover)]"
                }`}
            >
              <span className={`w-6 h-6 flex items-center justify-center rounded text-xs font-bold
                ${isActive ? "bg-white/20" : "bg-[var(--bg-tertiary)]"}`}>
                {item.icon}
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Status bar */}
      <div className="p-3 border-t border-[var(--border)]">
        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span>Ready</span>
        </div>
      </div>
    </div>
  );
}

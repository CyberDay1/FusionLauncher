import { useLocation, useNavigate } from "react-router";

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

  return (
    <div
      className="w-48 flex flex-col h-full shrink-0"
      style={{ background: "#111111", borderRight: "1px solid #1e1e1e" }}
    >
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all cursor-pointer"
              style={{
                background: isActive ? "linear-gradient(135deg, #4f46e5, #6366f1)" : "transparent",
                color: isActive ? "#fff" : "#808080",
                boxShadow: isActive ? "0 2px 16px rgba(79,70,229,0.35)" : "none",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "#1a1a1a";
                  e.currentTarget.style.color = "#d1d5db";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "#808080";
                }
              }}
            >
              <span style={{ fontSize: "14px", width: "20px", textAlign: "center", opacity: isActive ? 1 : 0.6 }}>
                {item.icon}
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="px-3 py-3" style={{ borderTop: "1px solid #1e1e1e" }}>
        <div className="flex items-center gap-2" style={{ fontSize: "10px", color: "#4b5563" }}>
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#22c55e" }} />
          Ready
        </div>
      </div>
    </div>
  );
}

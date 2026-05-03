import { ReactNode } from "react";
import TitleBar from "./TitleBar";
import Sidebar from "./Sidebar";
import AccountBadge from "./AccountBadge";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <TitleBar />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Sidebar />
        <div style={{ flex: 1, width: 0, display: "flex", flexDirection: "column", position: "relative" }}>
          {/* Account badge — top right, floating over content */}
          <div style={{
            position: "absolute", top: 16, right: 24, zIndex: 10,
          }}>
            <AccountBadge />
          </div>
          <main style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            background: "#0c0c0c",
          }}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

import { ReactNode } from "react";
import TitleBar from "./TitleBar";
import Sidebar from "./Sidebar";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <TitleBar />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Sidebar />
        <main style={{
          flex: 1,
          width: 0,
          overflowY: "auto",
          overflowX: "hidden",
          background: "#0c0c0c",
        }}>
          {children}
        </main>
      </div>
    </div>
  );
}

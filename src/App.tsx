import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router";
import { invoke } from "@tauri-apps/api/core";
import { AccentColorContext } from "./hooks/useAccentColor";
import Layout from "./components/Layout";
import HomePage from "./pages/Home/HomePage";
import InstancesPage from "./pages/Instances/InstancesPage";
import InstanceDetailPage from "./pages/Instances/InstanceDetailPage";
import ModBrowserPage from "./pages/ModBrowser/ModBrowserPage";
import ServerPage from "./pages/Server/ServerPage";
import SettingsPage from "./pages/Settings/SettingsPage";

interface LauncherSettings {
  accent_color?: string;
}

function App() {
  const [accentColor, setAccentColor] = useState("#6366f1");

  useEffect(() => {
    invoke<LauncherSettings>("get_settings").then(s => {
      if (s.accent_color) setAccentColor(s.accent_color);
    }).catch(() => {});

    // Listen for settings changes from Settings page
    const handler = (e: CustomEvent<string>) => setAccentColor(e.detail);
    window.addEventListener("accent-color-changed" as any, handler as any);
    return () => window.removeEventListener("accent-color-changed" as any, handler as any);
  }, []);

  return (
    <AccentColorContext.Provider value={accentColor}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/instances" element={<InstancesPage />} />
            <Route path="/instances/:id" element={<InstanceDetailPage />} />
            <Route path="/instances/:id/mods" element={<ModBrowserPage />} />
            <Route path="/mods" element={<ModBrowserPage />} />
            <Route path="/server" element={<ServerPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AccentColorContext.Provider>
  );
}

export default App;

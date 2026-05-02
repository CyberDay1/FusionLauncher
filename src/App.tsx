import { BrowserRouter, Routes, Route } from "react-router";
import Layout from "./components/Layout";
import HomePage from "./pages/Home/HomePage";
import InstancesPage from "./pages/Instances/InstancesPage";
import InstanceDetailPage from "./pages/Instances/InstanceDetailPage";
import ModBrowserPage from "./pages/ModBrowser/ModBrowserPage";
import ServerPage from "./pages/Server/ServerPage";
import SettingsPage from "./pages/Settings/SettingsPage";

function App() {
  return (
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
  );
}

export default App;

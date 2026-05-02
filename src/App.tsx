import { BrowserRouter, Routes, Route } from "react-router";
import Layout from "./components/Layout";
import HomePage from "./pages/Home/HomePage";
import SettingsPage from "./pages/Settings/SettingsPage";

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/instances" element={<div className="p-6 text-gray-400">Instances — coming soon</div>} />
          <Route path="/mods" element={<div className="p-6 text-gray-400">Mod Browser — coming soon</div>} />
          <Route path="/server" element={<div className="p-6 text-gray-400">Server Panel — coming soon</div>} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;

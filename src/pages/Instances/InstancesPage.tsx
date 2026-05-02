import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface InstanceConfig {
  id: string;
  name: string;
  instance_type: string;
  minecraft_version: string;
  fusion_version: string;
  install_status: string | { Failed: string };
  last_played: string | null;
}

export default function InstancesPage() {
  const [instances, setInstances] = useState<InstanceConfig[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("client");
  const [newVersion, setNewVersion] = useState("26.1.2");
  const [installing, setInstalling] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  useEffect(() => {
    loadInstances();
    const unlisten = listen("install-progress", (e: any) => {
      setProgress(`${e.payload.step}: ${e.payload.percent?.toFixed(0)}%`);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  async function loadInstances() {
    const list = await invoke<InstanceConfig[]>("list_instances");
    setInstances(list);
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    await invoke("create_instance", {
      name: newName,
      instanceType: newType,
      mcVersion: newVersion,
    });
    setNewName("");
    setCreating(false);
    loadInstances();
  }

  async function handleInstall(id: string) {
    setInstalling(id);
    setProgress("Starting...");
    try {
      await invoke("install_instance", { instanceId: id });
      setProgress("Complete!");
    } catch (e: any) {
      setProgress(`Failed: ${e}`);
    }
    loadInstances();
    setTimeout(() => { setInstalling(null); setProgress(""); }, 2000);
  }

  async function handleLaunch(id: string) {
    try {
      await invoke("launch_instance", { instanceId: id });
    } catch (e: any) {
      alert(`Launch failed: ${e}`);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Instances</h1>
        <button
          onClick={() => setCreating(!creating)}
          className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium rounded-lg transition-colors"
        >
          + New Instance
        </button>
      </div>

      {creating && (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4 space-y-3">
          <input
            type="text"
            placeholder="Instance name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
            autoFocus
          />
          <div className="flex gap-3">
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            >
              <option value="client">Client</option>
              <option value="server">Server</option>
            </select>
            <input
              type="text"
              value={newVersion}
              onChange={(e) => setNewVersion(e.target.value)}
              className="bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm w-28"
              placeholder="MC version"
            />
            <button onClick={handleCreate} className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg">
              Create
            </button>
          </div>
        </div>
      )}

      {instances.length === 0 ? (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-12 text-center text-gray-500">
          No instances yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {instances.map((inst) => (
            <div
              key={inst.id}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4 flex items-center justify-between hover:border-[var(--border-light)] transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold ${
                  inst.instance_type === "Server" ? "bg-orange-600/20 text-orange-400" : "bg-indigo-600/20 text-indigo-400"
                }`}>
                  {inst.instance_type === "Server" ? "S" : "C"}
                </div>
                <div>
                  <div className="font-semibold">{inst.name}</div>
                  <div className="text-xs text-gray-500">
                    MC {inst.minecraft_version} &middot; Fusion {inst.fusion_version}
                    {inst.instance_type === "Server" && <span className="ml-2 text-orange-400">[Server]</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {installing === inst.id ? (
                  <span className="text-xs text-yellow-400">{progress}</span>
                ) : inst.install_status === "Ready" ? (
                  <button
                    onClick={() => handleLaunch(inst.id)}
                    className="px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg transition-colors"
                  >
                    Launch
                  </button>
                ) : (
                  <button
                    onClick={() => handleInstall(inst.id)}
                    className="px-4 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm rounded-lg transition-colors"
                  >
                    Install
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

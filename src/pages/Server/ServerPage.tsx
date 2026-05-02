import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface LogLine {
  timestamp: string;
  stream: string;
  text: string;
}

export default function ServerPage() {
  const [activeTab, setActiveTab] = useState<"console" | "config" | "backups">("console");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [command, setCommand] = useState("");
  const [properties, setProperties] = useState<Record<string, string>>({});
  const [backups, setBackups] = useState<any[]>([]);

  // For now, use the first server instance ID (would normally come from route params)
  const instanceId = "demo-server";

  useEffect(() => {
    const unlisten = listen<any>("process-log", (event) => {
      setLogs((prev) => [
        ...prev.slice(-2000),
        {
          timestamp: event.payload.timestamp,
          stream: event.payload.stream,
          text: event.payload.line,
        },
      ]);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  async function handleSendCommand() {
    if (!command.trim()) return;
    try {
      await invoke("send_server_command", {
        instanceId,
        command: command,
      });
      setCommand("");
    } catch (e) {
      console.error("Failed to send command:", e);
    }
  }

  async function loadProperties() {
    try {
      const props = await invoke<Record<string, string>>("get_server_properties", { instanceId });
      setProperties(props);
    } catch (e) {
      console.error("Failed to load properties:", e);
    }
  }

  async function loadBackups() {
    try {
      const list = await invoke<any[]>("list_backups", { instanceId });
      setBackups(list);
    } catch (e) {
      console.error("Failed to load backups:", e);
    }
  }

  async function handleBackup() {
    try {
      await invoke("create_backup", { instanceId });
      loadBackups();
    } catch (e: any) {
      alert(`Backup failed: ${e}`);
    }
  }

  useEffect(() => {
    if (activeTab === "config") loadProperties();
    if (activeTab === "backups") loadBackups();
  }, [activeTab]);

  const tabs = [
    { id: "console" as const, label: "Console" },
    { id: "config" as const, label: "Configuration" },
    { id: "backups" as const, label: "Backups" },
  ];

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Server Panel</h1>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-gray-500" />
          <span className="text-sm text-gray-400">Offline</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === tab.id
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--bg-secondary)] text-gray-400 hover:text-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0">
        {activeTab === "console" && (
          <div className="flex flex-col h-full">
            {/* Log output */}
            <div className="flex-1 bg-[#0a0a0a] border border-[var(--border)] rounded-lg p-3 overflow-y-auto font-mono text-xs">
              {logs.length === 0 ? (
                <div className="text-gray-600">No output yet. Start a server instance to see logs.</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className={`${log.stream === "stderr" ? "text-red-400" : "text-gray-300"}`}>
                    <span className="text-gray-600">[{log.timestamp}]</span> {log.text}
                  </div>
                ))
              )}
            </div>
            {/* Command input */}
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                placeholder="Enter command..."
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendCommand()}
                className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
              />
              <button
                onClick={handleSendCommand}
                className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg"
              >
                Send
              </button>
            </div>
          </div>
        )}

        {activeTab === "config" && (
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-4 overflow-y-auto max-h-[calc(100vh-220px)]">
            <h2 className="text-lg font-semibold mb-3">server.properties</h2>
            <div className="space-y-2">
              {Object.entries(properties).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => (
                <div key={key} className="flex items-center gap-3">
                  <label className="text-sm text-gray-400 w-56 truncate" title={key}>{key}</label>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setProperties({ ...properties, [key]: e.target.value })}
                    className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              ))}
            </div>
            {Object.keys(properties).length > 0 && (
              <button
                onClick={async () => {
                  await invoke("set_server_properties", { instanceId, properties });
                }}
                className="mt-4 px-4 py-2 bg-green-600 text-white text-sm rounded-lg"
              >
                Save Properties
              </button>
            )}
          </div>
        )}

        {activeTab === "backups" && (
          <div className="space-y-3">
            <button
              onClick={handleBackup}
              className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded-lg"
            >
              Create Backup Now
            </button>
            {backups.length === 0 ? (
              <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-8 text-center text-gray-500">
                No backups yet
              </div>
            ) : (
              <div className="space-y-2">
                {backups.map((b: any) => (
                  <div key={b.id} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{b.name}</div>
                      <div className="text-xs text-gray-500">
                        {b.world_name} &middot; {(b.size_bytes / 1024 / 1024).toFixed(1)} MB &middot; {b.created_at}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

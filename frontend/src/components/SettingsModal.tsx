import React, { useEffect, useState } from "react";

const DEFAULT_SETTINGS = {
  temperature: 0.7,
  maxTokens: 2048,
  systemPrompt: "",
};

interface SettingsModalProps {
  theme?: "dark" | "light";
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    const saved = localStorage.getItem("reposage_ai_settings");

    if (saved) {
      setSettings(JSON.parse(saved));
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem(
      "reposage_ai_settings",
      JSON.stringify(settings)
    );

    onClose();
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);

    localStorage.setItem(
      "reposage_ai_settings",
      JSON.stringify(DEFAULT_SETTINGS)
    );
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: "550px",
          maxWidth: "90%",
          padding: "24px",
          borderRadius: "12px",
          background: "var(--panel-bg)",
          color: "var(--text-color)",
          border: "1px solid var(--border-color)",
        }}
      >
        <h2
          style={{
            marginBottom: "24px",
            color: "var(--text-color)",
          }}
        >
          ⚙️ AI Settings
        </h2>

        {/* Temperature */}
        <div style={{ marginBottom: "24px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "8px",
              color: "var(--text-color)",
              fontWeight: 600,
            }}
          >
            Temperature: {settings.temperature}
          </label>

          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={settings.temperature}
            onChange={(e) =>
              setSettings({
                ...settings,
                temperature: Number(e.target.value),
              })
            }
            style={{
              width: "100%",
              cursor: "pointer",
            }}
          />
        </div>

        {/* Max Tokens */}
        <div style={{ marginBottom: "24px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "8px",
              color: "var(--text-color)",
              fontWeight: 600,
            }}
          >
            Max Tokens
          </label>

          <input
            type="number"
            value={settings.maxTokens}
            onChange={(e) =>
              setSettings({
                ...settings,
                maxTokens: Number(e.target.value),
              })
            }
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "8px",
              background: "rgba(15, 23, 42, 0.6)",
              color: "var(--text-color)",
              border: "1px solid var(--border-color)",
              outline: "none",
            }}
          />
        </div>

        {/* System Prompt */}
        <div style={{ marginBottom: "24px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "8px",
              color: "var(--text-color)",
              fontWeight: 600,
            }}
          >
            Custom System Prompt
          </label>

          <textarea
            rows={6}
            value={settings.systemPrompt}
            onChange={(e) =>
              setSettings({
                ...settings,
                systemPrompt: e.target.value,
              })
            }
            placeholder="Override default AI review instructions..."
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "8px",
              resize: "vertical",
              background: "rgba(15, 23, 42, 0.6)",
              color: "var(--text-color)",
              border: "1px solid var(--border-color)",
              outline: "none",
            }}
          />
        </div>

        {/* Buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <button
            onClick={handleReset}
            style={{
              background: "rgba(15, 23, 42, 0.6)",
              color: "var(--text-color)",
              border: "1px solid var(--border-color)",
              padding: "10px 16px",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Reset to Defaults
          </button>

          <div
            style={{
              display: "flex",
              gap: "10px",
            }}
          >
            <button
              onClick={onClose}
              style={{
                background: "rgba(15, 23, 42, 0.6)",
                color: "var(--text-color)",
                border: "1px solid var(--border-color)",
                padding: "10px 16px",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Cancel
            </button>

            <button
              onClick={handleSave}
              style={{
                background: "#2563eb",
                color: "#ffffff",
                border: "none",
                padding: "10px 16px",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
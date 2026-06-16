import React, { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_SETTINGS = {
  temperature: 0.7,
  maxTokens: 2048,
  systemPrompt: "",
  batchSize: 5,
};

interface SettingsModalProps {
  theme?: "dark" | "light";
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  const trapFocus = useCallback((e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const modal = modalRef.current;
    if (!modal) return;
    const focusable = modal.querySelectorAll<HTMLElement>(focusableSelector);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, []);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    const saved = localStorage.getItem("reposage_ai_settings");
    if (saved) {
      setSettings(JSON.parse(saved));
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      trapFocus(e);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [onClose, trapFocus]);

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

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="AI Settings"
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
        ref={modalRef}
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "24px",
          }}
        >
          <h2 style={{ margin: 0, color: "var(--text-color)" }}>
            ⚙️ AI Settings
          </h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            title="Close"
            style={{
              background: "none",
              border: "none",
              color: "var(--text-color)",
              cursor: "pointer",
              fontSize: "20px",
              padding: "4px 8px",
              borderRadius: "6px",
              lineHeight: 1,
              opacity: 0.7,
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = "1")}
            onMouseOut={(e) => (e.currentTarget.style.opacity = "0.7")}
          >
            ✕
          </button>
        </div>

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

        {/* Batch Size */}
        <div style={{ marginBottom: "24px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "8px",
              color: "var(--text-color)",
              fontWeight: 600,
            }}
          >
            Batch Size (Files per API call)
          </label>

          <input
            type="number"
            min="1"
            max="20"
            value={settings.batchSize}
            onChange={(e) =>
              setSettings({
                ...settings,
                batchSize: Number(e.target.value),
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
            maxLength={2000}
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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "4px",
              fontSize: "11px",
              color: "#9ca3af",
            }}
          >
            <span>⚠️ Malicious prompts may override AI behavior. Use only trusted instructions.</span>
            <span>{settings.systemPrompt.length}/2000</span>
          </div>
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
import React from 'react';

interface KeyboardShortcutsHelpProps {
  onClose: () => void;
}

const KeyboardShortcutsHelp: React.FC<KeyboardShortcutsHelpProps> = ({ onClose }) => {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 10000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "#1e293b",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "12px",
          padding: "24px",
          maxWidth: "400px",
          width: "90%",
          color: "#e2e8f0",
        }}
      >
        <h3 style={{ margin: "0 0 16px", color: "#a855f7" }}>Keyboard Shortcuts</h3>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <li style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span>Focus Input</span>
            <kbd style={{ background: "#374151", padding: "2px 6px", borderRadius: "4px" }}>/</kbd>
          </li>
          <li style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span>New Analysis</span>
            <kbd style={{ background: "#374151", padding: "2px 6px", borderRadius: "4px" }}>Ctrl+N</kbd>
          </li>
          <li style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span>Clear Chat</span>
            <kbd style={{ background: "#374151", padding: "2px 6px", borderRadius: "4px" }}>Ctrl+L</kbd>
          </li>
          <li style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span>Toggle Sidebar</span>
            <kbd style={{ background: "#374151", padding: "2px 6px", borderRadius: "4px" }}>Ctrl+B</kbd>
          </li>
          <li style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span>Export HTML</span>
            <kbd style={{ background: "#374151", padding: "2px 6px", borderRadius: "4px" }}>Ctrl+E</kbd>
          </li>
          <li style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span>Settings</span>
            <kbd style={{ background: "#374151", padding: "2px 6px", borderRadius: "4px" }}>Ctrl+,</kbd>
          </li>
          <li style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span>Show Shortcuts</span>
            <kbd style={{ background: "#374151", padding: "2px 6px", borderRadius: "4px" }}>?</kbd>
          </li>
        </ul>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px" }}>
          <button
            onClick={onClose}
            style={{
              background: "#2563eb",
              color: "#fff",
              border: "none",
              padding: "8px 16px",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcutsHelp;

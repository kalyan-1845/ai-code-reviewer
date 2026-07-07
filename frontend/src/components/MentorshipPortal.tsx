import { useState } from "react";
import { Layers } from "lucide-react";

export function MentorshipPortal() {
  const [assignedContributors, setAssignedContributors] = useState<
    Record<string, string>
  >(() => {
    const saved = localStorage.getItem("reposage_contributor_assignments");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved assignments", e);
      }
    }
    return {
      "copy-code-button": "Siddharth-iang",
      "secret-scanning-rules": "Siddharth-iang",
      "api-documentation": "skhazi123",
      "persist-assignments": "bhavyaxtech",
      "theme-toggle": "Unassigned",
      "file-filter-search": "nikita-sdev",
      "html-report-exporter": "A-R-Narke",
      "complexity-metrics": "Nikitasoni22",
    };
  });

  const handleAssignContributor = (issueKey: string) => {
    const name = prompt(
      "Enter the contributor's GitHub username to assign this issue:",
    );
    if (name) {
      const updated = {
        ...assignedContributors,
        [issueKey]: name,
      };
      setAssignedContributors(updated);
      localStorage.setItem(
        "reposage_contributor_assignments",
        JSON.stringify(updated),
      );
    }
  };

  const handleResetAssignments = () => {
    const confirmReset = window.confirm(
      "Are you sure you want to reset all contributor assignments?",
    );
    if (confirmReset) {
      const initial = {
        "copy-code-button": "Unassigned",
        "secret-scanning-rules": "Unassigned",
        "api-documentation": "Unassigned",
        "persist-assignments": "Unassigned",
        "theme-toggle": "Unassigned",
        "file-filter-search": "Unassigned",
        "html-report-exporter": "Unassigned",
        "complexity-metrics": "Unassigned",
      };
      setAssignedContributors(initial);
      localStorage.setItem(
        "reposage_contributor_assignments",
        JSON.stringify(initial),
      );
    }
  };

  return (
    <div className="glass-panel" style={{ padding: "20px" }}>
      <h2
        style={{
          fontSize: "15px",
          fontWeight: 700,
          color: "#f3f4f6",
          margin: "0 0 4px 0",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <Layers size={18} style={{ color: "#a855f7" }} /> Mentorship
        Portal
      </h2>
      <p
        style={{
          margin: "0 0 16px 0",
          fontSize: "11px",
          color: "#9ca3af",
        }}
      >
        GSSoC Assigned Contributor Issues
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {[
          { key: "copy-code-button", label: "Copy Code Button", tag: "good first issue", color: "#a855f7" },
          { key: "secret-scanning-rules", label: "Expand Security Rules", tag: "backend / security", color: "#3b82f6" },
          { key: "api-documentation", label: "API Endpoint Spec", tag: "documentation", color: "#a855f7" },
          { key: "persist-assignments", label: "Persist Contributor State", tag: "frontend", color: "#22c55e" },
          { key: "theme-toggle", label: "Implement Theme Toggle", tag: "frontend / styling", color: "#a855f7" },
          { key: "file-filter-search", label: "File tree filter search", tag: "frontend", color: "#3b82f6" },
          { key: "html-report-exporter", label: "Export Report to HTML", tag: "backend", color: "#a855f7" },
          { key: "complexity-metrics", label: "Complexity Metrics Analyzer", tag: "backend", color: "#22c55e" }
        ].map((item) => (
          <div
            key={item.key}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 10px",
              background: `rgba(${item.color === '#a855f7' ? '168,85,247' : item.color === '#3b82f6' ? '59,130,246' : '34,197,94'},0.05)`,
              borderRadius: "6px",
              border: `1px solid rgba(${item.color === '#a855f7' ? '168,85,247' : item.color === '#3b82f6' ? '59,130,246' : '34,197,94'},0.1)`,
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#f3f4f6",
                  display: "block",
                }}
              >
                {item.label}
              </span>
              <span style={{ fontSize: "10px", color: item.color }}>
                ??? {item.tag}
              </span>
            </div>
            <button
              onClick={() => handleAssignContributor(item.key)}
              style={{
                background:
                  assignedContributors[item.key] === "Unassigned"
                    ? "#a855f7"
                    : "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "4px",
                padding: "4px 8px",
                fontSize: "10px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {assignedContributors[item.key]}
            </button>
          </div>
        ))}
        <button
          onClick={handleResetAssignments}
          style={{
            marginTop: "14px",
            width: "100%",
            padding: "8px",
            borderRadius: "6px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#f87171",
            fontSize: "11px",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s ease-in-out",
          }}
        >
          Reset Assignments
        </button>
      </div>
    </div>
  );
}

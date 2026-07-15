
import { Layers } from "lucide-react";

interface MentorshipPortalProps {
  assignedContributors: Record<string, string>;
  handleAssignContributor: (issueKey: string) => void;
  handleResetAssignments: () => void;
}

const ISSUES = [
  { key: "copy-code-button", label: "Copy Code Button", tag: "good first issue", color: "#a855f7" },
  { key: "secret-scanning-rules", label: "Expand Security Rules", tag: "backend / security", color: "#3b82f6" },
  { key: "api-documentation", label: "API Endpoint Spec", tag: "documentation", color: "#a855f7" },
  { key: "persist-assignments", label: "Persist Contributor State", tag: "frontend", color: "#22c55e" },
  { key: "theme-toggle", label: "Implement Theme Toggle", tag: "frontend / styling", color: "#a855f7" },
  { key: "file-filter-search", label: "File tree filter search", tag: "frontend", color: "#3b82f6" },
  { key: "html-report-exporter", label: "Export Report to HTML", tag: "backend", color: "#a855f7" },
  { key: "complexity-metrics", label: "Complexity Metrics Analyzer", tag: "backend", color: "#22c55e" },
];

export default function MentorshipPortal({ assignedContributors, handleAssignContributor, handleResetAssignments }: MentorshipPortalProps) {
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
        <Layers size={18} style={{ color: "#a855f7" }} /> Mentorship Portal
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
        {ISSUES.map((issue) => (
          <div
            key={issue.key}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 10px",
              background: "rgba(168,85,247,0.05)",
              borderRadius: "6px",
              border: "1px solid rgba(168,85,247,0.1)",
            }}
          >
            <div>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#f3f4f6", display: "block" }}>
                {issue.label}
              </span>
              <span style={{ fontSize: "10px", color: issue.color }}>
                {issue.tag}
              </span>
            </div>
            <button
              onClick={() => handleAssignContributor(issue.key)}
              style={{
                background:
                  assignedContributors[issue.key] === "Unassigned"
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
              {assignedContributors[issue.key]}
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

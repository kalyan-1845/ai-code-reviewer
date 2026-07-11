import { Bug, ShieldAlert, Zap, Paintbrush } from "lucide-react";

interface BarChartProps {
  data: Record<string, number>;
  title?: string;
}

const CATEGORY_META: Record<string, { label: string; color: string; icon: typeof Bug; }> = {
  security: { label: "Security", color: "#ef4444", icon: ShieldAlert },
  bugs: { label: "Bugs", color: "#f59e0b", icon: Bug },
  optimization: { label: "Performance", color: "#3b82f6", icon: Zap },
  styling: { label: "Styling", color: "#10b981", icon: Paintbrush },
};

const ORDER = ["security", "bugs", "optimization", "styling"];

export function VulnerabilitiesBarChart({ data, title = "Vulnerabilities by Type" }: BarChartProps) {
  const maxValue = Math.max(...ORDER.map(k => data[k] || 0), 1);

  return (
    <div style={{
      background: "rgba(15, 23, 42, 0.6)",
      border: "1px solid rgba(255, 255, 255, 0.06)",
      borderRadius: "10px",
      padding: "20px",
      width: "100%",
      boxSizing: "border-box",
    }}>
      <h4 style={{
        margin: "0 0 16px 0",
        fontSize: "12px",
        fontWeight: 600,
        color: "#e2e8f0",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
      }}>
        {title}
      </h4>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {ORDER.map(key => {
          const meta = CATEGORY_META[key];
          const value = data[key] || 0;
          const pct = (value / maxValue) * 100;
          const Icon = meta.icon;

          return (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{
                width: "80px",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "11px",
                color: "#94a3b8",
              }}>
                <Icon size={12} style={{ color: meta.color }} />
                <span>{meta.label}</span>
              </div>

              <div style={{
                flexGrow: 1,
                height: "22px",
                background: "rgba(255, 255, 255, 0.04)",
                borderRadius: "6px",
                overflow: "hidden",
                position: "relative",
              }}>
                <div style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: meta.color,
                  borderRadius: "6px",
                  opacity: 0.8,
                  transition: "width 0.6s ease",
                  minWidth: value > 0 ? "4px" : "0",
                }} />
              </div>

              <span style={{
                width: "40px",
                textAlign: "right",
                fontSize: "12px",
                fontWeight: 700,
                color: "#e2e8f0",
                flexShrink: 0,
              }}>
                {value}
              </span>
            </div>
          );
        })}
      </div>

      {ORDER.every(k => !data[k]) && (
        <p style={{ fontSize: "11px", color: "#64748b", textAlign: "center", margin: "12px 0 0 0" }}>
          No vulnerabilities found in this analysis.
        </p>
      )}
    </div>
  );
}

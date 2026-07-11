import React from "react";

export type AnalyticsDateRangeValue = "last7Days" | "last30Days" | "allTime";

export interface AnalyticsDateRangePickerProps {
  value: AnalyticsDateRangeValue;
  onChange: (value: AnalyticsDateRangeValue) => void;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

const DATE_RANGE_OPTIONS: Array<{
  value: AnalyticsDateRangeValue;
  label: string;
  ariaLabel: string;
}> = [
  {
    value: "last7Days",
    label: "Last 7 Days",
    ariaLabel: "Filter analytics by the last 7 days",
  },
  {
    value: "last30Days",
    label: "Last 30 Days",
    ariaLabel: "Filter analytics by the last 30 days",
  },
  {
    value: "allTime",
    label: "All Time",
    ariaLabel: "Filter analytics by all time",
  },
];

const AnalyticsDateRangePicker: React.FC<AnalyticsDateRangePickerProps> = ({
  value,
  onChange,
  label = "Date range",
  className,
  style,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = (idx + 1) % DATE_RANGE_OPTIONS.length;
      onChange(DATE_RANGE_OPTIONS[next].value);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prev = (idx - 1 + DATE_RANGE_OPTIONS.length) % DATE_RANGE_OPTIONS.length;
      onChange(DATE_RANGE_OPTIONS[prev].value);
    }
  };

  const currentIdx = DATE_RANGE_OPTIONS.findIndex((o) => o.value === value);

  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        width: "100%",
        ...style,
      }}
    >
      <span
        style={{
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--subtext-color)",
        }}
      >
        {label}
      </span>

      <div
        className="glass-panel"
        role="group"
        aria-label={label}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          padding: "8px",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {DATE_RANGE_OPTIONS.map((option, idx) => {
          const isSelected = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              aria-label={option.ariaLabel}
              aria-pressed={isSelected}
              onClick={() => onChange(option.value)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              tabIndex={idx === currentIdx ? 0 : -1}
              style={{
                flex: "1 1 120px",
                minWidth: "0",
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid",
                borderColor: isSelected
                  ? "rgba(59,130,246,0.4)"
                  : "rgba(255,255,255,0.08)",
                background: isSelected
                  ? "rgba(59,130,246,0.14)"
                  : "rgba(255,255,255,0.03)",
                color: isSelected ? "#60a5fa" : "var(--text-color)",
                boxShadow: isSelected
                  ? "0 0 0 1px rgba(59,130,246,0.18) inset"
                  : "none",
                fontSize: "12px",
                fontWeight: 700,
                lineHeight: 1.2,
                cursor: "pointer",
                transition: "all 0.2s ease-in-out",
                whiteSpace: "nowrap",
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AnalyticsDateRangePicker;

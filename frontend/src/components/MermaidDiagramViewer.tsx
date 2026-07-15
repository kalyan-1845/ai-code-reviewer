import { useState, useEffect, useRef } from 'react';
import { Download } from "lucide-react";
import { sanitizeForStorage, sanitizeMermaidOutput } from "../utils/sanitize";

interface MermaidViewerProps {
  chart: string;
  repoName: string;
}

export default function MermaidDiagramViewer({ chart, repoName }: MermaidViewerProps) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!chart) return;
    setError(null);
    const uniqueId = `mermaid-${Math.floor(Math.random() * 100000)}`;
    const renderChart = async () => {
      try {
        setSvg("");
        let cleanChart = sanitizeForStorage(chart)
          .replace(/```mermaid/g, "")
          .replace(/```/g, "")
          .trim();
        const MERMAID_TYPES = [
          "graph", "flowchart", "sequenceDiagram", "classDiagram",
          "stateDiagram", "stateDiagram-v2", "erDiagram", "gantt",
          "pie", "journey", "gitgraph", "mindmap", "timeline",
          "zenuml", "sankey", "xychart", "block", "quadrantChart",
          "requirementDiagram", "c4Context", "c4Container", "c4Component",
          "c4Dynamic", "c4Deployment", "info",
        ];
        const firstWord = cleanChart.split(/\s+/)[0];
        if (!MERMAID_TYPES.includes(firstWord)) {
          cleanChart = `graph TD\n${cleanChart}`;
        }

        const mermaidModule = await import("mermaid");
        const mermaid = mermaidModule.default;

        try {
          mermaid.initialize({
            startOnLoad: false,
            theme: document.documentElement.getAttribute("data-theme") === "light" ? "base" : "dark",
            securityLevel: "strict",
            themeVariables: {
              background: "#0f172a",
              primaryColor: "#3b82f6",
              primaryTextColor: "#e5e7eb",
              lineColor: "#c084fc",
              nodeBorder: "#3b82f6",
              mainBkg: "#1e293b",
            },
          });
        } catch (e) {
          console.error("Failed to initialize Mermaid:", e);
        }

        const { svg: renderedSvg } = await mermaid.render(uniqueId, cleanChart);
        if (cancelled) return;
        const sanitized = sanitizeMermaidOutput(renderedSvg);
        setSvg(sanitized);
      } catch (err: unknown) {
        if (cancelled) return;
        console.error("Mermaid Render Error:", err);
        setError(
          "Could not render architecture diagram. The AI-generated flowchart has syntax errors.",
        );
      }
    };

    renderChart();
    return () => { cancelled = true; };
  }, [chart]);

  if (!chart) return null;

  const svgDataUrl = svg
    ? `data:image/svg+xml;charset=utf-8,${encodeURI(svg)}`
    : null;

  const downloadSVG = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${repoName}_architecture.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (error) {
    return (
      <div
        style={{
          padding: "20px",
          color: "#ef4444",
          background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          borderRadius: "8px",
          fontSize: "12px",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: "6px" }}>
          Mermaid Rendering Failed
        </div>
        <p style={{ margin: "0 0 10px 0", fontSize: "11px", color: "#fca5a5" }}>
          {error}
        </p>
        <pre
          style={{
            background: "rgba(0,0,0,0.3)",
            padding: "10px",
            borderRadius: "6px",
            fontSize: "10px",
            color: "#9ca3af",
            overflowX: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {chart}
        </pre>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={downloadSVG}
          disabled={!svg}
          style={{
            background: "rgba(59, 130, 246, 0.1)",
            border: "1px solid rgba(59, 130, 246, 0.3)",
            color: "#60a5fa",
            borderRadius: "6px",
            padding: "6px 12px",
            fontSize: "11px",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            transition: "all 0.15s ease",
          }}
          className="hover:bg-blue-500/20"
        >
          <Download size={14} /> Download SVG Diagram
        </button>
      </div>
      <div
        ref={containerRef}
        style={{
          display: "flex",
          justifyContent: "center",
          background: "rgba(15,23,42,0.4)",
          padding: "24px",
          borderRadius: "8px",
          overflowX: "auto",
          border: "1px solid rgba(255,255,255,0.05)",
          boxSizing: "border-box",
          width: "100%",
        }}
      >
        {svgDataUrl ? (
          <img
            src={svgDataUrl}
            alt={`Architecture diagram for ${repoName}`}
            style={{ maxWidth: "100%", height: "auto" }}
          />
        ) : (
          <span style={{ color: "#9ca3af", fontSize: "12px" }}>
            Generating visual flowchart...
          </span>
        )}
      </div>
    </div>
  );
}

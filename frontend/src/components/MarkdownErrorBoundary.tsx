import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class MarkdownErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Markdown rendering error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "20px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "8px",
            color: "#fca5a5",
            fontSize: "12px",
            fontFamily: "monospace",
            margin: "16px 0",
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: "8px", color: "#ef4444" }}>
            ⚠️ Failed to render Markdown preview
          </div>
          <p style={{ marginBottom: "12px" }}>
            An unexpected error occurred while parsing the markdown content.
          </p>
          <pre
            style={{
              background: "rgba(0,0,0,0.3)",
              padding: "12px",
              borderRadius: "4px",
              overflowX: "auto",
              color: "#d1d5db",
            }}
          >
            {this.state.error?.toString()}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

export default MarkdownErrorBoundary;

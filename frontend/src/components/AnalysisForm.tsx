
import { FolderGit, Sparkles } from "lucide-react";

interface AnalysisFormProps {
  repoUrl: string;
  setRepoUrl: (url: string) => void;
  company: string;
  setCompany: (c: string) => void;
  language: string;
  setLanguage: (l: string) => void;
  selectedModel: string;
  setSelectedModel: (m: string) => void;
  isLoading: boolean;
  handleAnalyze: (e: React.FormEvent) => void;
}

export default function AnalysisForm({
  repoUrl, setRepoUrl, company, setCompany, language, setLanguage,
  selectedModel, setSelectedModel, isLoading, handleAnalyze,
}: AnalysisFormProps) {
  return (
    <div className="glass-panel" style={{ padding: "20px" }}>
      <h2
        style={{
          fontSize: "16px",
          fontWeight: 700,
          color: "#f3f4f6",
          margin: "0 0 16px 0",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <FolderGit size={18} style={{ color: "#3b82f6" }} /> Import Repository
      </h2>

      <form
        onSubmit={handleAnalyze}
        style={{ display: "flex", flexDirection: "column", gap: "14px" }}
      >
        <div>
          <label
            style={{
              display: "block",
              fontSize: "11px",
              fontWeight: 600,
              color: "#9ca3af",
              marginBottom: "6px",
              textTransform: "uppercase",
            }}
          >
            GitHub Repository URL
          </label>
          <input
            type="url"
            required
            pattern="https://github\.com/.*"
            placeholder="https://github.com/username/repo"
            value={repoUrl}
            readOnly={isLoading}
            onChange={(e) => setRepoUrl(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              background: "rgba(15, 23, 42, 0.6)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "6px",
              color: "#fff",
              fontSize: "13px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "10px",
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontSize: "11px",
                fontWeight: 600,
                color: "#9ca3af",
                marginBottom: "6px",
                textTransform: "uppercase",
              }}
            >
              Target Company
            </label>
            <select
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "rgba(15, 23, 42, 0.6)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "6px",
                color: "#fff",
                fontSize: "13px",
                outline: "none",
              }}
            >
              <option value="General">General</option>
              <option value="Google">Google</option>
              <option value="Stripe">Stripe</option>
              <option value="Meta">Meta</option>
            </select>
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "11px",
                fontWeight: 600,
                color: "#9ca3af",
                marginBottom: "6px",
                textTransform: "uppercase",
              }}
            >
              Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "rgba(15, 23, 42, 0.6)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "6px",
                color: "#fff",
                fontSize: "13px",
                outline: "none",
              }}
            >
              <option value="English">English</option>
              <option value="Hindi">Hindi</option>
              <option value="Telugu">Telugu</option>
            </select>
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: "11px",
                fontWeight: 600,
                color: "#9ca3af",
                marginBottom: "6px",
                textTransform: "uppercase",
              }}
            >
              AI Model
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "rgba(15, 23, 42, 0.6)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "6px",
                color: "#fff",
                fontSize: "13px",
                outline: "none",
              }}
            >
              <option value="llama-3.3-70b-versatile">Llama 3.3 (70B)</option>
              <option value="deepseek-r1-distill-llama-70b">DeepSeek R1 (70B)</option>
              <option value="llama-3.1-8b-instant">Llama 3.1 (8B)</option>
              <option value="gemma2-9b-it">Google Gemma 2 (9B)</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="glow-btn"
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "6px",
            cursor: isLoading ? "not-allowed" : "pointer",
            opacity: isLoading ? 0.65 : 1,
            fontSize: "13px",
            marginTop: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          {isLoading ? (
            <>
              <span
                className="spin-slow"
                style={{
                  display: "inline-block",
                  width: "14px",
                  height: "14px",
                  border: "2px solid white",
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                }}
              ></span>
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles size={16} /> Scan & Document Repo
            </>
          )}
        </button>
      </form>
    </div>
  );
}


import { BackendResponse } from "../pages/Dashboard";
import HealthScoreGauge from "./HealthScoreGauge";

interface HealthScoreSectionProps {
  analysisResult: BackendResponse;
  isLoading: boolean;
}

export default function HealthScoreSection({ analysisResult, isLoading }: HealthScoreSectionProps) {
  return (
    <>
      <div
        className="glass-panel"
        style={{ padding: "20px", marginBottom: "16px" }}
      >
        <h2 style={{ margin: 0, marginBottom: "12px", color: "#f3f4f6", fontSize: "18px", fontWeight: "700" }}>
          Repository Health Score
        </h2>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "20px" }}>
          <div>
            <h1 style={{ fontSize: "42px", color: "#22c55e", margin: 0 }}>
              {analysisResult.repositoryHealth?.score ?? 100}/100
            </h1>
            <p style={{ color: "#9ca3af", marginTop: "6px" }}>
              Grade: <strong>{analysisResult.repositoryHealth?.grade ?? "A"}</strong>
            </p>
          </div>
          <div>
            <h4 style={{ color: "#f3f4f6" }}>Recommendations</h4>
            <ul style={{ margin: 0, paddingLeft: "18px", color: "#d1d5db" }}>
              {(analysisResult.repositoryHealth?.recommendations || []).map((item: string, index: number) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <HealthScoreGauge
        fileReviews={analysisResult.analysis?.fileReviews}
        isLoading={isLoading}
      />
      <div className="glass-panel" style={{ padding: "20px", marginBottom: "16px" }}>
        <h2>AI Pull Request Summary</h2>
        <p><strong>Purpose:</strong><br />{analysisResult.prSummary?.overallPurpose}</p>
        <p><strong>Files Changed:</strong><br />{analysisResult.prSummary?.filesChanged}</p>
        <p><strong>Major Logic Updates:</strong></p>
        <ul>{(analysisResult.prSummary?.majorLogicUpdates || []).map((item: string, i: number) => (<li key={i}>{item}</li>))}</ul>
        <p><strong>Potential Risks:</strong></p>
        <ul>{(analysisResult.prSummary?.potentialRisks || []).map((item: string, i: number) => (<li key={i}>{item}</li>))}</ul>
        <p><strong>Breaking Changes:</strong></p>
        <ul>{(analysisResult.prSummary?.breakingChanges || []).map((item: string, i: number) => (<li key={i}>{item}</li>))}</ul>
        <p><strong>Testing Recommendations:</strong></p>
        <ul>{(analysisResult.prSummary?.testingRecommendations || []).map((item: string, i: number) => (<li key={i}>{item}</li>))}</ul>
      </div>
      <div className="glass-panel" style={{ padding: "20px", marginBottom: "16px" }}>
        <h2>Dependency Risk Analyzer</h2>
        {(analysisResult.dependencyReport?.dependencies || []).length === 0 ? (
          <p style={{ color: "#9ca3af" }}>No dependency information available.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "15px" }}>
            <thead>
              <tr>
                <th>Package</th><th>Current</th><th>Latest</th><th>Risk</th><th>Status</th><th>Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {analysisResult.dependencyReport?.dependencies?.map((dep: any, index: number) => (
                <tr key={index}>
                  <td>{dep.name}</td>
                  <td>{dep.currentVersion}</td>
                  <td>{dep.latestVersion}</td>
                  <td>{dep.risk}</td>
                  <td>{dep.vulnerable ? "Vulnerable" : dep.deprecated ? "Deprecated" : "Safe"}</td>
                  <td>{dep.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

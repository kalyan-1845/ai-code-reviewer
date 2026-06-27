interface ReviewItem {
  type: string;
  line: number;
  description: string;
  suggestion: string;
}

interface FileReview {
  bugs: ReviewItem[];
  security: ReviewItem[];
  optimization: ReviewItem[];
  styling: ReviewItem[];
}

interface AnalysisData {
  fileReviews: Record<string, FileReview>;
  generatedReadme: string;
  mermaidDiagram?: string;
  metrics?: Record<string, any>;
}

export const generateMarkdownReport = (repoName: string, analysis: AnalysisData): string => {
  let markdown = `# 🛡️ RepoSage AI Code Audit Report\n\n`;
  markdown += `**Repository Name:** ${repoName}\n`;
  markdown += `**Report Timestamp:** ${new Date().toLocaleString()}\n`;
  markdown += `**Audited with:** RepoSage GSSoC '26 Audit Engine\n\n`;

  let totalBugs = 0;
  let totalSecurity = 0;
  let totalOptimization = 0;
  let totalStyling = 0;

  let findingsTableRows = '';
  let hasFindings = false;

  if (analysis && analysis.fileReviews) {
    Object.keys(analysis.fileReviews).forEach(file => {
      const review = analysis.fileReviews[file];
      const bugs = review.bugs || [];
      const security = review.security || [];
      const optimization = review.optimization || [];
      const styling = review.styling || [];

      totalBugs += bugs.length;
      totalSecurity += security.length;
      totalOptimization += optimization.length;
      totalStyling += styling.length;

      const all = [
        ...bugs.map(f => ({ ...f, category: 'Bug' })),
        ...security.map(f => ({ ...f, category: 'Security' })),
        ...optimization.map(f => ({ ...f, category: 'Optimization' })),
        ...styling.map(f => ({ ...f, category: 'Styling' }))
      ];

      all.forEach(f => {
        hasFindings = true;
        const escapePipe = (str: string | number) => String(str).replace(/\|/g, '\\|');
        findingsTableRows += `| ${escapePipe(file)} | ${escapePipe(f.category)} | ${escapePipe(f.line)} | ${escapePipe(f.type)} | ${escapePipe(f.description)} | \`${escapePipe(f.suggestion)}\` |\n`;
      });
    });
  }

  const totalFindings = totalBugs + totalSecurity + totalOptimization + totalStyling;

  markdown += `## 📊 Summary of Findings\n\n`;
  markdown += `- **Total Findings:** ${totalFindings}\n`;
  markdown += `- **Bugs:** ${totalBugs}\n`;
  markdown += `- **Security Issues:** ${totalSecurity}\n`;
  markdown += `- **Performance Optimizations:** ${totalOptimization}\n`;
  markdown += `- **Style Violations:** ${totalStyling}\n\n`;

  markdown += `## 🔍 Detailed Findings\n\n`;
  if (hasFindings) {
    markdown += `| File Path | Category | Line | Finding Type | Description | Actionable Suggestion |\n`;
    markdown += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    markdown += findingsTableRows;
  } else {
    markdown += `🎉 No issues found! Your codebase is clean.\n`;
  }
  markdown += `\n`;

  if (analysis && analysis.metrics && Object.keys(analysis.metrics).length > 0) {
    markdown += `## 📈 Code Metrics\n\n`;
    markdown += `| File Path | Total Lines | Code Lines | Comment Lines | Empty Lines | Functions | Complexity Score | Grade |\n`;
    markdown += `| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;
    const metrics = analysis.metrics;
    Object.keys(metrics).forEach(file => {
      const m = metrics[file];
      markdown += `| ${file} | ${m.totalLines ?? 0} | ${m.codeLines ?? 0} | ${m.commentLines ?? 0} | ${m.emptyLines ?? 0} | ${m.functionCount ?? 0} | ${m.complexityScore ?? 0} | ${m.grade ?? 'A'} |\n`;
    });
    markdown += `\n`;
  }

  markdown += `---\n`;
  markdown += `*RepoSage AI © 2026. Made with 💜 for GirlScript Summer of Code (GSSoC).*`;

  return markdown;
};

export const handleMarkdownExport = (repoName: string, analysis: AnalysisData) => {
  const markdownContent = generateMarkdownReport(repoName, analysis);
  const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const element = document.createElement('a');
  element.href = url;
  element.download = `${repoName || 'RepoSage'}-Audit-Report.md`;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
  URL.revokeObjectURL(url);
};

export const handleHtmlExport = async (
  repoName: string,
  analysis: AnalysisData,
  apiFetch: (path: string, options?: RequestInit) => Promise<Response>
) => {
  try {
    const response = await apiFetch('/api/reports/html', {
      method: 'POST',
      body: JSON.stringify({
        repoName,
        analysis: {
          fileReviews: analysis.fileReviews,
          metrics: analysis.metrics
        }
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to export HTML report.');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const element = document.createElement('a');
    element.href = url;
    element.download = `${repoName || 'RepoSage'}-Audit-Report.html`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    URL.revokeObjectURL(url);
  } catch (err: any) {
    console.error(err);
    alert(err.message || 'Failed to export HTML report.');
  }
};

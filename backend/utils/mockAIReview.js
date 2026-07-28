import { detectNPlusOne } from './nPlusOneDetector.js';
import { getPreviousMetrics } from './analyticsStore.js';
import { analyzeComplexity } from './complexityAnalyzer.js';

export function mockAIReview(files, model = 'llama-3.3-70b-versatile', customPrompt = '', securityMode = false) {
  const reviews = {};
  
  if (!files || !Array.isArray(files) || files.length === 0) {
    return {
      fileReviews: {},
      generatedReadme: '',
      mermaidDiagram: ''
    };
  }

  let totalCyclomatic = 0;
  let totalHalstead = 0;
  let currentScore = 0;

  files.forEach(file => {
    let comp = file.complexity;
    if (!comp && file.content) {
      comp = analyzeComplexity(file.content, file.name);
    }
    if (comp) {
      totalCyclomatic += comp.cyclomaticComplexity || 0;
      totalHalstead += comp.halsteadComplexity || 0;
      currentScore += comp.complexityScore || 0;
    }

    const totalLines = file.content ? file.content.split('\n').length : 50;
    const getRandomLine = () => null;

    reviews[file.name] = {
      bugs: [
        {
          type: "Null Pointer Risk",
          line: getRandomLine(),
          description: `Variables should be validated before use to prevent potential runtime crashes in ${file.name}.`,
          suggestion: "Add a standard null-check check (e.g. `if (!variable)` or `if variable is None`)."
        }
      ],
      security: [
        {
          type: "Hardcoded API Key Check",
          line: getRandomLine(),
          description: "Potential hardcoded credentials detected. API keys should always be loaded from environment variables (.env).",
          suggestion: "Move the key to a `.env` file and load using standard environment managers."
        }
      ],
      optimization: [
        {
          type: "Complexity Reduction",
          line: getRandomLine(),
          description: "Avoid using nested iterations if time complexity grows quadratically. Consider using a Map/Dictionary lookup.",
          suggestion: "Implement a mapping cache instead of performing dual-nested loops."
        }
      ],
      styling: [
        {
          type: "Naming Convention",
          line: getRandomLine(),
          description: "CamelCase or snake_case format mismatch detected on function declaration.",
          suggestion: "Reformat variable or function definitions to conform to standard styling rules."
        }
      ]
    };

    if (detectNPlusOne(file.content, file.name)) {
      reviews[file.name].optimization.unshift({
        type: "N+1 Database Query Detected",
        line: getRandomLine(),
        description: `Context-Aware Scanner identified a potential N+1 database querying issue inside a loop in ${file.name}. Running ORM calls (.find, .query) inside loops can degrade performance exponentially.`,
        suggestion: "Use `.populate()`, `.join()`, or a batch data-loader (e.g. IN clause) outside the loop instead."
      });
    }
  });

  // Derive repo name from first file's path; use fallback for root-level files
  const repoParts = files[0].name.split('/');
  const repoName = repoParts.length > 1 ? repoParts[0] : 'Repository';
  
  const prevMetrics = getPreviousMetrics(repoName) || {};
  const diffCyclomatic = prevMetrics.cyclomaticComplexity ? totalCyclomatic - prevMetrics.cyclomaticComplexity : 0;
  const diffHalstead = prevMetrics.halsteadComplexity ? totalHalstead - prevMetrics.halsteadComplexity : 0;
  const diffScore = prevMetrics.complexityScore ? currentScore - prevMetrics.complexityScore : 0;

  const trendIcon = (diff) => diff > 0 ? '📈 (+)' : diff < 0 ? '📉 (-)' : '➖';

  // Mock generated README
  const mockReadme = `# 🚀 ${repoName}

This repository is powered by RepoSage AI Copilot (Audited using **${model}**). 

## 🏗️ Folder Layout
${files.map(f => `- 📄 **${f.name}**`).join('\n')}

## 📊 Code Complexity Trend Analysis
| Metric | Previous | Current | Trend |
|--------|----------|---------|-------|
| **Cyclomatic Complexity** | ${prevMetrics.cyclomaticComplexity || 0} | ${totalCyclomatic} | ${trendIcon(diffCyclomatic)} ${Math.abs(diffCyclomatic)} |
| **Halstead Complexity** | ${prevMetrics.halsteadComplexity || 0} | ${totalHalstead} | ${trendIcon(diffHalstead)} ${Math.abs(diffHalstead)} |
| **Technical Debt Score** | ${prevMetrics.complexityScore || 0} | ${currentScore} | ${trendIcon(diffScore)} ${Math.abs(diffScore)} |

## 💻 Tech Stack
- Source files: ${files.length} modules analyzed.

Generated automatically by **RepoSage AI Generator**.`;

  // Mock generated Mermaid flowchart
  const mockMermaid = `graph TD\n  Root["📦 ${repoName}"]\n  ${files.slice(0, 5).map((f, i) => `  Root --> File_${i}["📄 ${f.name.split('/').pop()}"]`).join('\n')}`;

  return {
    fileReviews: reviews,
    generatedReadme: mockReadme,
    mermaidDiagram: mockMermaid
  };
}

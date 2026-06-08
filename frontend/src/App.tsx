import React, { useState, useEffect, useRef } from 'react';
import { 
  Github, 
  Terminal, 
  ShieldAlert, 
  Zap, 
  Sparkles, 
  FolderGit, 
  FileCode, 
  CheckCircle, 
  AlertOctagon, 
  AlertTriangle,
  Download, 
  Layers,
  Code2,
  MessageSquare,
  Send,
  Copy,
  Check,
  Sun,
  Moon
} from 'lucide-react';
import mermaid from 'mermaid';

// Initialize Mermaid outside the component to avoid multiple initializations
try {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'loose',
    themeVariables: {
      background: '#0f172a',
      primaryColor: '#3b82f6',
      primaryTextColor: '#e5e7eb',
      lineColor: '#c084fc',
      nodeBorder: '#3b82f6',
      mainBkg: '#1e293b'
    }
  });
} catch (e) {
  console.error("Failed to initialize Mermaid:", e);
}

// Define Types
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

interface BackendResponse {
  success: boolean;
  repoName: string;
  filesReviewedCount: number;
  analysis: AnalysisData;
}

interface MermaidViewerProps {
  chart: string;
  repoName: string;
}

function MermaidViewer({ chart, repoName }: MermaidViewerProps) {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chart) return;
    
    setError(null);
    const uniqueId = `mermaid-${Math.floor(Math.random() * 100000)}`;
    
    const renderChart = async () => {
      try {
        setSvg('');
        // Clean markdown wraps if present
        let cleanChart = chart.replace(/```mermaid/g, '').replace(/```/g, '').trim();
        if (!cleanChart.startsWith('graph') && !cleanChart.startsWith('flowchart')) {
          cleanChart = `graph TD\n${cleanChart}`;
        }
        
        const { svg: renderedSvg } = await mermaid.render(uniqueId, cleanChart);
        setSvg(renderedSvg);
      } catch (err: any) {
        console.error("Mermaid Render Error:", err);
        setError("Could not render architecture diagram. The AI-generated flowchart has syntax errors.");
      }
    };

    renderChart();
  }, [chart]);

  const downloadSVG = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${repoName}_architecture.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (error) {
    return (
      <div style={{ padding: '20px', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', fontSize: '12px', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ fontWeight: 700, marginBottom: '6px' }}>⚠️ Mermaid Rendering Failed</div>
        <p style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#fca5a5' }}>{error}</p>
        <pre style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '6px', fontSize: '10px', color: '#9ca3af', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{chart}</pre>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button 
          onClick={downloadSVG}
          disabled={!svg}
          style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#60a5fa', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s ease' }}
          className="hover:bg-blue-500/20"
        >
          <Download size={14} /> Download SVG Diagram
        </button>
      </div>
      <div 
        ref={containerRef}
        style={{ display: 'flex', justifyContent: 'center', background: 'rgba(15,23,42,0.4)', padding: '24px', borderRadius: '8px', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.05)', boxSizing: 'border-box', width: '100%' }}
        dangerouslySetInnerHTML={{ __html: svg || '<span style="color:#9ca3af;font-size:12px;">Generating visual flowchart...</span>' }}
      />
    </div>
  );
}

interface CopyButtonProps {
  text: string;
  style?: React.CSSProperties;
  showText?: boolean;
}

function CopyButton({ text, style, showText = false }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      style={{
        background: 'transparent',
        border: 'none',
        borderRadius: '4px',
        padding: '4px 8px',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        justifyContent: 'center',
        color: copied ? '#22c55e' : '#9ca3af',
        transition: 'all 0.2s ease',
        ...style
      }}
      title={copied ? "Copied!" : "Copy Code"}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {showText && (
        <span style={{ fontSize: '11px', fontWeight: 600 }}>
          {copied ? "Copied!" : "Copy"}
        </span>
      )}
    </button>
  );
}

export default function App() {
  // Theme State
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem('reposage_theme');
    return (savedTheme === 'light' || savedTheme === 'dark') ? savedTheme : 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('reposage_theme', theme);
  }, [theme]);

  // Input State
  const [repoUrl, setRepoUrl] = useState('');
  const [company, setCompany] = useState('General');
  const [language, setLanguage] = useState('English');
  const [selectedModel, setSelectedModel] = useState('llama-3.3-70b-versatile');
  
  // Loading & Flow State
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  
  // Response & View State
  const [analysisResult, setAnalysisResult] = useState<BackendResponse | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileFilterQuery, setFileFilterQuery] = useState('');
  const [activeExtFilter, setActiveExtFilter] = useState('All');
  const [activeTab, setActiveTab] = useState<'bugs' | 'security' | 'optimization' | 'styling' | 'metrics'>('bugs');
  const [apiError, setApiError] = useState<string | null>(null);

  // Automated Issue Generator States
  const [isGssocLabelingEnabled, setIsGssocLabelingEnabled] = useState(true);
  const [creatingIssues, setCreatingIssues] = useState<Record<string, boolean>>({});
  const [createdIssues, setCreatedIssues] = useState<Record<string, string>>({});
  const [readmeViewMode, setReadmeViewMode] = useState<'raw' | 'preview'>('preview');

  // Simple markdown compiler for premium preview rendering
  const renderMarkdown = (md: string) => {
    const lines = md.split('\n');
    let inCodeBlock = false;
    let codeBlockLines: string[] = [];

    return lines.map((line, idx) => {
      // Handle multi-line code blocks
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          inCodeBlock = false;
          const codeContent = codeBlockLines.join('\n');
          codeBlockLines = [];
          return (
            <div key={idx} style={{ position: 'relative', margin: '8px 0' }}>
              <pre style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', padding: '10px', paddingRight: '40px', overflowX: 'auto', margin: 0 }}>
                <code style={{ fontFamily: 'monospace', fontSize: '11px', color: '#c084fc' }}>{codeContent}</code>
              </pre>
              <CopyButton 
                text={codeContent} 
                style={{ 
                  position: 'absolute', 
                  top: '8px', 
                  right: '8px', 
                  background: 'rgba(15, 23, 42, 0.6)', 
                  border: '1px solid rgba(255,255,255,0.08)',
                  padding: '4px'
                }} 
              />
            </div>
          );
        } else {
          inCodeBlock = true;
          return null;
        }
      }

      if (inCodeBlock) {
        codeBlockLines.push(line);
        return null;
      }

      // H1 Header
      if (line.startsWith('# ')) {
        return <h1 key={idx} style={{ fontSize: '18px', fontWeight: 800, color: '#f3f4f6', margin: '14px 0 8px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '4px', fontFamily: 'inherit' }}>{line.slice(2)}</h1>;
      }
      // H2 Header
      if (line.startsWith('## ')) {
        return <h2 key={idx} style={{ fontSize: '14px', fontWeight: 700, color: '#e5e7eb', margin: '12px 0 6px 0', fontFamily: 'inherit' }}>{line.slice(3)}</h2>;
      }
      // H3 Header
      if (line.startsWith('### ')) {
        return <h3 key={idx} style={{ fontSize: '12px', fontWeight: 600, color: '#d1d5db', margin: '10px 0 4px 0', fontFamily: 'inherit' }}>{line.slice(4)}</h3>;
      }
      
      // Inline parser helper for bold and code ticks
      const parseInlineStyles = (text: string) => {
        const codeParts = text.split('`');
        return codeParts.map((codePart, cIdx) => {
          if (cIdx % 2 === 1) {
            return <code key={cIdx} style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 4px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '11px', color: '#a855f7' }}>{codePart}</code>;
          }
          const boldParts = codePart.split('**');
          return boldParts.map((boldPart, bIdx) => {
            if (bIdx % 2 === 1) {
              return <strong key={bIdx} style={{ color: '#fff', fontWeight: 700 }}>{boldPart}</strong>;
            }
            return boldPart;
          });
        });
      };

      // Unordered List Items
      if (line.trim().startsWith('- ')) {
        const content = line.trim().slice(2);
        return (
          <li key={idx} style={{ marginLeft: '16px', marginBottom: '4px', fontSize: '12px', color: '#d1d5db', listStyleType: 'disc', fontFamily: 'inherit', lineHeight: 1.6 }}>
            {parseInlineStyles(content)}
          </li>
        );
      }
      // Empty spacing line
      if (!line.trim()) {
        return <div key={idx} style={{ height: '6px' }} />;
      }
      
      // Regular Paragraphs
      return (
        <p key={idx} style={{ margin: '0 0 6px 0', fontSize: '12px', color: '#d1d5db', lineHeight: 1.6, fontFamily: 'inherit' }}>
          {parseInlineStyles(line)}
        </p>
      );
    });
  };

  const handleCreateGitHubIssue = async (file: string, item: ReviewItem, category: string, itemKey: string) => {
    if (!analysisResult) return;
    
    setCreatingIssues(prev => ({ ...prev, [itemKey]: true }));
    
    const title = `[AI Finding] ${category.toUpperCase()}: ${item.type} in ${file} (Line ${item.line})`;
    
    const body = `## 🛡️ RepoSage AI Code Audit Finding\n\n` +
      `An automated AI code audit detected a potential finding in the codebase.\n\n` +
      `### 📄 Context\n` +
      `- **File**: \`${file}\`\n` +
      `- **Line**: ${item.line}\n` +
      `- **Category**: \`${category.toUpperCase()}\`\n\n` +
      `### 📝 Description\n` +
      `${item.description}\n\n` +
      `### 💡 Suggested Actionable Remediation\n` +
      `\`\`\`\n${item.suggestion}\n\`\`\`\n\n` +
      `---\n` +
      `*Generated automatically by **RepoSage AI Copilot**.*`;
      
    const labels = isGssocLabelingEnabled 
      ? ['gssoc26', 'good-first-issue', category] 
      : [category];

    try {
      const response = await fetch('http://localhost:5000/api/issues/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl,
          title,
          body,
          labels
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create GitHub Issue');
      }

      const data = await response.json();
      if (data.success && data.issueUrl) {
        setCreatedIssues(prev => ({ ...prev, [itemKey]: data.issueUrl }));
      } else {
        throw new Error('Response did not contain issue URL');
      }
    } catch (err: any) {
      console.error(err);
      alert(`Error creating issue: ${err.message}`);
    } finally {
      setCreatingIssues(prev => ({ ...prev, [itemKey]: false }));
    }
  };


  // AI Chat with Repository States
  const [activeDashboardView, setActiveDashboardView] = useState<'audit' | 'chat' | 'diagram'>('audit');
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsChatLoading(true);

    try {
      const response = await fetch('http://localhost:5000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history: chatHistory,
          model: selectedModel
        })
      });

      if (!response.ok) {
        throw new Error('Chat service encountered an error.');
      }

      const data = await response.json();
      setChatHistory(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err: any) {
      console.error(err);
      setChatHistory(prev => [
        ...prev,
        { role: 'assistant', content: `❌ Error: ${err.message || 'Could not communicate with the chat endpoint.'}` }
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // GSSoC Issues State (Mentorship Panel)
  const [assignedContributors, setAssignedContributors] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('reposage_contributor_assignments');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved assignments", e);
      }
    }
    return {
      'copy-code-button': 'Siddharth-iang',
      'secret-scanning-rules': 'Siddharth-iang',
      'api-documentation': 'skhazi123',
      'persist-assignments': 'bhavyaxtech',
      'theme-toggle': 'Unassigned',
      'file-filter-search': 'nikita-sdev',
      'html-report-exporter': 'A-R-Narke',
      'complexity-metrics': 'Nikitasoni22'
    };
  });

  const handleAssignContributor = (issueKey: string) => {
    const name = prompt("Enter the contributor's GitHub username to assign this issue:");
    if (name) {
      const updated = {
        ...assignedContributors,
        [issueKey]: name
      };
      setAssignedContributors(updated);
      localStorage.setItem('reposage_contributor_assignments', JSON.stringify(updated));
    }
  };

  const handleResetAssignments = () => {
    const confirmReset = window.confirm("Are you sure you want to reset all contributor assignments?");
    if (confirmReset) {
      const initial = {
        'copy-code-button': 'Unassigned',
        'secret-scanning-rules': 'Unassigned',
        'api-documentation': 'Unassigned',
        'persist-assignments': 'Unassigned',
        'theme-toggle': 'Unassigned',
        'file-filter-search': 'Unassigned',
        'html-report-exporter': 'Unassigned',
        'complexity-metrics': 'Unassigned'
      };
      setAssignedContributors(initial);
      localStorage.setItem('reposage_contributor_assignments', JSON.stringify(initial));
    }
  };

  // Submit Handler to Call Backend API
  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;

    setIsLoading(true);
    setApiError(null);
    setAnalysisResult(null);
    setSelectedFile(null);

    // Simulate structured loading steps for GSSoC wow factor
    const steps = [
      '🔍 Authenticating connection...',
      '📥 Cloning GitHub repository locally...',
      '📁 Traversing directory tree & parsing modules...',
      '🧠 Running LLM analysis using selected AI Model...',
      '📜 Generating custom repository README.md...',
      '🎉 Formatting reports...'
    ];

    let currentStep = 0;
    setLoadingStep(steps[0]);
    const stepInterval = setInterval(() => {
      currentStep++;
      if (currentStep < steps.length) {
        setLoadingStep(steps[currentStep]);
      }
    }, 1200);

    try {
      const response = await fetch('http://localhost:5000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl, company, language, model: selectedModel })
      });

      clearInterval(stepInterval);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Server error occurred during analysis.');
      }

      const data: BackendResponse = await response.json();
      setAnalysisResult(data);
      
      // Select the first file reviewed automatically
      const filesList = Object.keys(data.analysis.fileReviews);
      if (filesList.length > 0) {
        setSelectedFile(filesList[0]);
      }

    } catch (err: any) {
      console.error(err);
      setApiError(err.message || 'Could not connect to the backend server. Make sure node backend is running on port 5000.');
    } finally {
      clearInterval(stepInterval);
      setIsLoading(false);
    }
  };

  // Helper to trigger README download
  const downloadReadme = () => {
    if (!analysisResult) return;
    const element = document.createElement("a");
    const file = new Blob([analysisResult.analysis.generatedReadme], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = "GENERATED_README.md";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Helper to compile and download complete Code Audit Report in Markdown format
  const downloadAuditReport = () => {
    if (!analysisResult) return;
    
    let md = `# 🛡️ RepoSage AI Code Review & Audit Report\n\n`;
    md += `* **Repository**: ${analysisResult.repoName}\n`;
    md += `* **Date**: ${new Date().toLocaleDateString()}\n`;
    md += `* **Total Modules Scanned**: ${analysisResult.filesReviewedCount} files\n\n`;
    
    md += `## 📊 Overall Code Health Summary\n\n`;
    let totalBugs = 0;
    let totalSecurity = 0;
    let totalPerf = 0;
    let totalStyle = 0;
    
    Object.keys(analysisResult.analysis.fileReviews).forEach(file => {
      const review = analysisResult.analysis.fileReviews[file];
      totalBugs += review.bugs?.length || 0;
      totalSecurity += review.security?.length || 0;
      totalPerf += review.optimization?.length || 0;
      totalStyle += review.styling?.length || 0;
    });
    
    md += `| Category | Findings Count | Severity Level |\n`;
    md += `| :--- | :---: | :--- |\n`;
    md += `| 🐞 Logical Bugs | ${totalBugs} | High |\n`;
    md += `| 🛡️ Security Breaches | ${totalSecurity} | Critical |\n`;
    md += `| ⚡ Performance Issues | ${totalPerf} | Medium |\n`;
    md += `| 🎨 Styling & Conventions | ${totalStyle} | Low |\n\n`;
    
    md += `---\n\n`;
    md += `## 🔍 File-by-File Audit Details\n\n`;
    
    Object.keys(analysisResult.analysis.fileReviews).forEach(file => {
      const review = analysisResult.analysis.fileReviews[file];
      const hasIssues = (review.bugs?.length || 0) + (review.security?.length || 0) + (review.optimization?.length || 0) + (review.styling?.length || 0) > 0;
      
      if (hasIssues) {
        md += `### 📄 File: \`${file}\`\n\n`;
        
        if (review.security && review.security.length > 0) {
          md += `#### 🛡️ Security Vulnerabilities\n`;
          review.security.forEach(item => {
            md += `* **Line ${item.line}** [${item.type}]: ${item.description}\n`;
            md += `  * *AI Suggestion*: \`${item.suggestion}\`\n`;
          });
          md += `\n`;
        }
        
        if (review.bugs && review.bugs.length > 0) {
          md += `#### 🐞 Logical Bugs\n`;
          review.bugs.forEach(item => {
            md += `* **Line ${item.line}** [${item.type}]: ${item.description}\n`;
            md += `  * *AI Suggestion*: \`${item.suggestion}\`\n`;
          });
          md += `\n`;
        }
        
        if (review.optimization && review.optimization.length > 0) {
          md += `#### ⚡ Performance Bottlenecks\n`;
          review.optimization.forEach(item => {
            md += `* **Line ${item.line}** [${item.type}]: ${item.description}\n`;
            md += `  * *AI Suggestion*: \`${item.suggestion}\`\n`;
          });
          md += `\n`;
        }
        
        if (review.styling && review.styling.length > 0) {
          md += `#### 🎨 Style & Conventions\n`;
          review.styling.forEach(item => {
            md += `* **Line ${item.line}** [${item.type}]: ${item.description}\n`;
            md += `  * *AI Suggestion*: \`${item.suggestion}\`\n`;
          });
          md += `\n`;
        }
        
        md += `---\n\n`;
      }
    });
    
    md += `## 📄 Generated README.md\n\n`;
    md += analysisResult.analysis.generatedReadme;
    
    const element = document.createElement("a");
    const fileBlob = new Blob([md], { type: 'text/plain' });
    element.href = URL.createObjectURL(fileBlob);
    element.download = `${analysisResult.repoName}_AUDIT_REPORT.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const downloadHTMLReport = async () => {
    if (!analysisResult) return;
    try {
      const response = await fetch('http://localhost:5000/api/reports/html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoName: analysisResult.repoName,
          analysis: analysisResult.analysis
        })
      });
      if (response.ok) {
        const htmlBlob = await response.blob();
        const element = document.createElement("a");
        element.href = URL.createObjectURL(htmlBlob);
        element.download = `${analysisResult.repoName}_AUDIT_REPORT.html`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
      } else {
        console.error("Failed to generate HTML report");
      }
    } catch (err) {
      console.error("Error exporting HTML report:", err);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      
      {/* 🚀 Modern Navbar */}
      <header className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', margin: '16px 24px 8px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)', padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={24} style={{ color: 'white' }} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, background: 'linear-gradient(135deg, var(--text-color) 0%, var(--subtext-color) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              RepoSage <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--highlight-color)', border: '1px solid rgba(168,85,247,0.3)', padding: '2px 8px', borderRadius: '20px', marginLeft: '6px', background: 'rgba(168,85,247,0.1)' }}>GSSoC '26 MVP</span>
            </h1>
            <p style={{ margin: 0, fontSize: '11px', color: 'var(--subtext-color)' }}>Open Source AI Developer Copilot</p>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {analysisResult && (
            <>
              <button 
                onClick={downloadAuditReport}
                style={{ background: 'linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(168,85,247,0.2)' }}
              >
                <Download size={14} /> Export MD
              </button>
              <button 
                onClick={downloadHTMLReport}
                style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', color: '#22c55e', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s' }}
              >
                <FileCode size={14} /> Export HTML
              </button>
            </>
          )}
          <button 
            onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
            style={{ 
              background: 'rgba(255,255,255,0.05)', 
              border: '1px solid var(--border-color)', 
              borderRadius: '6px', 
              padding: '6px 10px', 
              cursor: 'pointer', 
              color: 'var(--text-color)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <a href="https://github.com" target="_blank" rel="noreferrer" style={{ color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', fontSize: '13px', fontWeight: 500 }} className="hover:text-white">
            <Github size={18} /> Codebase
          </a>
          <span style={{ fontSize: '12px', background: '#22c55e', color: '#052e16', fontWeight: 700, padding: '3px 10px', borderRadius: '20px' }}>
            Admin Console
          </span>
        </div>
      </header>

      {/* 🚀 Main Layout Split */}
      <main style={{ flexGrow: 1, padding: '8px 24px 24px 24px', display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px', boxSizing: 'border-box' }}>
        
        {/* LEFT COLUMN: Setup & GSSoC Contributor Portal */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Setup Console */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#f3f4f6', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FolderGit size={18} style={{ color: '#3b82f6' }} /> Import Repository
            </h2>

            <form onSubmit={handleAnalyze} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#9ca3af', marginBottom: '6px', textTransform: 'uppercase' }}>GitHub Repository URL</label>
                <input 
                  type="url" 
                  required
                  placeholder="https://github.com/username/repo"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#fff', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#9ca3af', marginBottom: '6px', textTransform: 'uppercase' }}>Target Company</label>
                  <select 
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#fff', fontSize: '13px', outline: 'none' }}
                  >
                    <option value="General">General</option>
                    <option value="Google">Google</option>
                    <option value="Stripe">Stripe</option>
                    <option value="Meta">Meta</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#9ca3af', marginBottom: '6px', textTransform: 'uppercase' }}>Language</label>
                  <select 
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#fff', fontSize: '13px', outline: 'none' }}
                  >
                    <option value="English">English</option>
                    <option value="Hindi">Hindi</option>
                    <option value="Telugu">Telugu</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#9ca3af', marginBottom: '6px', textTransform: 'uppercase' }}>AI Model</label>
                  <select 
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#fff', fontSize: '13px', outline: 'none' }}
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
                style={{ width: '100%', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', marginTop: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {isLoading ? (
                  <>
                    <span className="spin-slow" style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%' }}></span>
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

          {/* GSSoC Contributor & Mentorship Portal */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#f3f4f6', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={18} style={{ color: '#a855f7' }} /> Mentorship Portal
            </h2>
            <p style={{ margin: '0 0 16px 0', fontSize: '11px', color: '#9ca3af' }}>GSSoC Assigned Contributor Issues</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(168,85,247,0.05)', borderRadius: '6px', border: '1px solid rgba(168,85,247,0.1)' }}>
                <div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#f3f4f6', display: 'block' }}>Copy Code Button</span>
                  <span style={{ fontSize: '10px', color: '#a855f7' }}>🏷️ good first issue</span>
                </div>
                <button 
                  onClick={() => handleAssignContributor('copy-code-button')}
                  style={{ background: assignedContributors['copy-code-button'] === 'Unassigned' ? '#a855f7' : '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {assignedContributors['copy-code-button']}
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(59,130,246,0.05)', borderRadius: '6px', border: '1px solid rgba(59,130,246,0.1)' }}>
                <div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#f3f4f6', display: 'block' }}>Expand Security Rules</span>
                  <span style={{ fontSize: '10px', color: '#3b82f6' }}>🏷️ backend / security</span>
                </div>
                <button 
                  onClick={() => handleAssignContributor('secret-scanning-rules')}
                  style={{ background: assignedContributors['secret-scanning-rules'] === 'Unassigned' ? '#a855f7' : '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {assignedContributors['secret-scanning-rules']}
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(168,85,247,0.05)', borderRadius: '6px', border: '1px solid rgba(168,85,247,0.1)' }}>
                <div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#f3f4f6', display: 'block' }}>API Endpoint Spec</span>
                  <span style={{ fontSize: '10px', color: '#a855f7' }}>🏷️ documentation</span>
                </div>
                <button 
                  onClick={() => handleAssignContributor('api-documentation')}
                  style={{ background: assignedContributors['api-documentation'] === 'Unassigned' ? '#a855f7' : '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {assignedContributors['api-documentation']}
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(34,197,94,0.05)', borderRadius: '6px', border: '1px solid rgba(34,197,94,0.1)' }}>
                <div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#f3f4f6', display: 'block' }}>Persist Contributor State</span>
                  <span style={{ fontSize: '10px', color: '#22c55e' }}>🏷️ frontend</span>
                </div>
                <button 
                  onClick={() => handleAssignContributor('persist-assignments')}
                  style={{ background: assignedContributors['persist-assignments'] === 'Unassigned' ? '#a855f7' : '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {assignedContributors['persist-assignments']}
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(168,85,247,0.05)', borderRadius: '6px', border: '1px solid rgba(168,85,247,0.1)' }}>
                <div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#f3f4f6', display: 'block' }}>Implement Theme Toggle</span>
                  <span style={{ fontSize: '10px', color: '#a855f7' }}>🏷️ frontend / styling</span>
                </div>
                <button 
                  onClick={() => handleAssignContributor('theme-toggle')}
                  style={{ background: assignedContributors['theme-toggle'] === 'Unassigned' ? '#a855f7' : '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {assignedContributors['theme-toggle']}
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(59,130,246,0.05)', borderRadius: '6px', border: '1px solid rgba(59,130,246,0.1)' }}>
                <div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#f3f4f6', display: 'block' }}>File tree filter search</span>
                  <span style={{ fontSize: '10px', color: '#3b82f6' }}>🏷️ frontend</span>
                </div>
                <button 
                  onClick={() => handleAssignContributor('file-filter-search')}
                  style={{ background: assignedContributors['file-filter-search'] === 'Unassigned' ? '#a855f7' : '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {assignedContributors['file-filter-search']}
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(168,85,247,0.05)', borderRadius: '6px', border: '1px solid rgba(168,85,247,0.1)' }}>
                <div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#f3f4f6', display: 'block' }}>Export Report to HTML</span>
                  <span style={{ fontSize: '10px', color: '#a855f7' }}>🏷️ backend</span>
                </div>
                <button 
                  onClick={() => handleAssignContributor('html-report-exporter')}
                  style={{ background: assignedContributors['html-report-exporter'] === 'Unassigned' ? '#a855f7' : '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {assignedContributors['html-report-exporter']}
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(34,197,94,0.05)', borderRadius: '6px', border: '1px solid rgba(34,197,94,0.1)' }}>
                <div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#f3f4f6', display: 'block' }}>Complexity Metrics Analyzer</span>
                  <span style={{ fontSize: '10px', color: '#22c55e' }}>🏷️ backend</span>
                </div>
                <button 
                  onClick={() => handleAssignContributor('complexity-metrics')}
                  style={{ background: assignedContributors['complexity-metrics'] === 'Unassigned' ? '#a855f7' : '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {assignedContributors['complexity-metrics']}
                </button>
              </div>
              <button
                onClick={handleResetAssignments}
                style={{
                  marginTop: '14px',
                  width: '100%',
                  padding: '8px',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease-in-out'
                }}
              >
                Reset Assignments
              </button>
            </div>
          </div>

        </section>

        {/* RIGHT COLUMN: Loading, Dashboard Audit, or Fallback Welcome Screen */}
        <section style={{ display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
          
          {/* 1. API Error Banner */}
          {apiError && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '14px 20px', color: '#fca5a5', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <AlertOctagon size={20} style={{ color: '#ef4444' }} />
              <div>
                <strong style={{ display: 'block' }}>Backend Connection Error</strong>
                <span>{apiError}</span>
              </div>
            </div>
          )}

          {/* 2. Loading State */}
          {isLoading && (
            <div className="glass-panel" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', gap: '20px' }}>
              <div className="spin-slow" style={{ width: '48px', height: '48px', border: '4px solid rgba(168,85,247,0.1)', borderTopColor: '#a855f7', borderRadius: '50%' }}></div>
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 6px 0', color: '#f3f4f6' }}>AI Analyst is Reviewing Repository</h3>
                <p style={{ margin: 0, fontSize: '13px', color: '#9ca3af', fontStyle: 'italic' }}>{loadingStep}</p>
              </div>
            </div>
          )}

          {/* 3. Welcome / Sandbox Guide (When no scan has occurred yet) */}
          {!isLoading && !analysisResult && (
            <div className="glass-panel" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px', textAlign: 'center', gap: '24px' }}>
              <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Code2 size={48} style={{ color: '#3b82f6' }} />
              </div>
              <div style={{ maxWidth: '500px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 10px 0', color: '#f3f4f6' }}>AI-Powered Code Audit Console</h2>
                <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#9ca3af', lineHeight: 1.5 }}>
                  Enter a public GitHub repository link on the left panel to trigger a complete multi-file AI evaluation. 
                  Our service clones the codebase, audits variables for null risks or hardcoded credentials, and outputs an automated custom README.md structure.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                  <button 
                    onClick={() => {
                      setRepoUrl('https://github.com/google/guava');
                      setCompany('Google');
                    }}
                    style={{ background: 'rgba(255,255,255,0.05)', color: '#d1d5db', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    💡 Load Sample: Guava
                  </button>
                  <button 
                    onClick={() => {
                      setRepoUrl('https://github.com/KalyanReddyB/AuraCore');
                      setCompany('Stripe');
                    }}
                    style={{ background: 'rgba(255,255,255,0.05)', color: '#d1d5db', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    💡 Load Sample: AuraCore
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 4. The Complete Analysis Dashboard (Split Audit View) */}
          {!isLoading && analysisResult && (
            <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '16px', boxSizing: 'border-box' }}>
              
              {/* Dashboard View Selection Tabs */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={() => setActiveDashboardView('audit')}
                  style={{
                    background: activeDashboardView === 'audit' ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.03)',
                    border: '1px solid',
                    borderColor: activeDashboardView === 'audit' ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.08)',
                    color: activeDashboardView === 'audit' ? '#60a5fa' : '#9ca3af',
                    borderRadius: '6px', padding: '8px 16px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s ease-in-out'
                  }}
                >
                  <Layers size={14} /> Code Audit Report
                </button>
                <button 
                  onClick={() => setActiveDashboardView('chat')}
                  style={{
                    background: activeDashboardView === 'chat' ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.03)',
                    border: '1px solid',
                    borderColor: activeDashboardView === 'chat' ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.08)',
                    color: activeDashboardView === 'chat' ? '#c084fc' : '#9ca3af',
                    borderRadius: '6px', padding: '8px 16px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s ease-in-out'
                  }}
                >
                  <MessageSquare size={14} /> AI Code Chatbot
                </button>
                <button 
                  onClick={() => setActiveDashboardView('diagram')}
                  style={{
                    background: activeDashboardView === 'diagram' ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)',
                    border: '1px solid',
                    borderColor: activeDashboardView === 'diagram' ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.08)',
                    color: activeDashboardView === 'diagram' ? '#4ade80' : '#9ca3af',
                    borderRadius: '6px', padding: '8px 16px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s ease-in-out'
                  }}
                >
                  <Sparkles size={14} /> Architecture Diagram
                </button>
              </div>

              <div style={{ 
                flexGrow: 1, 
                display: 'grid', 
                gridTemplateColumns: activeDashboardView === 'audit' ? '240px 1fr 1fr' : '240px 1fr', 
                gap: '20px', 
                boxSizing: 'border-box' 
              }}>
                
                {/* File Tree List */}
                <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '72vh' }}>
                  <h3 style={{ fontSize: '12px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>File Navigator</h3>
                  <input
                    type="text"
                    value={fileFilterQuery}
                    onChange={(e) => setFileFilterQuery(e.target.value)}
                    placeholder="Search files..."
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--input-border)',
                      borderRadius: '6px',
                      color: 'var(--text-color)',
                      fontSize: '11px',
                      boxSizing: 'border-box',
                      marginBottom: '8px',
                      outline: 'none'
                    }}
                  />
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    {['All', 'JS/TS', 'Python', 'CSS/HTML'].map(tag => (
                      <button
                        key={tag}
                        onClick={() => setActiveExtFilter(tag)}
                        style={{
                          background: activeExtFilter === tag ? '#a855f7' : 'rgba(255,255,255,0.05)',
                          border: activeExtFilter === tag ? '1px solid #a855f7' : '1px solid var(--border-color)',
                          borderRadius: '4px',
                          color: activeExtFilter === tag ? 'white' : 'var(--text-color)',
                          padding: '2px 6px',
                          fontSize: '9px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                  {(() => {
                    const filteredFiles = Object.keys(analysisResult.analysis.fileReviews)
                      .filter((filePath) => {
                        const matchesSearch = filePath.toLowerCase().includes(fileFilterQuery.toLowerCase());
                        if (!matchesSearch) return false;
                        
                        const ext = filePath.split('.').pop()?.toLowerCase();
                        if (activeExtFilter === 'JS/TS') {
                          return ['js', 'jsx', 'ts', 'tsx'].includes(ext || '');
                        }
                        if (activeExtFilter === 'Python') {
                          return ext === 'py';
                        }
                        if (activeExtFilter === 'CSS/HTML') {
                          return ['css', 'html'].includes(ext || '');
                        }
                        return true; // All
                      });

                    if (filteredFiles.length === 0) {
                      return (
                        <div style={{ textAlign: 'center', padding: '24px 10px', color: 'var(--subtext-color)', fontSize: '11px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                          <span>🚫 No matching files found</span>
                        </div>
                      );
                    }

                    return filteredFiles.map((filePath) => (
                      <button
                        key={filePath}
                        onClick={() => setSelectedFile(filePath)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          background: selectedFile === filePath ? 'rgba(59,130,246,0.1)' : 'transparent',
                          border: selectedFile === filePath ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
                          color: selectedFile === filePath ? '#60a5fa' : 'var(--text-color)',
                          textAlign: 'left',
                          fontSize: '12px',
                          fontWeight: selectedFile === filePath ? 600 : 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          transition: 'all 0.15s'
                        }}
                      >
                        <FileCode size={14} style={{ color: selectedFile === filePath ? '#60a5fa' : 'var(--subtext-color)' }} />
                        {filePath}
                      </button>
                    ));
                  })()}
                </div>

                {activeDashboardView === 'audit' && (
                  <>
                    {/* Central Audit Hub */}
                    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
                      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px', background: '#3b82f6', color: '#eff6ff', padding: '2px 8px', borderRadius: '20px', fontWeight: 600, textTransform: 'uppercase' }}>File Audit</span>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px', color: '#9ca3af' }}>
                            <input 
                              type="checkbox" 
                              checked={isGssocLabelingEnabled} 
                              onChange={(e) => setIsGssocLabelingEnabled(e.target.checked)}
                              style={{
                                cursor: 'pointer',
                                accentColor: '#a855f7',
                                width: '13px',
                                height: '13px'
                              }}
                            />
                            <span>GSSoC Labeling</span>
                          </label>
                        </div>
                        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f3f4f6', margin: '6px 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          📄 {selectedFile || 'Select a file'}
                        </h3>
                      </div>

                      {/* Compact Metrics Summary Banner */}
                      {selectedFile && analysisResult.analysis.metrics?.[selectedFile] && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
                          {[
                            { label: 'Total Lines', value: analysisResult.analysis.metrics[selectedFile].totalLines, color: '#60a5fa' },
                            { label: 'Code Lines', value: analysisResult.analysis.metrics[selectedFile].codeLines, color: '#22c55e' },
                            { label: 'Comments', value: analysisResult.analysis.metrics[selectedFile].commentLines, color: '#a855f7' },
                            { label: 'Empty Lines', value: analysisResult.analysis.metrics[selectedFile].emptyLines, color: '#f59e0b' }
                          ].map((stat) => (
                            <div
                              key={stat.label}
                              style={{
                                background: `${stat.color}08`,
                                border: `1px solid ${stat.color}25`,
                                borderRadius: '8px',
                                padding: '10px 12px',
                                textAlign: 'center',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--subtext-color)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '4px' }}>{stat.label}</span>
                              <span style={{ fontSize: '18px', fontWeight: 800, color: stat.color, display: 'block' }}>{stat.value ?? '—'}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Audit Tabs */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginBottom: '16px' }}>
                        <button
                          onClick={() => setActiveTab('bugs')}
                          style={{
                            padding: '6px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: '1px solid',
                            background: activeTab === 'bugs' ? 'rgba(249,115,22,0.1)' : 'transparent',
                            borderColor: activeTab === 'bugs' ? 'rgba(249,115,22,0.3)' : 'rgba(255,255,255,0.05)',
                            color: activeTab === 'bugs' ? '#f97316' : '#9ca3af',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                          }}
                        >
                          <AlertTriangle size={12} /> Bugs
                        </button>
                        <button
                          onClick={() => setActiveTab('security')}
                          style={{
                            padding: '6px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: '1px solid',
                            background: activeTab === 'security' ? 'rgba(239,68,68,0.1)' : 'transparent',
                            borderColor: activeTab === 'security' ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.05)',
                            color: activeTab === 'security' ? '#ef4444' : '#9ca3af',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                          }}
                        >
                          <ShieldAlert size={12} /> Security
                        </button>
                        <button
                          onClick={() => setActiveTab('optimization')}
                          style={{
                            padding: '6px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: '1px solid',
                            background: activeTab === 'optimization' ? 'rgba(34,197,94,0.1)' : 'transparent',
                            borderColor: activeTab === 'optimization' ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.05)',
                            color: activeTab === 'optimization' ? '#22c55e' : '#9ca3af',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                          }}
                        >
                          <Zap size={12} /> Perf
                        </button>
                        <button
                          onClick={() => setActiveTab('styling')}
                          style={{
                            padding: '6px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: '1px solid',
                            background: activeTab === 'styling' ? 'rgba(59,130,246,0.1)' : 'transparent',
                            borderColor: activeTab === 'styling' ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.05)',
                            color: activeTab === 'styling' ? '#3b82f6' : '#9ca3af',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                          }}
                        >
                          <Terminal size={12} /> Style
                        </button>
                        <button
                          onClick={() => setActiveTab('metrics')}
                          style={{
                            padding: '6px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: '1px solid',
                            background: activeTab === 'metrics' ? 'rgba(168,85,247,0.1)' : 'transparent',
                            borderColor: activeTab === 'metrics' ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.05)',
                            color: activeTab === 'metrics' ? '#a855f7' : '#9ca3af',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px'
                          }}
                        >
                          <Layers size={12} /> Metrics
                        </button>
                      </div>

                      {/* Audit Items Render */}
                      <div style={{ flexGrow: 1, overflowY: 'auto', maxHeight: '54vh', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {selectedFile && activeTab === 'metrics' ? (
                          (() => {
                            const fileMetrics = analysisResult.analysis.metrics?.[selectedFile] || {
                              totalLines: 0,
                              emptyLines: 0,
                              commentLines: 0,
                              codeLines: 0,
                              functionCount: 0,
                              complexityScore: 0,
                              grade: 'A'
                            };
                            
                            const commentDensity = fileMetrics.totalLines > 0 
                              ? Math.round((fileMetrics.commentLines / fileMetrics.totalLines) * 100) 
                              : 0;

                            const codePct = fileMetrics.totalLines > 0 ? Math.round((fileMetrics.codeLines / fileMetrics.totalLines) * 100) : 0;
                            const commentPct = fileMetrics.totalLines > 0 ? Math.round((fileMetrics.commentLines / fileMetrics.totalLines) * 100) : 0;
                            const emptyPct = fileMetrics.totalLines > 0 ? (100 - codePct - commentPct) : 0;

                            const gradeColors = {
                              'A': { text: '#22c55e', bg: 'rgba(34,197,94,0.05)', border: 'rgba(34,197,94,0.15)' },
                              'B': { text: '#3b82f6', bg: 'rgba(59,130,246,0.05)', border: 'rgba(59,130,246,0.15)' },
                              'C': { text: '#eab308', bg: 'rgba(234,179,8,0.05)', border: 'rgba(234,179,8,0.15)' },
                              'D': { text: '#f97316', bg: 'rgba(249,115,22,0.05)', border: 'rgba(249,115,22,0.15)' },
                              'F': { text: '#ef4444', bg: 'rgba(239,68,68,0.05)', border: 'rgba(239,68,68,0.15)' }
                            };
                            
                            const currentGrade = gradeColors[fileMetrics.grade as keyof typeof gradeColors] || gradeColors['A'];

                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {/* Complexity Card */}
                                <div style={{ background: currentGrade.bg, border: `1px solid ${currentGrade.border}`, padding: '16px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div>
                                    <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', color: 'var(--text-color)', fontWeight: 700 }}>Complexity Grade</h4>
                                    <span style={{ fontSize: '11px', color: 'var(--subtext-color)' }}>Based on SLOC and function densities.</span>
                                  </div>
                                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: `2px solid ${currentGrade.text}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 800, color: currentGrade.text }}>
                                    {fileMetrics.grade}
                                  </div>
                                </div>

                                {/* Line Composition Stacked Bar */}
                                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', padding: '14px', borderRadius: '8px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-color)' }}>Line Composition</span>
                                    <span style={{ fontSize: '10px', color: 'var(--subtext-color)' }}>{fileMetrics.totalLines} total lines</span>
                                  </div>
                                  <div style={{ height: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden', display: 'flex' }}>
                                    <div style={{ height: '100%', width: `${codePct}%`, background: '#22c55e', transition: 'width 0.5s ease-out' }} title={`Code: ${codePct}%`} />
                                    <div style={{ height: '100%', width: `${commentPct}%`, background: '#a855f7', transition: 'width 0.5s ease-out' }} title={`Comments: ${commentPct}%`} />
                                    <div style={{ height: '100%', width: `${emptyPct}%`, background: '#f59e0b', transition: 'width 0.5s ease-out' }} title={`Empty: ${emptyPct}%`} />
                                  </div>
                                  <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                      <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#22c55e' }} />
                                      <span style={{ fontSize: '10px', color: 'var(--subtext-color)', fontWeight: 600 }}>Code {codePct}%</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                      <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#a855f7' }} />
                                      <span style={{ fontSize: '10px', color: 'var(--subtext-color)', fontWeight: 600 }}>Comments {commentPct}%</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                      <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#f59e0b' }} />
                                      <span style={{ fontSize: '10px', color: 'var(--subtext-color)', fontWeight: 600 }}>Empty {emptyPct}%</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Details Grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                                  <div style={{ background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.12)', padding: '12px', borderRadius: '8px' }}>
                                    <span style={{ fontSize: '10px', color: '#22c55e', textTransform: 'uppercase', fontWeight: 600 }}>Code Lines</span>
                                    <h3 style={{ margin: '4px 0 0 0', fontSize: '18px', color: 'var(--text-color)', fontWeight: 800 }}>{fileMetrics.codeLines}</h3>
                                  </div>
                                  <div style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.12)', padding: '12px', borderRadius: '8px' }}>
                                    <span style={{ fontSize: '10px', color: '#a855f7', textTransform: 'uppercase', fontWeight: 600 }}>Comment Lines</span>
                                    <h3 style={{ margin: '4px 0 0 0', fontSize: '18px', color: 'var(--text-color)', fontWeight: 800 }}>{fileMetrics.commentLines}</h3>
                                  </div>
                                  <div style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.12)', padding: '12px', borderRadius: '8px' }}>
                                    <span style={{ fontSize: '10px', color: '#f59e0b', textTransform: 'uppercase', fontWeight: 600 }}>Empty Lines</span>
                                    <h3 style={{ margin: '4px 0 0 0', fontSize: '18px', color: 'var(--text-color)', fontWeight: 800 }}>{fileMetrics.emptyLines}</h3>
                                  </div>
                                </div>

                                {/* Secondary Metrics Grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: '8px' }}>
                                    <span style={{ fontSize: '10px', color: 'var(--subtext-color)', textTransform: 'uppercase', fontWeight: 600 }}>Total Lines</span>
                                    <h3 style={{ margin: '4px 0 0 0', fontSize: '18px', color: 'var(--text-color)', fontWeight: 800 }}>{fileMetrics.totalLines}</h3>
                                  </div>
                                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: '8px' }}>
                                    <span style={{ fontSize: '10px', color: 'var(--subtext-color)', textTransform: 'uppercase', fontWeight: 600 }}>Functions</span>
                                    <h3 style={{ margin: '4px 0 0 0', fontSize: '18px', color: 'var(--text-color)', fontWeight: 800 }}>{fileMetrics.functionCount}</h3>
                                  </div>
                                </div>

                                {/* Progress Bars */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                                  <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--subtext-color)', marginBottom: '4px', fontWeight: 600 }}>
                                      <span>Complexity Index Score</span>
                                      <span>{fileMetrics.complexityScore} / 50</span>
                                    </div>
                                    <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
                                      <div style={{ height: '100%', width: `${Math.min((fileMetrics.complexityScore / 50) * 100, 100)}%`, background: currentGrade.text, borderRadius: '10px', transition: 'width 0.5s ease-out' }} />
                                    </div>
                                  </div>

                                  <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--subtext-color)', marginBottom: '4px', fontWeight: 600 }}>
                                      <span>Comment Coverage Density</span>
                                      <span>{commentDensity}%</span>
                                    </div>
                                    <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
                                      <div style={{ height: '100%', width: `${Math.min(commentDensity, 100)}%`, background: '#10b981', borderRadius: '10px', transition: 'width 0.5s ease-out' }} />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })()
                        ) : selectedFile && activeTab !== 'metrics' && (analysisResult.analysis.fileReviews[selectedFile]?.[activeTab]?.length > 0) ? (
                          (analysisResult.analysis.fileReviews[selectedFile][activeTab] as any[]).map((item: any, index: number) => {
                            const itemKey = `${selectedFile}-${activeTab}-${index}`;
                            return (
                              <div 
                                key={index}
                                style={{
                                  padding: '12px 14px',
                                  borderRadius: '8px',
                                  background: 'rgba(15,23,42,0.4)',
                                  borderLeft: '3px solid',
                                  borderColor: activeTab === 'bugs' ? '#f97316' : activeTab === 'security' ? '#ef4444' : activeTab === 'optimization' ? '#22c55e' : '#3b82f6'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#f3f4f6' }}>{item.type}</span>
                                  <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.08)', color: '#9ca3af', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                                    Line {item.line}
                                  </span>
                                </div>
                                <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#d1d5db', lineHeight: 1.4 }}>{item.description}</p>
                                <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', padding: '8px 10px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <span style={{ display: 'block', fontSize: '9px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>💡 AI Recommendation</span>
                                    <CopyButton text={item.suggestion} style={{ padding: '2px' }} />
                                  </div>
                                  <code style={{ fontSize: '11px', color: '#a855f7', wordBreak: 'break-all' }}>{item.suggestion}</code>
                                </div>
                                <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                                  {createdIssues[itemKey] ? (
                                    <a 
                                      href={createdIssues[itemKey]} 
                                      target="_blank" 
                                      rel="noreferrer"
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        background: 'rgba(34,197,94,0.1)',
                                        border: '1px solid rgba(34,197,94,0.3)',
                                        color: '#4ade80',
                                        borderRadius: '6px',
                                        padding: '6px 12px',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        textDecoration: 'none',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      🟢 View Issue on GitHub
                                    </a>
                                  ) : (
                                    <button
                                      onClick={() => handleCreateGitHubIssue(selectedFile, item, activeTab, itemKey)}
                                      disabled={creatingIssues[itemKey]}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        background: 'rgba(168,85,247,0.1)',
                                        border: '1px solid rgba(168,85,247,0.3)',
                                        color: '#c084fc',
                                        borderRadius: '6px',
                                        padding: '6px 12px',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        opacity: creatingIssues[itemKey] ? 0.6 : 1,
                                        pointerEvents: creatingIssues[itemKey] ? 'none' : 'auto'
                                      }}
                                    >
                                      {creatingIssues[itemKey] ? (
                                        <>
                                          <span className="spin-slow" style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid #c084fc', borderTopColor: 'transparent', borderRadius: '50%' }}></span>
                                          Creating...
                                        </>
                                      ) : (
                                        <>🚨 Create GitHub Issue</>
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div style={{ textAlign: 'center', padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                            <CheckCircle size={32} style={{ color: '#22c55e' }} />
                            <div>
                              <span style={{ fontSize: '13px', fontWeight: 600, color: '#f3f4f6', display: 'block' }}>All Clean!</span>
                              <span style={{ fontSize: '11px', color: '#9ca3af' }}>No issues found in this category for this file.</span>
                            </div>
                          </div>
                        )}
                      </div>

                    </div>

                    {/* generated README.md Preview */}
                    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
                      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontSize: '10px', background: '#a855f7', color: '#fae8ff', padding: '2px 8px', borderRadius: '20px', fontWeight: 600, textTransform: 'uppercase' }}>Documentation</span>
                          <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f3f4f6', margin: '4px 0 0 0' }}>📄 GENERATED_README.md</h3>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '2px' }}>
                            <button
                              onClick={() => setReadmeViewMode('preview')}
                              style={{
                                background: readmeViewMode === 'preview' ? 'rgba(168,85,247,0.15)' : 'transparent',
                                border: 'none',
                                color: readmeViewMode === 'preview' ? '#c084fc' : '#9ca3af',
                                borderRadius: '4px',
                                padding: '4px 10px',
                                fontSize: '10px',
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                            >
                              Preview
                            </button>
                            <button
                              onClick={() => setReadmeViewMode('raw')}
                              style={{
                                background: readmeViewMode === 'raw' ? 'rgba(168,85,247,0.15)' : 'transparent',
                                border: 'none',
                                color: readmeViewMode === 'raw' ? '#c084fc' : '#9ca3af',
                                borderRadius: '4px',
                                padding: '4px 10px',
                                fontSize: '10px',
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                            >
                              Raw
                            </button>
                          </div>
                           <CopyButton 
                            text={analysisResult.analysis.generatedReadme} 
                            showText={true}
                            style={{ 
                              background: 'rgba(168,85,247,0.1)', 
                              border: '1px solid rgba(168,85,247,0.3)', 
                              color: '#c084fc', 
                              borderRadius: '6px', 
                              padding: '6px 12px', 
                              cursor: 'pointer' 
                            }} 
                          />
                          <button 
                            onClick={downloadReadme}
                            style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', color: '#c084fc', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                          >
                            <Download size={14} /> Download
                          </button>
                        </div>
                      </div>

                      {readmeViewMode === 'raw' ? (
                        <div style={{ flexGrow: 1, overflowY: 'auto', maxHeight: '60vh', background: 'rgba(15,23,42,0.4)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '12px', lineHeight: 1.5, color: '#d1d5db', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                          {analysisResult.analysis.generatedReadme}
                        </div>
                      ) : (
                        <div style={{ flexGrow: 1, overflowY: 'auto', maxHeight: '60vh', background: 'rgba(15,23,42,0.4)', padding: '16px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column' }}>
                          {renderMarkdown(analysisResult.analysis.generatedReadme)}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {activeDashboardView === 'chat' && (
                  <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', minHeight: '68vh' }}>
                    
                    {/* Chat Header */}
                    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontSize: '10px', background: '#a855f7', color: '#fae8ff', padding: '2px 8px', borderRadius: '20px', fontWeight: 600, textTransform: 'uppercase' }}>Interactive Chat</span>
                        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f3f4f6', margin: '4px 0 0 0' }}>💬 Chat with Codebase</h3>
                      </div>
                      <span style={{ fontSize: '11px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        Active: <strong style={{ color: '#c084fc' }}>{selectedModel.split('-')[0].toUpperCase()}</strong>
                      </span>
                    </div>

                    {/* Messages Scroller */}
                    <div style={{ flexGrow: 1, overflowY: 'auto', paddingRight: '4px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '52vh' }}>
                      {chatHistory.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '30px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', gap: '16px' }}>
                          <div style={{ background: 'rgba(168, 85, 247, 0.1)', padding: '16px', borderRadius: '50%' }}>
                            <Sparkles size={32} style={{ color: '#a855f7' }} />
                          </div>
                          <div style={{ maxWidth: '400px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#f3f4f6', display: 'block', marginBottom: '4px' }}>Ask anything about your repository</span>
                            <span style={{ fontSize: '11px', color: '#9ca3af', lineHeight: 1.5, display: 'block' }}>
                              I have parsed the codebase source code. Ask questions like:
                            </span>
                          </div>
                          
                          {/* Suggested Queries */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px', width: '100%', maxWidth: '380px', marginTop: '6px' }}>
                            {[
                              "Explain the overall architecture and setup of this repo.",
                              "What are the main entry points and critical API paths?",
                              "Can you find any security flaws or logic bugs here?",
                              "Write a simple automated test suite for this module structure."
                            ].map((queryText, qIdx) => (
                              <button
                                key={qIdx}
                                onClick={() => {
                                  setChatInput(queryText);
                                }}
                                style={{
                                  background: 'rgba(255,255,255,0.02)',
                                  border: '1px solid rgba(255,255,255,0.05)',
                                  borderRadius: '6px',
                                  padding: '8px 12px',
                                  fontSize: '11px',
                                  color: '#d1d5db',
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                  transition: 'all 0.15s ease'
                                }}
                                className="hover:bg-white/5"
                              >
                                💡 {queryText}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        chatHistory.map((msg, index) => (
                          <div 
                            key={index}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                              maxWidth: '85%',
                              background: msg.role === 'user' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(15, 23, 42, 0.4)',
                              border: '1px solid',
                              borderColor: msg.role === 'user' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                              borderRadius: msg.role === 'user' ? '12px 12px 0 12px' : '12px 12px 12px 0',
                              padding: '10px 14px',
                              boxSizing: 'border-box'
                            }}
                          >
                            <span style={{ fontSize: '9px', fontWeight: 700, color: msg.role === 'user' ? '#60a5fa' : '#c084fc', textTransform: 'uppercase', marginBottom: '4px' }}>
                              {msg.role === 'user' ? 'You' : 'RepoSage Assistant'}
                            </span>
                            <div style={{ fontSize: '12px', color: '#e5e7eb', lineHeight: 1.5, whiteSpace: 'pre-wrap', fontFamily: msg.role === 'assistant' ? 'monospace' : 'inherit' }}>
                              {msg.content}
                            </div>
                          </div>
                        ))
                      )}

                      {isChatLoading && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignSelf: 'flex-start', background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '12px 12px 12px 0', padding: '10px 14px', gap: '6px', width: '80px' }}>
                          <span style={{ fontSize: '9px', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase' }}>RepoSage</span>
                          <div style={{ display: 'flex', gap: '4px', padding: '2px 0' }}>
                            <span className="typing-dot" style={{ width: '5px', height: '5px', background: '#c084fc', borderRadius: '50%', display: 'inline-block' }}></span>
                            <span className="typing-dot" style={{ width: '5px', height: '5px', background: '#c084fc', borderRadius: '50%', display: 'inline-block', animationDelay: '0.2s' }}></span>
                            <span className="typing-dot" style={{ width: '5px', height: '5px', background: '#c084fc', borderRadius: '50%', display: 'inline-block', animationDelay: '0.4s' }}></span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Chat Input form */}
                    <form onSubmit={handleSendChatMessage} style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Ask a question about the codebase files..."
                        style={{
                          flexGrow: 1,
                          background: 'rgba(0, 0, 0, 0.2)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '6px',
                          color: '#f3f4f6',
                          padding: '10px 14px',
                          fontSize: '12px',
                          outline: 'none'
                        }}
                      />
                      <button
                        type="submit"
                        disabled={isChatLoading || !chatInput.trim()}
                        style={{
                          background: 'linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '10px 18px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: (isChatLoading || !chatInput.trim()) ? 0.6 : 1,
                          transition: 'opacity 0.15s ease'
                        }}
                      >
                        <Send size={14} />
                      </button>
                    </form>

                  </div>
                )}

                {activeDashboardView === 'diagram' && (
                  <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', minHeight: '68vh', width: '100%' }}>
                    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px', marginBottom: '16px' }}>
                      <span style={{ fontSize: '10px', background: '#22c55e', color: '#dcfce7', padding: '2px 8px', borderRadius: '20px', fontWeight: 600, textTransform: 'uppercase' }}>Visualizer</span>
                      <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f3f4f6', margin: '4px 0 0 0' }}>📊 Codebase Dependency Flow</h3>
                    </div>
                    {analysisResult.analysis.mermaidDiagram ? (
                      <MermaidViewer 
                        chart={analysisResult.analysis.mermaidDiagram} 
                        repoName={analysisResult.repoName} 
                      />
                    ) : (
                      <div style={{ color: '#9ca3af', fontSize: '12px', padding: '20px', textAlign: 'center' }}>
                        No architecture diagram was generated for this repository. Try re-running the analysis.
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          )}

        </section>

      </main>

      {/* 🚀 Sleek Footer */}
      <footer style={{ marginTop: 'auto', background: 'rgba(15, 23, 42, 0.4)', padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#9ca3af' }}>
        <span>RepoSage AI © 2026. Made with 💜 for GirlScript Summer of Code (GSSoC).</span>
        <div style={{ display: 'flex', gap: '16px' }}>
          <span>Mentors: Kalyan Reddy Bhoompally</span>
          <span>Status: Production MVP Ready</span>
        </div>
      </footer>

    </div>
  );
}

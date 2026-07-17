import React, { useState, useEffect, useRef } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import { useStore, ChatMessage } from '../store/useStore';
import SettingsModal from "../components/SettingsModal";
import DashboardFooter from "../components/DashboardFooter";
import KeyboardShortcutsHelp from "../components/KeyboardShortcutsHelp";
import { VulnerabilitiesBarChart } from '../components/VulnerabilitiesBarChart';
import MarkdownErrorBoundary from '../components/MarkdownErrorBoundary';
import CopyToClipboardButton from "../components/CopyToClipboardButton";
import SectionErrorBoundary from "../components/SectionErrorBoundary";
import AnalysisForm from "../components/AnalysisForm";
import AuditHistoryPanel from "../components/AuditHistoryPanel";
import MentorshipPortal from "../components/MentorshipPortal";
import HealthScoreSection from "../components/HealthScoreSection";
import ChatPanel from "../components/ChatPanel";
import MermaidDiagramViewer from "../components/MermaidDiagramViewer";
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Terminal,
  ShieldAlert,
  Zap,
  Sparkles,
  FileCode,
  CheckCircle,
  AlertOctagon,
  AlertTriangle,
  Download,
  FileDown,
  Layers,
  Code2,
  MessageSquare,
  Search,
  X,
  ChevronsUpDown,
  ChevronsDownUp,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
} from "lucide-react";
import { handleMarkdownExport, handleHtmlExport, handlePdfExport } from "../utils/exportUtils";
import { sanitizeAuditEntry } from "../utils/sanitize";
// Path resolves correctly: pages/ -> ../utils/api -> frontend/src/utils/api
import { apiFetch } from "../utils/api";

const LazyMetricsChart = React.lazy(() =>
  import('../components/MetricsChart').then((module) => ({ default: module.MetricsChart }))
);



const getSavedAiSettings = () => {
  try {
    const saved = JSON.parse(
      localStorage.getItem("reposage_ai_settings") || "{}"
    );
    return saved && typeof saved === "object" ? saved : {};
  } catch (error) {
    console.warn("Invalid saved AI settings; using defaults.", error);
    return {};
  }
};

// Define Types
export interface ReviewItem {
  type: string;
  line: number;
  description: string;
  suggestion: string;
}

export interface FileReview {
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
  repositoryHealth?: any;
  dependencyReport?: any;
  _mock?: boolean;
}

export interface BackendResponse {
  dependencyReport?: {
  dependencies: {
    name: string;
    currentVersion: string;
    latestVersion: string;
    risk: string;
    deprecated: boolean;
    vulnerable: boolean;
    recommendation: string;
  }[];
};
  prSummary?: {
  overallPurpose: string;
  filesChanged: number;
  majorLogicUpdates: string[];
  potentialRisks: string[];
  breakingChanges: string[];
  testingRecommendations: string[];
};
  repositoryHealth?: any;
  success: boolean;
  repoName: string;
  filesReviewedCount: number;
  analysis: AnalysisData;
  sessionId?: string;
  sessionPersisted?: boolean;
  _mock?: boolean;
  partial_review?: boolean;
  warnings?: Array<{ file: string; warning: string }>;
}



export interface AuditHistoryEntry {
  id: string;
  repoUrl: string;
  repoName: string;
  auditedAt: string;
  totalFindings: number;
  overallGrade: string;
  response: BackendResponse;
}

export default function Dashboard() {
  const [showSettings, setShowSettings] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Input State
  const [repoUrl, setRepoUrl] = useState("");
  const [company, setCompany] = useState("General");
  const [language, setLanguage] = useState("English");
  const [selectedModel, setSelectedModel] = useState("llama-3.3-70b-versatile");

  // Loading & Flow State
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");

  // Response & View State
  const { analysisResult, setAnalysisResult, selectedFile, setSelectedFile, chatHistory, setChatHistory } = useStore();
  const [fileFilterQuery, setFileFilterQuery] = useState('');
  // Debounced search to prevent heavy filtering on every keystroke
  const debouncedFileFilterQuery = useDebounce(fileFilterQuery, 300);
  const [isClearHovered, setIsClearHovered] = useState(false);
  const [activeExtFilter, setActiveExtFilter] = useState('All');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'bugs' | 'security' | 'optimization' | 'styling' | 'metrics'>('bugs');
  const [apiError, setApiError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState(false);

  // Accessibility Announcement State
  const [announcement, setAnnouncement] = useState("");
  const hasResult = !!analysisResult;

  useEffect(() => {
    if (isLoading) {
      setAnnouncement("Starting AI analysis, please wait...");
    } else if (hasResult) {
      setAnnouncement("Analysis complete. Results are now available below.");
    }
  }, [isLoading, hasResult]);

  // --- File Tree Utilities ---
  interface FileTreeNode {
    name: string;
    fullPath: string;
    isFolder: boolean;
    children: FileTreeNode[];
  }

  const buildFileTree = (filePaths: string[]): FileTreeNode[] => {
    const root: FileTreeNode[] = [];
    const folderMap = new Map<string, FileTreeNode>();

    for (const filePath of filePaths) {
      const parts = filePath.split('/');
      let currentLevel = root;
      let currentPath = '';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isLast = i === parts.length - 1;

        if (isLast) {
          // It's a file
          currentLevel.push({
            name: part,
            fullPath: filePath,
            isFolder: false,
            children: [],
          });
        } else {
          // It's a folder
          let folder = folderMap.get(currentPath);
          if (!folder) {
            folder = {
              name: part,
              fullPath: currentPath,
              isFolder: true,
              children: [],
            };
            folderMap.set(currentPath, folder);
            currentLevel.push(folder);
          }
          currentLevel = folder.children;
        }
      }
    }

    // Sort: folders first, then files, both alphabetically
    const sortTree = (nodes: FileTreeNode[]): FileTreeNode[] => {
      nodes.sort((a, b) => {
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        return a.name.localeCompare(b.name);
      });
      nodes.forEach(n => { if (n.isFolder) sortTree(n.children); });
      return nodes;
    };

    return sortTree(root);
  };

  const fileTreeData = React.useMemo(() => {
    if (!analysisResult?.analysis?.fileReviews) return [];
    
    const filteredFiles = Object.keys(
      analysisResult.analysis.fileReviews,
    ).filter((filePath) => {
      const matchesSearch = filePath
        .toLowerCase()
        .includes(debouncedFileFilterQuery.toLowerCase());
      if (!matchesSearch) return false;

      const ext = filePath.split(".").pop()?.toLowerCase();
      if (activeExtFilter === "JS/TS") {
        return ["js", "jsx", "ts", "tsx"].includes(ext || "");
      }
      if (activeExtFilter === "Python") {
        return ext === "py";
      }
      if (activeExtFilter === "CSS/HTML") {
        return ["css", "html"].includes(ext || "");
      }
      return true; // All
    });

    return buildFileTree(filteredFiles);
  }, [analysisResult, debouncedFileFilterQuery, activeExtFilter]);

  const collectAllFolderPaths = (nodes: FileTreeNode[]): string[] => {
    const paths: string[] = [];
    const traverse = (list: FileTreeNode[]) => {
      for (const node of list) {
        if (node.isFolder) {
          paths.push(node.fullPath);
          traverse(node.children);
        }
      }
    };
    traverse(nodes);
    return paths;
  };

  const handleExpandAll = (tree: FileTreeNode[]) => {
    const allPaths = collectAllFolderPaths(tree);
    setExpandedFolders(new Set(allPaths));
  };

  const handleCollapseAll = () => {
    setExpandedFolders(new Set());
  };

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Escape to close modals and clear errors
      if (e.key === "Escape") {
        setApiError(null);
        setShowSettings(false);
        setShowShortcutsHelp(false);
        if (document.activeElement === searchInputRef.current) {
          searchInputRef.current?.blur();
        }
      }

      // Ctrl+K to search files
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      // / to focus search input
      if (e.key === "/" && e.target !== searchInputRef.current &&
          document.activeElement?.tagName !== "INPUT" &&
          document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      // Ctrl+N to start a new analysis
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        const repoInput = document.querySelector<HTMLInputElement>("input[placeholder*='github.com']");
        repoInput?.focus();
      }

      // Ctrl+L to clear chat history
      if ((e.metaKey || e.ctrlKey) && e.key === "l") {
        e.preventDefault();
        setChatHistory([]);
      }

      // Ctrl+B to toggle sidebar (focus file list)
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        const fileTree = document.querySelector<HTMLElement>("[class*='file-tree'], [class*='FileTree']");
        fileTree?.focus();
      }

      // Ctrl+E to export HTML report
      if ((e.metaKey || e.ctrlKey) && e.key === "e") {
        e.preventDefault();
        downloadReadme();
      }

      // Ctrl+, to open settings
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setShowSettings(true);
      }

      // ? to show shortcuts
      if (e.key === "?" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        setShowShortcutsHelp(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [apiError, setChatHistory]);

  const isValidAuditEntry = (entry: unknown): entry is AuditHistoryEntry => {
    if (!entry || typeof entry !== 'object') return false;
    const e = entry as Record<string, unknown>;
    return typeof e.id === 'string' &&
      typeof e.repoUrl === 'string' &&
      typeof e.repoName === 'string' &&
      typeof e.auditedAt === 'string' &&
      typeof e.totalFindings === 'number' &&
      typeof e.overallGrade === 'string' &&
      e.response !== null && typeof e.response === 'object';
  };

  const [auditHistory, setAuditHistory] = useState<AuditHistoryEntry[]>(() => {
    try {
      const savedHistory = localStorage.getItem('reposage_audit_history');
      if (!savedHistory) return [];
      const parsed = JSON.parse(savedHistory);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isValidAuditEntry);
    } catch (err) {
      console.error('Failed to load audit history:', err);
      return [];
    }
  });

  // Automated Issue Generator States
  const [isGssocLabelingEnabled, setIsGssocLabelingEnabled] = useState(true);
  const [creatingIssues, setCreatingIssues] = useState<Record<string, boolean>>(
    {},
  );
  const [createdIssues, setCreatedIssues] = useState<Record<string, string>>(
    {},
  );
  const [readmeViewMode, setReadmeViewMode] = useState<"raw" | "preview">(
    "preview",
  );


  // Simple markdown compiler for premium preview rendering
  const renderMarkdown = (md: string) => {
    return (
      <ReactMarkdown
        components={{
          code(props: any) {
            const { children, className, node, ...rest } = props;
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');
            const isBlock = match || String(children).includes('\n');

            if (match) {
              return (
                <div style={{ position: "relative", margin: "8px 0" }}>
                  <SyntaxHighlighter
                    {...rest}
                    style={vscDarkPlus as any}
                    language={match[1]}
                    PreTag="div"
                    customStyle={{
                      background: "rgba(0,0,0,0.3)",
                      border: "1px solid rgba(255,255,255,0.05)",
                      borderRadius: "6px",
                      padding: "10px",
                      paddingRight: "40px",
                      overflowX: "auto",
                      margin: 0,
                      fontFamily: "monospace",
                      fontSize: "11px",
                    }}
                  >
                    {codeString}
                  </SyntaxHighlighter>
                  <CopyToClipboardButton
                    textToCopy={codeString}
                    style={{
                      position: "absolute",
                      top: "8px",
                      right: "8px",
                      background: "rgba(15, 23, 42, 0.6)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      padding: "4px",
                    }}
                  />
                </div>
              );
            }

            if (isBlock) {
              return (
                <div style={{ position: "relative", margin: "8px 0" }}>
                  <pre
                    style={{
                      background: "rgba(0,0,0,0.3)",
                      border: "1px solid rgba(255,255,255,0.05)",
                      borderRadius: "6px",
                      padding: "10px",
                      paddingRight: "40px",
                      overflowX: "auto",
                      margin: 0,
                    }}
                  >
                    <code
                      style={{
                        fontFamily: "monospace",
                        fontSize: "11px",
                        color: "#c084fc",
                      }}
                      {...rest}
                    >
                      {children}
                    </code>
                  </pre>
                  <CopyToClipboardButton
                    textToCopy={codeString}
                    style={{
                      position: "absolute",
                      top: "8px",
                      right: "8px",
                      background: "rgba(15, 23, 42, 0.6)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      padding: "4px",
                    }}
                  />
                </div>
              );
            }

            return (
              <code
                style={{
                  background: "#1e1e1e",
                  padding: "2px 4px",
                  borderRadius: "4px",
                  fontFamily: "monospace",
                  fontSize: "11px",
                  color: "#d8b4fe",
                }}
                {...rest}
              >
                {children}
              </code>
            );
          },
          h1: ({ node, ...props }: any) => <h1 style={{ fontSize: "18px", fontWeight: 800, color: "#f3f4f6", margin: "14px 0 8px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "4px" }} {...props} />,
          h2: ({ node, ...props }: any) => <h2 style={{ fontSize: "14px", fontWeight: 700, color: "#e5e7eb", margin: "12px 0 6px 0" }} {...props} />,
          h3: ({ node, ...props }: any) => <h3 style={{ fontSize: "12px", fontWeight: 600, color: "#d1d5db", margin: "10px 0 4px 0" }} {...props} />,
          li: ({ node, ...props }: any) => <li style={{ marginLeft: "16px", marginBottom: "4px", fontSize: "12px", color: "#d1d5db", fontFamily: "inherit", lineHeight: 1.6 }} {...props} />,
          p: ({ node, ...props }: any) => <p style={{ margin: "0 0 6px 0", fontSize: "12px", color: "#d1d5db", lineHeight: 1.6, fontFamily: "inherit" }} {...props} />,
          strong: ({ node, ...props }: any) => <strong style={{ color: "#fff", fontWeight: 700 }} {...props} />
        }}
      >
        {md}
      </ReactMarkdown>
    );
  };

  const handleCreateGitHubIssue = async (
    file: string,
    item: ReviewItem,
    category: string,
    itemKey: string,
  ) => {
    if (!analysisResult) return;

    setCreatingIssues((prev) => ({ ...prev, [itemKey]: true }));

    const title = `[AI Finding] ${category.toUpperCase()}: ${item.type} in ${file} (Line ${item.line})`;

    const body =
      `## 🛡️ RepoSage AI Code Audit Finding\n\n` +
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

    const gssoLabel = localStorage.getItem("reposage_gssoc_label") || "gssoc26";
    const labels = isGssocLabelingEnabled
      ? [gssoLabel, "good-first-issue", category]
      : [category];

    try {
      const response = await apiFetch("/api/issues/create", {
        method: "POST",
        body: JSON.stringify({
          repoUrl,
          title,
          body,
          labels,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create GitHub Issue");
      }

      const data = await response.json();
      if (data.success && data.issueUrl) {
        setCreatedIssues((prev) => ({ ...prev, [itemKey]: data.issueUrl }));
      } else {
        throw new Error("Response did not contain issue URL");
      }
    } catch (err: unknown) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      alert(`Error creating issue: ${errorMessage}`);
    } finally {
      setCreatingIssues((prev) => ({ ...prev, [itemKey]: false }));
    }
  };

  const safeSetItem = (key: string, value: string, maxRetries = 2): boolean => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (e: unknown) {
        if (!(e instanceof DOMException && e.name === 'QuotaExceededError')) {
          console.warn('Failed to save to localStorage:', e);
          return false;
        }
        if (attempt < maxRetries) {
          // Evict oldest audit and chat entries to free space
          for (const storageKey of ['reposage_audit_history', CHAT_HISTORY_KEY]) {
            try {
              const raw = localStorage.getItem(storageKey);
              if (!raw) continue;
              const data = JSON.parse(raw);
              if (Array.isArray(data) && data.length > 0) {
                const evicted = data.slice(data.length <= 1 ? 0 : 1);
                localStorage.setItem(storageKey, JSON.stringify(evicted));
              }
            } catch { /* ignore corrupt entries */ }
          }
        }
      }
    }
    return false;
  };

  // AI Chat with Repository States
  const [activeDashboardView, setActiveDashboardView] = useState<
    "audit" | "chat" | "diagram"
  >("audit");
  const [chatInput, setChatInput] = useState("");
  const CHAT_HISTORY_KEY = 'reposage_chat_history';
  const MAX_CHAT_HISTORY_LENGTH = 40;
  const truncateChatHistory = (history: ChatMessage[]) => {
    if (history.length > MAX_CHAT_HISTORY_LENGTH) {
      return history.slice(history.length - MAX_CHAT_HISTORY_LENGTH);
    }
    return history;
  };
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [useRag, setUseRag] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isChatLoading]);

  useEffect(() => {
    const controller = new AbortController();
    const loadHistory = async () => {
      try {
        const response = await apiFetch('/api/review-history', { signal: controller.signal });
        if (!response.ok) throw new Error("Failed to fetch");
        const history = await response.json();

        if (history && !controller.signal.aborted) {
          setAuditHistory(history);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error("Failed to load review history", err);
      }
    };

    loadHistory();
    return () => controller.abort();
  }, []);

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage = chatInput;
    setChatInput("");

    // Build the updated history array locally FIRST so it includes the user's
    // current message when sent to the API, rather than relying on the stale
    // chatHistory closure value (which would be one message behind).
    const updatedHistory = truncateChatHistory([
      ...(chatHistory || []),
      { role: "user" as const, content: userMessage }
    ]);
    setChatHistory(updatedHistory);
    if (!safeSetItem(CHAT_HISTORY_KEY, JSON.stringify(updatedHistory))) setStorageWarning(true);

    setIsChatLoading(true);

    try {
      setApiError(null);
      const chatAiSettings = getSavedAiSettings();
      const response = await apiFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
            message: userMessage,
            history: updatedHistory,
            model: selectedModel,
            temperature: chatAiSettings.temperature ?? 0.4,
            maxTokens: chatAiSettings.maxTokens ?? 2048,
            sessionId,
            sessionOwnerToken: localStorage.getItem("sessionOwnerToken") || "",
            useRag,
            systemPrompt: chatAiSettings.systemPrompt ?? "",
          }),
      });

      if (!response.ok) {
        throw new Error("Chat service encountered an error.");
      }

      const data = await response.json();
      const sources = data.sources || [];
      setChatHistory((prev) => {
        const updated = truncateChatHistory([
          ...prev,
          { role: "assistant" as const, content: data.response, sources: sources.length > 0 ? sources : undefined },
        ]);
        if (!safeSetItem(CHAT_HISTORY_KEY, JSON.stringify(updated))) setStorageWarning(true);
        return updated;
      });
    } catch (err: unknown) {
      console.error(err);
      let errMsg = (err instanceof Error ? err.message : String(err)) || "Chat service unavailable.";
      if (errMsg.includes("Failed to fetch") || errMsg.toLowerCase().includes("offline")) {
        errMsg = "Backend AI Engine offline. Please ensure the server is running.";
      } else if (errMsg.toLowerCase().includes("api key") || errMsg.toLowerCase().includes("unauthorized")) {
        errMsg = "Missing or invalid API Key. Please configure it in settings.";
        setShowSettings(true);
      }
      setApiError(errMsg);
    } finally {
      setIsChatLoading(false);
    }
  };

  // GSSoC Issues State (Mentorship Panel)
  const [assignedContributors, setAssignedContributors] = useState<
    Record<string, string>
  >(() => {
    const saved = localStorage.getItem("reposage_contributor_assignments");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved assignments", e);
      }
    }
    return {
      "copy-code-button": "Siddharth-iang",
      "secret-scanning-rules": "Siddharth-iang",
      "api-documentation": "skhazi123",
      "persist-assignments": "bhavyaxtech",
      "theme-toggle": "Unassigned",
      "file-filter-search": "nikita-sdev",
      "html-report-exporter": "A-R-Narke",
      "complexity-metrics": "Nikitasoni22",
    };
  });

  const handleAssignContributor = (issueKey: string) => {
    const name = prompt(
      "Enter the contributor's GitHub username to assign this issue:",
    );
    if (name) {
      const updated = {
        ...assignedContributors,
        [issueKey]: name,
      };
      setAssignedContributors(updated);
      localStorage.setItem(
        "reposage_contributor_assignments",
        JSON.stringify(updated),
      );
    }
  };

  const handleResetAssignments = () => {
    const confirmReset = window.confirm(
      "Are you sure you want to reset all contributor assignments?",
    );
    if (confirmReset) {
      const initial = {
        "copy-code-button": "Unassigned",
        "secret-scanning-rules": "Unassigned",
        "api-documentation": "Unassigned",
        "persist-assignments": "Unassigned",
        "theme-toggle": "Unassigned",
        "file-filter-search": "Unassigned",
        "html-report-exporter": "Unassigned",
        "complexity-metrics": "Unassigned",
      };
      setAssignedContributors(initial);
      localStorage.setItem(
        "reposage_contributor_assignments",
        JSON.stringify(initial),
      );
    }
  };

  const calculateTotalFindings = (result: BackendResponse) => {
    return Object.values(result.analysis?.fileReviews || {}).reduce((total, review) => {
      return total +
        (review.bugs?.length || 0) +
        (review.security?.length || 0) +
        (review.optimization?.length || 0) +
        (review.styling?.length || 0);
    }, 0);
  };

  const getAuditGrade = (totalFindings: number) => {
    if (totalFindings === 0) return 'A';
    if (totalFindings <= 5) return 'B';
    if (totalFindings <= 15) return 'C';
    return 'D';
  };

  const persistAuditHistory = (result: BackendResponse) => {
    const totalFindings = calculateTotalFindings(result);
    const entry: AuditHistoryEntry = {
      id: `${result.repoName}-${Date.now()}`,
      repoUrl,
      repoName: result.repoName,
      auditedAt: new Date().toISOString(),
      totalFindings,
      overallGrade: getAuditGrade(totalFindings),
      response: result
    };

    setAuditHistory(prev => {
      const updatedHistory = [
        entry,
        ...prev.filter(item => item.repoUrl !== repoUrl)
      ].slice(0, 5); // reduced to 5 to save space

      try {
        const sanitized = updatedHistory.map((entry) => sanitizeAuditEntry(entry as unknown as Record<string, unknown>));
        localStorage.setItem('reposage_audit_history', JSON.stringify(sanitized));
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'QuotaExceededError') {
          console.warn('localStorage quota exceeded — audit history not saved.');
        } else {
          console.warn('Failed to save to localStorage:', e);
        }
      }
      return updatedHistory;
    });
  };

  const loadAuditFromHistory = (entry: AuditHistoryEntry) => {
    setRepoUrl(entry.repoUrl);
    setAnalysisResult(entry.response);
    setSessionId(entry.response.sessionId ?? null);
    setApiError(null);
    setIsLoading(false);
    setActiveDashboardView('audit');
    setFileFilterQuery('');
    setActiveExtFilter('All');

    const filesList = Object.keys(entry.response.analysis?.fileReviews || {});
    setSelectedFile(filesList[0] || null);
  };

  const clearAuditHistory = () => {
    setAuditHistory([]);
    localStorage.removeItem('reposage_audit_history');
  };

  // Submit Handler to Call Backend API
  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;

    setIsLoading(true);
    setApiError(null);
    setAnalysisResult(null);
    setSelectedFile(null);
    setChatHistory([]);
    try { localStorage.removeItem('reposage_chat_history'); } catch {};

    // Simulate structured loading steps for GSSoC wow factor
    const steps = [
      "🔍 Authenticating connection...",
      "📥 Cloning GitHub repository locally...",
      "📁 Traversing directory tree & parsing modules...",
      "🧠 Running LLM analysis using selected AI Model...",
      "📜 Generating custom repository README.md...",
      "🎉 Formatting reports...",
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
      const aiSettings = getSavedAiSettings();
      const response = await apiFetch("/api/analyze", {
        method: "POST",
        body: JSON.stringify({
          repoUrl,
          company,
          language,
          model: selectedModel,
          temperature: aiSettings.temperature ?? 0.7,
          maxTokens: aiSettings.maxTokens ?? 2048,
          systemPrompt: aiSettings.systemPrompt ?? "",
          batchSize: aiSettings.batchSize ?? 5,
        }),
      });

      clearInterval(stepInterval);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "Server error occurred during analysis.",
        );
      }

      const data: BackendResponse = await response.json();
      setAnalysisResult(data);
      setSessionId(
        data.sessionPersisted === true ? data.sessionId ?? null : null
      );
      persistAuditHistory(data);
      setChatHistory([]);

      // Select the first file reviewed automatically
      const filesList = Object.keys(data.analysis?.fileReviews || {});
      if (filesList.length > 0) {
        setSelectedFile(filesList[0]);
      }
    } catch (err: unknown) {
      console.error(err);
      let errMsg = (err instanceof Error ? err.message : String(err)) || "Could not connect to the backend server. Make sure node backend is running on port 5000.";
      if (errMsg.includes("Failed to fetch") || errMsg.toLowerCase().includes("offline")) {
        errMsg = "Backend AI Engine offline. Please ensure the server is running.";
      } else if (errMsg.toLowerCase().includes("api key") || errMsg.toLowerCase().includes("unauthorized") || errMsg.includes("not configured")) {
        errMsg = "Missing or invalid API Key. Please configure it in settings.";
        setShowSettings(true);
      }
      setApiError(errMsg);
    } finally {
      clearInterval(stepInterval);
      setIsLoading(false);
    }
  };

  // Helper to trigger README download
  const downloadReadme = () => {
    if (!analysisResult) return;
    const element = document.createElement("a");
    const file = new Blob([analysisResult.analysis?.generatedReadme || ''], {
      type: "text/plain",
    });
    element.href = URL.createObjectURL(file);
    element.download = "GENERATED_README.md";
    document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      URL.revokeObjectURL(element.href);
    };

  const chatInputEmpty = !chatInput.trim();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          padding: 0,
          margin: "-1px",
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {announcement}
      </div>
      {/* 🚀 Main Layout Split */}
      <main
        style={{
          flexGrow: 1,
          padding: "8px 24px 24px 24px",
          display: "grid",
          gridTemplateColumns: "320px 1fr",
          gap: "20px",
          boxSizing: "border-box",
        }}
      >
        {/* LEFT COLUMN: Setup & GSSoC Contributor Portal */}
        <section
          style={{ display: "flex", flexDirection: "column", gap: "20px" }}
        >
          <SectionErrorBoundary sectionName="AnalysisForm">
            <AnalysisForm
              repoUrl={repoUrl}
              setRepoUrl={setRepoUrl}
              company={company}
              setCompany={setCompany}
              language={language}
              setLanguage={setLanguage}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              isLoading={isLoading}
              handleAnalyze={handleAnalyze}
            />
          </SectionErrorBoundary>

          <SectionErrorBoundary sectionName="AuditHistory">
            <AuditHistoryPanel
              auditHistory={auditHistory}
              clearAuditHistory={clearAuditHistory}
              loadAuditFromHistory={loadAuditFromHistory}
            />
          </SectionErrorBoundary>

          <SectionErrorBoundary sectionName="MentorshipPortal">
            <MentorshipPortal
              assignedContributors={assignedContributors}
              handleAssignContributor={handleAssignContributor}
              handleResetAssignments={handleResetAssignments}
            />
          </SectionErrorBoundary>
        </section>

        {/* RIGHT COLUMN: Loading, Dashboard Audit, or Fallback Welcome Screen */}
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            boxSizing: "border-box",
          }}
        >
          {/* 1. API Error Banner */}
          {apiError && (
            <div
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "8px",
                padding: "14px 20px",
                color: "#fca5a5",
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "20px",
              }}
            >
              <AlertOctagon size={20} style={{ color: "#ef4444" }} />
              <div>
                <strong style={{ display: "block" }}>
                  Backend Connection Error
                </strong>
                <span>{apiError}</span>
              </div>
            </div>
          )}

          {/* 2. Storage Warning Banner */}
          {storageWarning && (
            <div
              style={{
                background: "rgba(234, 179, 8, 0.1)",
                border: "1px solid rgba(234, 179, 8, 0.3)",
                borderRadius: "8px",
                padding: "14px 20px",
                color: "#fde047",
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "20px",
              }}
            >
              <AlertTriangle size={20} style={{ color: "#eab308" }} />
              <div>
                <strong style={{ display: "block" }}>
                  Storage Quota Exceeded
                </strong>
                <span>Chat history could not be saved. Local storage is full. Clear old history or export it to free space.</span>
              </div>
              <button
                onClick={() => setStorageWarning(false)}
                style={{
                  marginLeft: "auto",
                  background: "transparent",
                  border: "none",
                  color: "#fde047",
                  cursor: "pointer",
                  fontSize: "16px",
                  padding: "4px 8px",
                }}
              >
                ×
              </button>
            </div>
          )}

          {/* 3. Loading State */}
          {isLoading && (
            <div
              style={{
                flexGrow: 1,
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                boxSizing: "border-box",
              }}
            >
              <div style={{ display: "flex", gap: "10px", marginBottom: "4px" }}>
                 <div className="skeleton" style={{ width: "140px", height: "32px" }}></div>
                 <div className="skeleton" style={{ width: "140px", height: "32px" }}></div>
                 <div className="skeleton" style={{ width: "140px", height: "32px" }}></div>
              </div>
              <div style={{ display: "flex", gap: "16px", height: "120px" }}>
                 <div className="skeleton" style={{ flex: 1, height: "100%" }}></div>
                 <div className="skeleton" style={{ flex: 1, height: "100%" }}></div>
                 <div className="skeleton" style={{ flex: 1, height: "100%" }}></div>
              </div>
              <div style={{ display: "flex", gap: "16px", flexGrow: 1 }}>
                 <div className="skeleton" style={{ width: "260px", height: "400px" }}></div>
                 <div className="skeleton" style={{ flexGrow: 1, height: "400px" }}></div>
              </div>
              <div style={{ textAlign: "center", marginTop: "10px" }}>
                 <div className="spin-slow" style={{ width: "24px", height: "24px", border: "2px solid rgba(168,85,247,0.1)", borderTopColor: "#a855f7", borderRadius: "50%", margin: "0 auto 8px auto" }}></div>
                 <p style={{ margin: 0, fontSize: "13px", color: "#9ca3af", fontStyle: "italic" }}>{loadingStep}</p>
              </div>
            </div>
          )}

          {/* 3. Welcome / Sandbox Guide (When no scan has occurred yet) */}
          {!isLoading && !analysisResult && (
            <div
              className="glass-panel"
              style={{
                flexGrow: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px",
                textAlign: "center",
                gap: "24px",
              }}
            >
              <div
                style={{
                  background: "rgba(59, 130, 246, 0.1)",
                  padding: "16px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Code2 size={48} style={{ color: "#3b82f6" }} />
              </div>
              <div style={{ maxWidth: "500px" }}>
                <h2
                  style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    margin: "0 0 10px 0",
                    color: "#f3f4f6",
                  }}
                >
                  AI-Powered Code Audit Console
                </h2>
                <p
                  style={{
                    margin: "0 0 20px 0",
                    fontSize: "14px",
                    color: "#9ca3af",
                    lineHeight: 1.5,
                  }}
                >
                  Enter a public GitHub repository link on the left panel to
                  trigger a complete multi-file AI evaluation. Our service
                  clones the codebase, audits variables for null risks or
                  hardcoded credentials, and outputs an automated custom
                  README.md structure.
                </p>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    gap: "10px",
                  }}
                >
                  <button
                    onClick={() => {
                      setRepoUrl("https://github.com/google/guava");
                      setCompany("Google");
                    }}
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      color: "#d1d5db",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "6px",
                      padding: "8px 16px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    💡 Load Sample: Guava
                  </button>
                  <button
                    onClick={() => {
                      setRepoUrl("https://github.com/KalyanReddyB/AuraCore");
                      setCompany("Stripe");
                    }}
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      color: "#d1d5db",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "6px",
                      padding: "8px 16px",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    💡 Load Sample: AuraCore
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 4. The Complete Analysis Dashboard (Split Audit View) */}
          {!isLoading && analysisResult && (
            <div
              ref={reportRef}
              style={{
                flexGrow: 1,
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                boxSizing: "border-box",
              }}
            >
              {(analysisResult._mock || analysisResult.analysis?._mock) && (
                <div
                  style={{
                    background: "rgba(251,191,36,0.12)",
                    border: "1px solid rgba(251,191,36,0.35)",
                    borderRadius: "8px",
                    padding: "12px 16px",
                    color: "#fbbf24",
                    fontSize: "13px",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span style={{ fontSize: "16px" }}>⚠️</span>
                  <span>
                    AI Engine offline — showing simulated review results.
                    Start the backend AI service for real analysis.
                  </span>
                </div>
              )}
              {analysisResult.partial_review && (
                <div
                  style={{
                    background: "rgba(251,191,36,0.12)",
                    border: "1px solid rgba(251,191,36,0.35)",
                    borderRadius: "8px",
                    padding: "12px 16px",
                    color: "#fbbf24",
                    fontSize: "13px",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <AlertTriangle size={18} style={{ color: "#fbbf24" }} />
                  <span>
                    Warning: Repository size exceeded AI context limits. This is a partial review of the core files.
                  </span>
                </div>
              )}
              {analysisResult.warnings && analysisResult.warnings.length > 0 && (
                <div
                  style={{
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.35)",
                    borderRadius: "8px",
                    padding: "12px 16px",
                    color: "#fca5a5",
                    fontSize: "13px",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "8px",
                    flexDirection: "column",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <ShieldAlert size={16} style={{ color: "#ef4444" }} />
                    <span>Potential prompt injection detected in repository files</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "24px", fontSize: "11px", fontWeight: 400 }}>
                    {analysisResult.warnings.map((w, i) => (
                      <li key={i}>
                        <strong>{w.file}</strong>: {w.warning}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <SectionErrorBoundary sectionName="HealthScore">
                <HealthScoreSection
                  analysisResult={analysisResult}
                  isLoading={isLoading}
                />
              </SectionErrorBoundary>
              {/* Dashboard View Selection Tabs & Export Controls */}
              <div data-html2canvas-ignore="true" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap", width: "100%" }}>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    onClick={() => setActiveDashboardView("audit")}
                    style={{
                      background:
                        activeDashboardView === "audit"
                          ? "rgba(59,130,246,0.1)"
                          : "rgba(255,255,255,0.03)",
                      border: "1px solid",
                      borderColor:
                        activeDashboardView === "audit"
                          ? "rgba(59,130,246,0.4)"
                          : "rgba(255,255,255,0.08)",
                      color:
                        activeDashboardView === "audit" ? "#60a5fa" : "#9ca3af",
                      borderRadius: "6px",
                      padding: "8px 16px",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      transition: "all 0.2s ease-in-out",
                    }}
                  >
                    <Layers size={14} /> Code Audit Report
                  </button>
                  <button
                    onClick={() => setActiveDashboardView("chat")}
                    style={{
                      background:
                        activeDashboardView === "chat"
                          ? "rgba(168,85,247,0.1)"
                          : "rgba(255,255,255,0.03)",
                      border: "1px solid",
                      borderColor:
                        activeDashboardView === "chat"
                          ? "rgba(168,85,247,0.4)"
                          : "rgba(255,255,255,0.08)",
                      color:
                        activeDashboardView === "chat" ? "#c084fc" : "#9ca3af",
                      borderRadius: "6px",
                      padding: "8px 16px",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      transition: "all 0.2s ease-in-out",
                    }}
                  >
                    <MessageSquare size={14} /> AI Code Chatbot
                  </button>
                  <button
                    onClick={() => setActiveDashboardView("diagram")}
                    style={{
                      background:
                        activeDashboardView === "diagram"
                          ? "rgba(34,197,94,0.1)"
                          : "rgba(255,255,255,0.03)",
                      border: "1px solid",
                      borderColor:
                        activeDashboardView === "diagram"
                          ? "rgba(34,197,94,0.4)"
                          : "rgba(255,255,255,0.08)",
                      color:
                        activeDashboardView === "diagram" ? "#4ade80" : "#9ca3af",
                      borderRadius: "6px",
                      padding: "8px 16px",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      transition: "all 0.2s ease-in-out",
                    }}
                  >
                    <Sparkles size={14} /> Architecture Diagram
                  </button>
                </div>

                {/* Export Controls */}
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    onClick={() => analysisResult && handleHtmlExport(analysisResult.repoName, analysisResult.analysis, apiFetch)}
                    style={{
                      background: "rgba(59, 130, 246, 0.1)",
                      border: "1px solid rgba(59, 130, 246, 0.3)",
                      color: "#60a5fa",
                      borderRadius: "6px",
                      padding: "8px 16px",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      transition: "all 0.2s ease-in-out",
                    }}
                    className="hover:bg-blue-500/20"
                    title="Export the complete audit report as HTML"
                  >
                    <Download size={14} /> Export HTML
                  </button>
                  <button
                    onClick={() => analysisResult && handleMarkdownExport(analysisResult.repoName, analysisResult.analysis)}
                    style={{
                      background: "rgba(168, 85, 247, 0.1)",
                      border: "1px solid rgba(168, 85, 247, 0.3)",
                      color: "#c084fc",
                      borderRadius: "6px",
                      padding: "8px 16px",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      transition: "all 0.2s ease-in-out",
                    }}
                    className="hover:bg-purple-500/20"
                    title="Export the complete audit report as Markdown"
                  >
                    <FileDown size={14} /> Export Markdown
                  </button>
                  <button
                    onClick={() => analysisResult && handlePdfExport(analysisResult.repoName, reportRef.current)}
                    style={{
                      background: "rgba(220, 38, 38, 0.1)",
                      border: "1px solid rgba(220, 38, 38, 0.3)",
                      color: "#f87171",
                      borderRadius: "6px",
                      padding: "8px 16px",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      transition: "all 0.2s ease-in-out",
                    }}
                    className="hover:bg-red-500/20"
                    title="Export the complete audit report as PDF"
                  >
                    <FileText size={14} /> Export PDF
                  </button>
                </div>
              </div>

              <div
                className="pdf-grid-container"
                style={{
                  flexGrow: 1,
                  display: "grid",
                  gridTemplateColumns:
                    activeDashboardView === "audit"
                      ? "240px 1fr 1fr"
                      : "240px 1fr",
                  gap: "20px",
                  boxSizing: "border-box",
                }}
              >
                {/* File Tree List */}
                <div data-html2canvas-ignore="true" className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '72vh' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <h3 style={{ fontSize: '12px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', margin: 0, letterSpacing: '0.5px' }}>File Navigator</h3>
                    <div style={{ display: 'flex', gap: '2px' }}>
                      <button
                        onClick={() => {
                          handleExpandAll(fileTreeData);
                        }}
                        title="Expand All Folders"
                        style={{
                          padding: '4px',
                          background: 'transparent',
                          border: 'none',
                          color: '#9ca3af',
                          cursor: 'pointer',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#f3f4f6'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.background = 'transparent'; }}
                        aria-label="Expand all folders"
                      >
                        <ChevronsUpDown size={15} />
                      </button>
                      <button
                        onClick={handleCollapseAll}
                        title="Collapse All Folders"
                        style={{
                          padding: '4px',
                          background: 'transparent',
                          border: 'none',
                          color: '#9ca3af',
                          cursor: 'pointer',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#f3f4f6'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.background = 'transparent'; }}
                        aria-label="Collapse all folders"
                      >
                        <ChevronsDownUp size={15} />
                      </button>
                    </div>
                  </div>
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      marginBottom: '8px'
                    }}
                  >
                    <Search
                      size={14}
                      style={{
                        position: 'absolute',
                        left: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--subtext-color)',
                        pointerEvents: 'none'
                      }}
                    />

                    <input
                      ref={searchInputRef}
                      type="text"
                      value={fileFilterQuery}
                      onChange={(e) => setFileFilterQuery(e.target.value)}
                      placeholder="Search files... (Ctrl+K)"
                      style={{
                        width: '100%',
                        padding: '6px 30px 6px 28px',
                        background: 'var(--input-bg)',
                        border: '1px solid var(--input-border)',
                        borderRadius: '6px',
                        color: 'var(--text-color)',
                        fontSize: '11px',
                        boxSizing: 'border-box',
                        outline: 'none'
                      }}
                    />

                    {fileFilterQuery && (
                      <button
                        onClick={() => {
                          setFileFilterQuery('')
                          setIsClearHovered(false)
                        }}
                        onMouseEnter={() => setIsClearHovered(true)}
                        onMouseLeave={() => setIsClearHovered(false)}
                        style={{
                          position: 'absolute',
                          right: '8px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: isClearHovered ? 'rgba(255,255,255,0.1)' : 'transparent',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          color: 'var(--subtext-color)',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        aria-label="Clear search"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    {['All', 'JS/TS', 'Python', 'CSS/HTML'].map(tag => (
                      <button
                        key={tag}
                        onClick={() => setActiveExtFilter(tag)}
                        style={{
                          background:
                            activeExtFilter === tag
                              ? "#a855f7"
                              : "rgba(255,255,255,0.05)",
                          border:
                            activeExtFilter === tag
                              ? "1px solid #a855f7"
                              : "1px solid var(--border-color)",
                          borderRadius: "4px",
                          color:
                            activeExtFilter === tag
                              ? "white"
                              : "var(--text-color)",
                          padding: "2px 6px",
                          fontSize: "9px",
                          fontWeight: 600,
                          cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                  {(() => {
                    if (fileTreeData.length === 0) {
                      return (
                        <div
                          style={{
                            textAlign: "center",
                            padding: "24px 10px",
                            color: "var(--subtext-color)",
                            fontSize: "11px",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <span>🚫 No matching files found</span>
                        </div>
                      );
                    }

                    const renderTreeNode = (node: FileTreeNode, depth: number = 0) => {
                      if (node.isFolder) {
                        const isExpanded = expandedFolders.has(node.fullPath);
                        return (
                          <div key={node.fullPath}>
                            <button
                              onClick={() => toggleFolder(node.fullPath)}
                              style={{
                                width: '100%',
                                padding: '5px 8px',
                                paddingLeft: `${8 + depth * 14}px`,
                                borderRadius: '4px',
                                background: 'transparent',
                                border: '1px solid transparent',
                                color: '#d1d5db',
                                textAlign: 'left',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                transition: 'all 0.15s',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                            >
                              {isExpanded ? (
                                <ChevronDown size={12} style={{ color: '#9ca3af', flexShrink: 0 }} />
                              ) : (
                                <ChevronRight size={12} style={{ color: '#9ca3af', flexShrink: 0 }} />
                              )}
                              {isExpanded ? (
                                <FolderOpen size={14} style={{ color: '#60a5fa', flexShrink: 0 }} />
                              ) : (
                                <Folder size={14} style={{ color: '#60a5fa', flexShrink: 0 }} />
                              )}
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
                            </button>
                            {isExpanded && (
                              <div style={{ transition: 'all 0.15s ease-in-out' }}>
                                {node.children.map(child => renderTreeNode(child, depth + 1))}
                              </div>
                            )}
                          </div>
                        );
                      }

                      // File node
                      return (
                        <button
                          key={node.fullPath}
                          onClick={() => setSelectedFile(node.fullPath)}
                          style={{
                            width: '100%',
                            padding: '5px 8px',
                            paddingLeft: `${8 + depth * 14}px`,
                            borderRadius: '4px',
                            background:
                              selectedFile === node.fullPath
                                ? 'rgba(59,130,246,0.1)'
                                : 'transparent',
                            border:
                              selectedFile === node.fullPath
                                ? '1px solid rgba(59,130,246,0.3)'
                                : '1px solid transparent',
                            color:
                              selectedFile === node.fullPath
                                ? '#60a5fa'
                                : 'var(--text-color)',
                            textAlign: 'left',
                            fontSize: '12px',
                            fontWeight: selectedFile === node.fullPath ? 600 : 500,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={(e) => {
                            if (selectedFile !== node.fullPath) e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                          }}
                          onMouseLeave={(e) => {
                            if (selectedFile !== node.fullPath) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <FileCode
                            size={14}
                            style={{
                              color:
                                selectedFile === node.fullPath
                                  ? '#60a5fa'
                                  : 'var(--subtext-color)',
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
                        </button>
                      );
                    };

                    return fileTreeData.map(node => renderTreeNode(node, 0));
                  })()}
                </div>

                {activeDashboardView === "audit" && (
                  <>
                    {/* Central Audit Hub */}
                    <div
                      className="glass-panel"
                      style={{
                        padding: "20px",
                        display: "flex",
                        flexDirection: "column",
                        boxSizing: "border-box",
                      }}
                    >
                      {analysisResult && (() => {
                        const fileReviews = analysisResult.analysis.fileReviews || {};
                        const breakdown: Record<string, number> = { bugs: 0, security: 0, optimization: 0, styling: 0 };
                        Object.values(fileReviews).forEach((fr: any) => {
                          breakdown.bugs += fr.bugs?.length || 0;
                          breakdown.security += fr.security?.length || 0;
                          breakdown.optimization += fr.optimization?.length || 0;
                          breakdown.styling += fr.styling?.length || 0;
                        });
                        return <div style={{ marginBottom: "16px" }}><VulnerabilitiesBarChart data={breakdown} /></div>;
                      })()}
                      <div
                        style={{
                          borderBottom: "1px solid rgba(255,255,255,0.08)",
                          paddingBottom: "12px",
                          marginBottom: "16px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "10px",
                              background: "#3b82f6",
                              color: "#eff6ff",
                              padding: "2px 8px",
                              borderRadius: "20px",
                              fontWeight: 600,
                              textTransform: "uppercase",
                            }}
                          >
                            File Audit
                          </span>
                          <label
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              cursor: "pointer",
                              fontSize: "11px",
                              color: "#9ca3af",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isGssocLabelingEnabled}
                              onChange={(e) =>
                                setIsGssocLabelingEnabled(e.target.checked)
                              }
                              style={{
                                cursor: "pointer",
                                accentColor: "#a855f7",
                                width: "13px",
                                height: "13px",
                              }}
                            />
                            <span>GSSoC Labeling</span>
                          </label>
                        </div>
                        <h3
                          style={{
                            fontSize: "15px",
                            fontWeight: 700,
                            color: "#f3f4f6",
                            margin: "6px 0 0 0",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          📄 {selectedFile || "Select a file"}
                        </h3>
                      </div>

                      {/* Compact Metrics Summary Banner */}
                      {selectedFile &&
                        analysisResult.analysis.metrics?.[selectedFile] && (
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(4, 1fr)",
                              gap: "8px",
                              marginBottom: "16px",
                            }}
                          >
                            {[
                              {
                                label: "Total Lines",
                                value:
                                  analysisResult.analysis.metrics[selectedFile]
                                    .totalLines,
                                color: "#60a5fa",
                              },
                              {
                                label: "Code Lines",
                                value:
                                  analysisResult.analysis.metrics[selectedFile]
                                    .codeLines,
                                color: "#22c55e",
                              },
                              {
                                label: "Comments",
                                value:
                                  analysisResult.analysis.metrics[selectedFile]
                                    .commentLines,
                                color: "#a855f7",
                              },
                              {
                                label: "Empty Lines",
                                value:
                                  analysisResult.analysis.metrics[selectedFile]
                                    .emptyLines,
                                color: "#f59e0b",
                              },
                            ].map((stat) => (
                              <div
                                key={stat.label}
                                style={{
                                  background: `${stat.color}08`,
                                  border: `1px solid ${stat.color}25`,
                                  borderRadius: "8px",
                                  padding: "10px 12px",
                                  textAlign: "center",
                                  transition: "all 0.2s ease",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "9px",
                                    fontWeight: 600,
                                    color: "var(--subtext-color)",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                    display: "block",
                                    marginBottom: "4px",
                                  }}
                                >
                                  {stat.label}
                                </span>
                                <span
                                  style={{
                                    fontSize: "18px",
                                    fontWeight: 800,
                                    color: stat.color,
                                    display: "block",
                                  }}
                                >
                                  {stat.value ?? "—"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                      {/* Audit Tabs */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(5, 1fr)",
                          gap: "6px",
                          marginBottom: "16px",
                        }}
                      >
                        <button
                          onClick={() => setActiveTab("bugs")}
                          aria-current={activeTab === "bugs" ? "true" : undefined}
                          style={{
                            padding: "6px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 600,
                            cursor: "pointer",
                            border: "1px solid",
                            background:
                              activeTab === "bugs"
                                ? "rgba(249,115,22,0.1)"
                                : "transparent",
                            borderColor:
                              activeTab === "bugs"
                                ? "rgba(249,115,22,0.3)"
                                : "rgba(255,255,255,0.05)",
                            color: activeTab === "bugs" ? "#f97316" : "#9ca3af",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "4px",
                          }}
                        >
                          <AlertTriangle size={12} /> Bugs
                        </button>
                        <button
                          onClick={() => setActiveTab("security")}
                          aria-current={activeTab === "security" ? "true" : undefined}
                          style={{
                            padding: "6px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 600,
                            cursor: "pointer",
                            border: "1px solid",
                            background:
                              activeTab === "security"
                                ? "rgba(239,68,68,0.1)"
                                : "transparent",
                            borderColor:
                              activeTab === "security"
                                ? "rgba(239,68,68,0.3)"
                                : "rgba(255,255,255,0.05)",
                            color:
                              activeTab === "security" ? "#ef4444" : "#9ca3af",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "4px",
                          }}
                        >
                          <ShieldAlert size={12} /> Security
                        </button>
                        <button
                          onClick={() => setActiveTab("optimization")}
                          aria-current={activeTab === "optimization" ? "true" : undefined}
                          style={{
                            padding: "6px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 600,
                            cursor: "pointer",
                            border: "1px solid",
                            background:
                              activeTab === "optimization"
                                ? "rgba(34,197,94,0.1)"
                                : "transparent",
                            borderColor:
                              activeTab === "optimization"
                                ? "rgba(34,197,94,0.3)"
                                : "rgba(255,255,255,0.05)",
                            color:
                              activeTab === "optimization"
                                ? "#22c55e"
                                : "#9ca3af",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "4px",
                          }}
                        >
                          <Zap size={12} /> Perf
                        </button>
                        <button
                          onClick={() => setActiveTab("styling")}
                          aria-current={activeTab === "styling" ? "true" : undefined}
                          style={{
                            padding: "6px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 600,
                            cursor: "pointer",
                            border: "1px solid",
                            background:
                              activeTab === "styling"
                                ? "rgba(59,130,246,0.1)"
                                : "transparent",
                            borderColor:
                              activeTab === "styling"
                                ? "rgba(59,130,246,0.3)"
                                : "rgba(255,255,255,0.05)",
                            color:
                              activeTab === "styling" ? "#3b82f6" : "#9ca3af",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "4px",
                          }}
                        >
                          <Terminal size={12} /> Style
                        </button>
                        <button
                          onClick={() => setActiveTab("metrics")}
                          aria-current={activeTab === "metrics" ? "true" : undefined}
                          style={{
                            padding: "6px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 600,
                            cursor: "pointer",
                            border: "1px solid",
                            background:
                              activeTab === "metrics"
                                ? "rgba(168,85,247,0.1)"
                                : "transparent",
                            borderColor:
                              activeTab === "metrics"
                                ? "rgba(168,85,247,0.3)"
                                : "rgba(255,255,255,0.05)",
                            color:
                              activeTab === "metrics" ? "#a855f7" : "#9ca3af",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "4px",
                          }}
                        >
                          <Layers size={12} /> Metrics
                        </button>
                      </div>

                      {/* Audit Items Render */}
                      <div
                        style={{
                          flexGrow: 1,
                          overflowY: "auto",
                          maxHeight: "54vh",
                          display: "flex",
                          flexDirection: "column",
                          gap: "14px",
                        }}
                      >
                        {selectedFile && activeTab === "metrics" ? (
                          (() => {
                            const fileMetrics = analysisResult.analysis
                              .metrics?.[selectedFile] || {
                              totalLines: 0,
                              emptyLines: 0,
                              commentLines: 0,
                              codeLines: 0,
                              functionCount: 0,
                              complexityScore: 0,
                              grade: "A",
                            };

                            const commentDensity =
                              fileMetrics.totalLines > 0
                                ? Math.round(
                                  (fileMetrics.commentLines /
                                    fileMetrics.totalLines) *
                                  100,
                                )
                                : 0;

                            const codePct =
                              fileMetrics.totalLines > 0
                                ? Math.round(
                                  (fileMetrics.codeLines /
                                    fileMetrics.totalLines) *
                                  100,
                                )
                                : 0;
                            const commentPct =
                              fileMetrics.totalLines > 0
                                ? Math.round(
                                  (fileMetrics.commentLines /
                                    fileMetrics.totalLines) *
                                  100,
                                )
                                : 0;
                            const emptyPct =
                              fileMetrics.totalLines > 0
                                ? Math.max(0, 100 - codePct - commentPct)
                                : 0;

                            const gradeColors = {
                              A: {
                                text: "#22c55e",
                                bg: "rgba(34,197,94,0.05)",
                                border: "rgba(34,197,94,0.15)",
                              },
                              B: {
                                text: "#3b82f6",
                                bg: "rgba(59,130,246,0.05)",
                                border: "rgba(59,130,246,0.15)",
                              },
                              C: {
                                text: "#eab308",
                                bg: "rgba(234,179,8,0.05)",
                                border: "rgba(234,179,8,0.15)",
                              },
                              D: {
                                text: "#f97316",
                                bg: "rgba(249,115,22,0.05)",
                                border: "rgba(249,115,22,0.15)",
                              },
                              F: {
                                text: "#ef4444",
                                bg: "rgba(239,68,68,0.05)",
                                border: "rgba(239,68,68,0.15)",
                              },
                            };

                            const currentGrade =
                              gradeColors[
                              fileMetrics.grade as keyof typeof gradeColors
                              ] || gradeColors["A"];

                            return (
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "16px",
                                }}
                              >
                                {/* Complexity Card */}
                                <div
                                  style={{
                                    background: currentGrade.bg,
                                    border: `1px solid ${currentGrade.border}`,
                                    padding: "16px",
                                    borderRadius: "8px",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                  }}
                                >
                                  <div>
                                    <h4
                                      style={{
                                        margin: "0 0 4px 0",
                                        fontSize: "14px",
                                        color: "var(--text-color)",
                                        fontWeight: 700,
                                      }}
                                    >
                                      Complexity Grade
                                    </h4>
                                    <span
                                      style={{
                                        fontSize: "11px",
                                        color: "var(--subtext-color)",
                                      }}
                                    >
                                      Based on SLOC and function densities.
                                    </span>
                                  </div>
                                  <div
                                    style={{
                                      width: "48px",
                                      height: "48px",
                                      borderRadius: "50%",
                                      background: "rgba(255,255,255,0.05)",
                                      border: `2px solid ${currentGrade.text}`,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: "20px",
                                      fontWeight: 800,
                                      color: currentGrade.text,
                                    }}
                                  >
                                    {fileMetrics.grade}
                                  </div>
                                </div>

                                {/* Line Composition Stacked Bar */}
                                <div
                                  style={{
                                    background: "rgba(255,255,255,0.02)",
                                    border: "1px solid var(--border-color)",
                                    padding: "14px",
                                    borderRadius: "8px",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      marginBottom: "10px",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: "11px",
                                        fontWeight: 700,
                                        color: "var(--text-color)",
                                      }}
                                    >
                                      Line Composition
                                    </span>
                                    <span
                                      style={{
                                        fontSize: "10px",
                                        color: "var(--subtext-color)",
                                      }}
                                    >
                                      {fileMetrics.totalLines} total lines
                                    </span>
                                  </div>
                                  <div
                                    style={{
                                      height: "10px",
                                      background: "rgba(255,255,255,0.05)",
                                      borderRadius: "10px",
                                      overflow: "hidden",
                                      display: "flex",
                                    }}
                                  >
                                    <div
                                      style={{
                                        height: "100%",
                                        width: `${codePct}%`,
                                        background: "#22c55e",
                                        transition: "width 0.5s ease-out",
                                      }}
                                      title={`Code: ${codePct}%`}
                                    />
                                    <div
                                      style={{
                                        height: "100%",
                                        width: `${commentPct}%`,
                                        background: "#a855f7",
                                        transition: "width 0.5s ease-out",
                                      }}
                                      title={`Comments: ${commentPct}%`}
                                    />
                                    <div
                                      style={{
                                        height: "100%",
                                        width: `${emptyPct}%`,
                                        background: "#f59e0b",
                                        transition: "width 0.5s ease-out",
                                      }}
                                      title={`Empty: ${emptyPct}%`}
                                    />
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: "16px",
                                      marginTop: "8px",
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "5px",
                                      }}
                                    >
                                      <div
                                        style={{
                                          width: "8px",
                                          height: "8px",
                                          borderRadius: "2px",
                                          background: "#22c55e",
                                        }}
                                      />
                                      <span
                                        style={{
                                          fontSize: "10px",
                                          color: "var(--subtext-color)",
                                          fontWeight: 600,
                                        }}
                                      >
                                        Code {codePct}%
                                      </span>
                                    </div>
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "5px",
                                      }}
                                    >
                                      <div
                                        style={{
                                          width: "8px",
                                          height: "8px",
                                          borderRadius: "2px",
                                          background: "#a855f7",
                                        }}
                                      />
                                      <span
                                        style={{
                                          fontSize: "10px",
                                          color: "var(--subtext-color)",
                                          fontWeight: 600,
                                        }}
                                      >
                                        Comments {commentPct}%
                                      </span>
                                    </div>
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "5px",
                                      }}
                                    >
                                      <div
                                        style={{
                                          width: "8px",
                                          height: "8px",
                                          borderRadius: "2px",
                                          background: "#f59e0b",
                                        }}
                                      />
                                      <span
                                        style={{
                                          fontSize: "10px",
                                          color: "var(--subtext-color)",
                                          fontWeight: 600,
                                        }}
                                      >
                                        Empty {emptyPct}%
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Details Grid */}
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(3, 1fr)",
                                    gap: "12px",
                                  }}
                                >
                                  <div
                                    style={{
                                      background: "rgba(34,197,94,0.04)",
                                      border: "1px solid rgba(34,197,94,0.12)",
                                      padding: "12px",
                                      borderRadius: "8px",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: "10px",
                                        color: "#22c55e",
                                        textTransform: "uppercase",
                                        fontWeight: 600,
                                      }}
                                    >
                                      Code Lines
                                    </span>
                                    <h3
                                      style={{
                                        margin: "4px 0 0 0",
                                        fontSize: "18px",
                                        color: "var(--text-color)",
                                        fontWeight: 800,
                                      }}
                                    >
                                      {fileMetrics.codeLines}
                                    </h3>
                                  </div>
                                  <div
                                    style={{
                                      background: "rgba(168,85,247,0.04)",
                                      border: "1px solid rgba(168,85,247,0.12)",
                                      padding: "12px",
                                      borderRadius: "8px",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: "10px",
                                        color: "#a855f7",
                                        textTransform: "uppercase",
                                        fontWeight: 600,
                                      }}
                                    >
                                      Comment Lines
                                    </span>
                                    <h3
                                      style={{
                                        margin: "4px 0 0 0",
                                        fontSize: "18px",
                                        color: "var(--text-color)",
                                        fontWeight: 800,
                                      }}
                                    >
                                      {fileMetrics.commentLines}
                                    </h3>
                                  </div>
                                  <div
                                    style={{
                                      background: "rgba(245,158,11,0.04)",
                                      border: "1px solid rgba(245,158,11,0.12)",
                                      padding: "12px",
                                      borderRadius: "8px",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: "10px",
                                        color: "#f59e0b",
                                        textTransform: "uppercase",
                                        fontWeight: 600,
                                      }}
                                    >
                                      Empty Lines
                                    </span>
                                    <h3
                                      style={{
                                        margin: "4px 0 0 0",
                                        fontSize: "18px",
                                        color: "var(--text-color)",
                                        fontWeight: 800,
                                      }}
                                    >
                                      {fileMetrics.emptyLines}
                                    </h3>
                                  </div>
                                </div>

                                {/* Secondary Metrics Grid */}
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(2, 1fr)",
                                    gap: "12px",
                                  }}
                                >
                                  <div
                                    style={{
                                      background: "rgba(255,255,255,0.02)",
                                      border: "1px solid var(--border-color)",
                                      padding: "12px",
                                      borderRadius: "8px",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: "10px",
                                        color: "var(--subtext-color)",
                                        textTransform: "uppercase",
                                        fontWeight: 600,
                                      }}
                                    >
                                      Total Lines
                                    </span>
                                    <h3
                                      style={{
                                        margin: "4px 0 0 0",
                                        fontSize: "18px",
                                        color: "var(--text-color)",
                                        fontWeight: 800,
                                      }}
                                    >
                                      {fileMetrics.totalLines}
                                    </h3>
                                  </div>
                                  <div
                                    style={{
                                      background: "rgba(255,255,255,0.02)",
                                      border: "1px solid var(--border-color)",
                                      padding: "12px",
                                      borderRadius: "8px",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: "10px",
                                        color: "var(--subtext-color)",
                                        textTransform: "uppercase",
                                        fontWeight: 600,
                                      }}
                                    >
                                      Functions
                                    </span>
                                    <h3
                                      style={{
                                        margin: "4px 0 0 0",
                                        fontSize: "18px",
                                        color: "var(--text-color)",
                                        fontWeight: 800,
                                      }}
                                    >
                                      {fileMetrics.functionCount}
                                    </h3>
                                  </div>
                                </div>

                                {/* Progress Bars */}
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "10px",
                                    marginTop: "4px",
                                  }}
                                >
                                  <div>
                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        fontSize: "10px",
                                        color: "var(--subtext-color)",
                                        marginBottom: "4px",
                                        fontWeight: 600,
                                      }}
                                    >
                                      <span>Complexity Index Score</span>
                                      <span>
                                        {fileMetrics.complexityScore} / 50
                                      </span>
                                    </div>
                                    <div
                                      style={{
                                        height: "6px",
                                        background: "rgba(255,255,255,0.05)",
                                        borderRadius: "10px",
                                        overflow: "hidden",
                                      }}
                                    >
                                      <div
                                        style={{
                                          height: "100%",
                                          width: `${Math.min((fileMetrics.complexityScore / 50) * 100, 100)}%`,
                                          background: currentGrade.text,
                                          borderRadius: "10px",
                                          transition: "width 0.5s ease-out",
                                        }}
                                      />
                                    </div>
                                  </div>

                                  <div>
                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        fontSize: "10px",
                                        color: "var(--subtext-color)",
                                        marginBottom: "4px",
                                        fontWeight: 600,
                                      }}
                                    >
                                      <span>Comment Coverage Density</span>
                                      <span>{commentDensity}%</span>
                                    </div>
                                    <div
                                      style={{
                                        height: "6px",
                                        background: "rgba(255,255,255,0.05)",
                                        borderRadius: "10px",
                                        overflow: "hidden",
                                      }}
                                    >
                                      <div
                                        style={{
                                          height: "100%",
                                          width: `${Math.min(commentDensity, 100)}%`,
                                          background: "#10b981",
                                          borderRadius: "10px",
                                          transition: "width 0.5s ease-out",
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>
                                <React.Suspense fallback={<div style={{ height: 350, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--subtext-color)', fontSize: '12px' }}>Loading codebase metrics...</div>}>
                                  <LazyMetricsChart sessionId={sessionId} />
                                </React.Suspense>
                              </div>
                            );
                          })()
                        ) : selectedFile &&
                          activeTab !== "metrics" &&
                          analysisResult.analysis.fileReviews[selectedFile]?.[
                            activeTab
                          ]?.length > 0 ? (
                          (
                            analysisResult.analysis.fileReviews[selectedFile][
                            activeTab
                            ] as any[]
                          ).map((item: any, index: number) => {
                            const itemKey = `${selectedFile}-${activeTab}-${index}-${item.line || 'global'}`;
                            return (
                              <div
                                key={itemKey}
                                style={{
                                  padding: "12px 14px",
                                  borderRadius: "8px",
                                  background: "rgba(15,23,42,0.4)",
                                  borderLeft: "3px solid",
                                  borderColor:
                                    activeTab === "bugs"
                                      ? "#f97316"
                                      : activeTab === "security"
                                        ? "#ef4444"
                                        : activeTab === "optimization"
                                          ? "#22c55e"
                                          : "#3b82f6",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    marginBottom: "8px",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "12px",
                                      fontWeight: 700,
                                      color: "#f3f4f6",
                                    }}
                                  >
                                    {item.type}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: "10px",
                                      background: "rgba(255,255,255,0.08)",
                                      color: "#9ca3af",
                                      padding: "2px 8px",
                                      borderRadius: "4px",
                                      fontWeight: 600,
                                    }}
                                  >
                                    Line {item.line}
                                  </span>
                                </div>
                                <p
                                  style={{
                                    margin: "0 0 10px 0",
                                    fontSize: "12px",
                                    color: "#d1d5db",
                                    lineHeight: 1.4,
                                  }}
                                >
                                  {item.description}
                                </p>
                                <div
                                  style={{
                                    background: "rgba(0,0,0,0.3)",
                                    border: "1px solid rgba(255,255,255,0.05)",
                                    borderRadius: "6px",
                                    padding: "8px 10px",
                                  }}
                                >
                                  <div
  style={{
    marginTop: "12px",
    padding: "12px",
    borderRadius: "8px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
  }}
>
  <h4
    style={{
      color: "#60a5fa",
      marginBottom: "8px",
      fontSize: "13px",
    }}
  >
    AI Fix Suggestion
  </h4>

  <p
    style={{
      color: "#e5e7eb",
      fontSize: "12px",
      marginBottom: "10px",
    }}
  >
    <strong>Explanation:</strong>
    <br />
    {item.description}
  </p>

  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "6px",
    }}
  >
    <strong style={{ color: "#c084fc" }}>
      Suggested Fix
    </strong>

    <CopyToClipboardButton
      textToCopy={item.suggestion}
      style={{ padding: "2px" }}
    />
  </div>

  <code
    style={{
      display: "block",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      fontSize: "11px",
      color: "#d8b4fe",
    }}
  >
    {item.suggestion}
  </code>
</div>
                                </div>
                                {!(analysisResult?._mock || analysisResult?.analysis?._mock) && <div
                                  style={{
                                    marginTop: "10px",
                                    display: "flex",
                                    gap: "8px",
                                  }}
                                >
                                  {createdIssues[itemKey] ? (
                                    <a
                                      href={createdIssues[itemKey]}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "6px",
                                        background: "rgba(34,197,94,0.1)",
                                        border: "1px solid rgba(34,197,94,0.3)",
                                        color: "#4ade80",
                                        borderRadius: "6px",
                                        padding: "6px 12px",
                                        fontSize: "11px",
                                        fontWeight: 600,
                                        textDecoration: "none",
                                        cursor: "pointer",
                                      }}
                                    >
                                      🟢 View Issue on GitHub
                                    </a>
                                  ) : (
                                    <button
                                      onClick={() =>
                                        handleCreateGitHubIssue(
                                          selectedFile,
                                          item,
                                          activeTab,
                                          itemKey,
                                        )
                                      }
                                      disabled={creatingIssues[itemKey]}
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "6px",
                                        background: "rgba(168,85,247,0.1)",
                                        border:
                                          "1px solid rgba(168,85,247,0.3)",
                                        color: "#c084fc",
                                        borderRadius: "6px",
                                        padding: "6px 12px",
                                        fontSize: "11px",
                                        fontWeight: 600,
                                        cursor: "pointer",
                                        opacity: creatingIssues[itemKey]
                                          ? 0.6
                                          : 1,
                                        pointerEvents: creatingIssues[itemKey]
                                          ? "none"
                                          : "auto",
                                      }}
                                    >
                                      {creatingIssues[itemKey] ? (
                                        <>
                                          <span
                                            className="spin-slow"
                                            style={{
                                              display: "inline-block",
                                              width: "12px",
                                              height: "12px",
                                              border: "2px solid #c084fc",
                                              borderTopColor: "transparent",
                                              borderRadius: "50%",
                                            }}
                                          ></span>
                                          Creating...
                                        </>
                                      ) : (
                                        <>🚨 Create GitHub Issue</>
                                      )}
                                    </button>
                                  )}
                                </div>}
                              </div>
                            );
                          })
                        ) : (
                          <div
                            style={{
                              textAlign: "center",
                              padding: "40px 20px",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: "12px",
                            }}
                          >
                            <CheckCircle
                              size={32}
                              style={{ color: "#22c55e" }}
                            />
                            <div>
                              <span
                                style={{
                                  fontSize: "13px",
                                  fontWeight: 600,
                                  color: "#f3f4f6",
                                  display: "block",
                                }}
                              >
                                All Clean!
                              </span>
                              <span
                                style={{ fontSize: "11px", color: "#9ca3af" }}
                              >
                                No issues found in this category for this file.
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* generated README.md Preview */}
                    <div
                      className="glass-panel"
                      style={{
                        padding: "20px",
                        display: "flex",
                        flexDirection: "column",
                        boxSizing: "border-box",
                      }}
                    >
                      <div
                        style={{
                          borderBottom: "1px solid rgba(255,255,255,0.08)",
                          paddingBottom: "12px",
                          marginBottom: "16px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <span
                            style={{
                              fontSize: "10px",
                              background: "#a855f7",
                              color: "#fae8ff",
                              padding: "2px 8px",
                              borderRadius: "20px",
                              fontWeight: 600,
                              textTransform: "uppercase",
                            }}
                          >
                            Documentation
                          </span>
                          <h3
                            style={{
                              fontSize: "15px",
                              fontWeight: 700,
                              color: "#f3f4f6",
                              margin: "4px 0 0 0",
                            }}
                          >
                            📄 GENERATED_README.md
                          </h3>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            alignItems: "center",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              background: "rgba(255,255,255,0.03)",
                              border: "1px solid rgba(255,255,255,0.08)",
                              borderRadius: "6px",
                              padding: "2px",
                            }}
                          >
                            <button
                              onClick={() => setReadmeViewMode("preview")}
                              style={{
                                background:
                                  readmeViewMode === "preview"
                                    ? "rgba(168,85,247,0.15)"
                                    : "transparent",
                                border: "none",
                                color:
                                  readmeViewMode === "preview"
                                    ? "#c084fc"
                                    : "#9ca3af",
                                borderRadius: "4px",
                                padding: "4px 10px",
                                fontSize: "10px",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              Preview
                            </button>
                            <button
                              onClick={() => setReadmeViewMode("raw")}
                              style={{
                                background:
                                  readmeViewMode === "raw"
                                    ? "rgba(168,85,247,0.15)"
                                    : "transparent",
                                border: "none",
                                color:
                                  readmeViewMode === "raw"
                                    ? "#c084fc"
                                    : "#9ca3af",
                                borderRadius: "4px",
                                padding: "4px 10px",
                                fontSize: "10px",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              Raw
                            </button>
                          </div>
                          <CopyToClipboardButton
                            textToCopy={analysisResult.analysis.generatedReadme}
                            showText={true}
                            style={{
                              background: "rgba(168,85,247,0.1)",
                              border: "1px solid rgba(168,85,247,0.3)",
                              color: "#c084fc",
                              borderRadius: "6px",
                              padding: "6px 12px",
                              cursor: "pointer",
                            }}
                          />
                          <button
                            onClick={downloadReadme}
                            style={{
                              background: "rgba(168,85,247,0.1)",
                              border: "1px solid rgba(168,85,247,0.3)",
                              color: "#c084fc",
                              borderRadius: "6px",
                              padding: "6px 12px",
                              fontSize: "11px",
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <Download size={14} /> Download
                          </button>
                        </div>
                      </div>

                      {readmeViewMode === "raw" ? (
                        <div
                          style={{
                            flexGrow: 1,
                            overflowY: "auto",
                            maxHeight: "60vh",
                            background: "rgba(15,23,42,0.4)",
                            padding: "16px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255,255,255,0.05)",
                            fontSize: "12px",
                            lineHeight: 1.5,
                            color: "#d1d5db",
                            fontFamily: "monospace",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {analysisResult.analysis.generatedReadme}
                        </div>
                      ) : (
                        <div
                          style={{
                            flexGrow: 1,
                            overflowY: "auto",
                            maxHeight: "60vh",
                            background: "rgba(15,23,42,0.4)",
                            padding: "16px 20px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255,255,255,0.05)",
                            display: "flex",
                            flexDirection: "column",
                          }}
                        >
                          <MarkdownErrorBoundary>
                            {renderMarkdown(
                              analysisResult.analysis.generatedReadme,
                            )}
                          </MarkdownErrorBoundary>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {activeDashboardView === "chat" && (
                  <SectionErrorBoundary sectionName="ChatPanel">
                    <ChatPanel
                      chatHistory={chatHistory}
                      isChatLoading={isChatLoading}
                      chatInput={chatInput}
                      setChatInput={setChatInput}
                      chatInputEmpty={chatInputEmpty}
                      selectedModel={selectedModel}
                      sessionId={sessionId}
                      useRag={useRag}
                      setUseRag={setUseRag}
                      handleSendChatMessage={handleSendChatMessage}
                      renderMarkdown={renderMarkdown}
                    />
                  </SectionErrorBoundary>
                )}

                {activeDashboardView === "diagram" && (
                  <SectionErrorBoundary sectionName="MermaidDiagram">
                    <div
                      className="glass-panel"
                      style={{
                        padding: "20px",
                        display: "flex",
                        flexDirection: "column",
                        boxSizing: "border-box",
                        minHeight: "68vh",
                        width: "100%",
                      }}
                    >
                      <div
                        style={{
                          borderBottom: "1px solid rgba(255,255,255,0.08)",
                          paddingBottom: "12px",
                          marginBottom: "16px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "10px",
                            background: "#22c55e",
                            color: "#dcfce7",
                            padding: "2px 8px",
                            borderRadius: "20px",
                            fontWeight: 600,
                            textTransform: "uppercase",
                          }}
                        >
                          Visualizer
                        </span>
                        <h3
                          style={{
                            fontSize: "15px",
                            fontWeight: 700,
                            color: "#f3f4f6",
                            margin: "4px 0 0 0",
                          }}
                        >
                          Codebase Dependency Flow
                        </h3>
                      </div>
                      {analysisResult.analysis?.mermaidDiagram ? (
                        <MermaidDiagramViewer
                          chart={analysisResult.analysis.mermaidDiagram}
                          repoName={analysisResult.repoName}
                        />
                      ) : (
                        <div
                          style={{
                            color: "#9ca3af",
                            fontSize: "12px",
                            padding: "20px",
                            textAlign: "center",
                          }}
                        >
                          No architecture diagram was generated for this
                          repository. Try re-running the analysis.
                        </div>
                      )}
                    </div>
                  </SectionErrorBoundary>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
      {showShortcutsHelp && <KeyboardShortcutsHelp onClose={() => setShowShortcutsHelp(false)} />}

      <DashboardFooter />
    </div>
  );
}

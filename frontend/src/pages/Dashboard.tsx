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
import { usePersistentReport } from '../hooks/usePersistentReport';
import { useStreamingReview } from "../hooks/useStreamingReview";

const LazyMetricsChart = React.lazy(() =>
  import('../components/MetricsChart').then((module) => ({ default: module.MetricsChart }))
  .catch(err => console.error(err))
import { create } from 'zustand';
import { BackendResponse } from '../pages/Dashboard';

export interface ChatSource { source?: string; file?: string; line?: number; }
export interface ChatMessage { role: "user" | "assistant"; content: string; sources?: ChatSource[]; }

interface GlobalState {
  analysisResult: BackendResponse | null;
  setAnalysisResult: (result: BackendResponse | null) => void;
  selectedFile: string | null;
  setSelectedFile: (file: string | null) => void;
  chatHistory: ChatMessage[];
  setChatHistory: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
}

const CHAT_HISTORY_KEY = 'reposage_chat_history';

const loadChatHistory = (): ChatMessage[] => {
  try {
    const saved = localStorage.getItem(CHAT_HISTORY_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {}
  return [];
};

const MAX_CHAT_MSGS = 50;
const MAX_CHAT_CHARS = 50000;

const persistChatHistory = (history: ChatMessage[]) => {
  try {
    let trimmed = history.slice(-MAX_CHAT_MSGS);
    let totalChars = 0;
    for (let i = trimmed.length - 1; i >= 0; i--) {
      totalChars += trimmed[i].content.length;
      if (totalChars > MAX_CHAT_CHARS) {
        trimmed = trimmed.slice(i + 1);
        break;
      }
    }
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(trimmed));
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      localStorage.removeItem(CHAT_HISTORY_KEY);
    }
  }
};

export const useStore = create<GlobalState>((set) => ({
  analysisResult: null,
  setAnalysisResult: (result) => set({ analysisResult: result }),
  selectedFile: null,
  setSelectedFile: (file) => set({ selectedFile: file }),
  chatHistory: loadChatHistory(),
  setChatHistory: (updater) => {
    const current = useStore.getState().chatHistory;
    const updated = typeof updater === 'function' ? updater(current) : updater;
    persistChatHistory(updated);
    set({ chatHistory: updated });
  },
}));

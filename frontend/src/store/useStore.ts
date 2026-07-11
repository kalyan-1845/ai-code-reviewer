import { create } from 'zustand';
import { BackendResponse } from '../pages/Dashboard';

export interface ChatMessage { role: "user" | "assistant"; content: string; sources?: { file: string; line: number }[]; }

interface GlobalState {
  analysisResult: BackendResponse | null;
  setAnalysisResult: (result: BackendResponse | null) => void;
  selectedFile: string | null;
  setSelectedFile: (file: string | null) => void;
  chatHistory: ChatMessage[];
  setChatHistory: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
}

const loadChatHistory = (): ChatMessage[] => {
  try {
    const saved = localStorage.getItem('reposage_chat_history');
    if (saved) {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {}
  return [];
};

let chatHistoryLoaded = false;
let chatHistoryCache: ChatMessage[] = [];

export const useStore = create<GlobalState>((set) => ({
  analysisResult: null,
  setAnalysisResult: (result) => set({ analysisResult: result }),
  selectedFile: null,
  setSelectedFile: (file) => set({ selectedFile: file }),
  chatHistory: [],
  setChatHistory: (updater) => set((state) => {
    if (!chatHistoryLoaded) {
      chatHistoryCache = loadChatHistory();
      chatHistoryLoaded = true;
    }
    const current = chatHistoryLoaded ? chatHistoryCache : state.chatHistory;
    const updated = typeof updater === 'function' ? updater(current) : updater;
    chatHistoryCache = updated;
    try { localStorage.setItem("reposage_chat_history", JSON.stringify(updated)); } catch {}
    return { chatHistory: updated };
  }),
}));

import { create } from 'zustand';
import { BackendResponse } from '../pages/Dashboard';

export interface ChatMessage { role: "user" | "assistant" | "assistant"; content: string; }

interface GlobalState {
  analysisResult: BackendResponse | null;
  setAnalysisResult: (result: BackendResponse | null) => void;
  selectedFile: string | null;
  setSelectedFile: (file: string | null) => void;
  chatHistory: ChatMessage[];
  setChatHistory: (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
}

export const useStore = create<GlobalState>((set) => ({
  analysisResult: null,
  setAnalysisResult: (result) => set({ analysisResult: result }),
  selectedFile: null,
  setSelectedFile: (file) => set({ selectedFile: file }),
  chatHistory: (() => { try { const saved = localStorage.getItem('reposage_chat_history'); return saved ? JSON.parse(saved) : []; } catch { return []; } })(),
  setChatHistory: (updater) => set((state) => {
    const updated = typeof updater === 'function' ? updater(state.chatHistory) : updater;
    try { localStorage.setItem("reposage_chat_history", JSON.stringify(updated)); } catch {}
    return { chatHistory: updated };
  }),
}));

// Frontend unit tests for useStore zustand store
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './useStore.ts';

const mockAnalysisResult = {
  success: true,
  analysis: { fileReviews: {} }
};

const mockLocalStorage = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString(); },
    clear: () => { store = {}; },
    removeItem: (key) => { delete store[key]; }
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage,
});

describe('useStore', () => {
  beforeEach(() => {
    useStore.setState({
      analysisResult: null,
      selectedFile: null,
      chatHistory: []
    });
  });

  describe('analysisResult', () => {
    it('initial state has null analysisResult', () => {
      expect(useStore.getState().analysisResult).toBeNull();
    });

    it('setAnalysisResult updates analysisResult', () => {
      useStore.getState().setAnalysisResult(mockAnalysisResult);
      expect(useStore.getState().analysisResult).toEqual(mockAnalysisResult);
    });

    it('setAnalysisResult can set to null', () => {
      useStore.getState().setAnalysisResult(mockAnalysisResult);
      useStore.getState().setAnalysisResult(null);
      expect(useStore.getState().analysisResult).toBeNull();
    });
  });

  describe('selectedFile', () => {
    it('initial state has null selectedFile', () => {
      expect(useStore.getState().selectedFile).toBeNull();
    });

    it('setSelectedFile updates selectedFile', () => {
      useStore.getState().setSelectedFile('src/index.js');
      expect(useStore.getState().selectedFile).toEqual('src/index.js');
    });

    it('setSelectedFile can be set to null', () => {
      useStore.getState().setSelectedFile('src/app.js');
      useStore.getState().setSelectedFile(null);
      expect(useStore.getState().selectedFile).toBeNull();
    });
  });

  describe('chatHistory', () => {
    it('initial state is an empty array', () => {
      expect(Array.isArray(useStore.getState().chatHistory)).toBe(true);
      expect(useStore.getState().chatHistory).toHaveLength(0);
    });

    it('setChatHistory with an array replaces chatHistory', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' }
      ];
      useStore.getState().setChatHistory(messages);
      expect(useStore.getState().chatHistory).toEqual(messages);
    });

    it('setChatHistory with an updater function receives current state', () => {
      const initial = [{ role: 'user', content: 'first' }];
      useStore.setState({ chatHistory: initial });

      useStore.getState().setChatHistory((prev) => [
        ...prev,
        { role: 'assistant', content: 'second' }
      ]);

      const history = useStore.getState().chatHistory;
      expect(history).toHaveLength(2);
      expect(history[0].content).toEqual('first');
      expect(history[1].content).toEqual('second');
    });

    it('keeps the newest message when a single message exceeds the char cap', () => {
      // Regression test for #3667: an oversized AI response (alone exceeding
      // MAX_CHAT_CHARS) used to wipe the whole persisted history because
      // trimmed.slice(i + 1) with i === trimmed.length - 1 returns [].
      const oversized = 'x'.repeat(51000);
      const history = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: oversized }
      ];
      useStore.getState().setChatHistory(history);

      const saved = JSON.parse(localStorage.getItem('reposage_chat_history') || '[]');
      expect(saved.length).toBeGreaterThan(0);
      expect(saved[saved.length - 1].content).toEqual(oversized);
    });

    it('trims older messages to respect the char cap but keeps history non-empty', () => {
      const big = 'y'.repeat(30000);
      const history = [
        { role: 'user', content: big },
        { role: 'assistant', content: big }
      ];
      useStore.getState().setChatHistory(history);

      const saved = JSON.parse(localStorage.getItem('reposage_chat_history') || '[]');
      expect(saved.length).toBe(1);
      expect(saved[0].content).toEqual(big);
    });
  });

  describe('combined state', () => {
    it('all state can be updated independently', () => {
      useStore.getState().setAnalysisResult(mockAnalysisResult);
      useStore.getState().setSelectedFile('src/app.js');
      useStore.getState().setChatHistory([{ role: 'user', content: 'msg' }]);

      const state = useStore.getState();
      expect(state.analysisResult).toEqual(mockAnalysisResult);
      expect(state.selectedFile).toEqual('src/app.js');
      expect(state.chatHistory).toHaveLength(1);
    });
  });
});

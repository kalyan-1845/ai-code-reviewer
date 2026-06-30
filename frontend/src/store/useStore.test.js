// Frontend unit tests for useStore zustand store
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './useStore.ts';

const mockAnalysisResult = {
  success: true,
  analysis: { fileReviews: {} }
};

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

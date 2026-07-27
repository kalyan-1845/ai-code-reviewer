import { useState, useEffect, useCallback } from 'react';
import localforage from 'localforage';
import { BackendResponse } from '../pages/Dashboard';
import { useStore } from '../store/useStore';

export function usePersistentReport(
  setRepoUrl: (url: string) => void,
  setSessionId: (id: string | null) => void,
  storageKey = 'reposage_latest_audit'
) {
  const { analysisResult: report, setAnalysisResult: setReport } = useStore();
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const hydrate = async () => {
      try {
        const cached = await localforage.getItem<{ 
          data: BackendResponse; 
          repoUrl?: string; 
          sessionId?: string | null; 
          timestamp: number 
        }>(storageKey);
        
        if (cached && cached.timestamp) {
          const now = Date.now();
          const oneDay = 24 * 60 * 60 * 1000;
          
          if (now - cached.timestamp < oneDay) {
            if (isMounted) {
              setReport(cached.data);
              if (cached.repoUrl) setRepoUrl(cached.repoUrl);
              if (cached.sessionId !== undefined) setSessionId(cached.sessionId);
            }
          } else {
            // Expired cache, clear it
            await localforage.removeItem(storageKey);
          }
        }
      } catch (error) {
        console.error('Error hydrating report from localforage:', error);
      } finally {
        if (isMounted) setIsHydrating(false);
      }
    };

    hydrate();

    return () => {
      isMounted = false;
    };
  }, [storageKey, setReport, setRepoUrl, setSessionId]);

  const saveReport = useCallback(async (data: BackendResponse, currentRepoUrl: string, currentSessionId: string | null) => {
    setReport(data);
    try {
      await localforage.setItem(storageKey, {
        data,
        repoUrl: currentRepoUrl,
        sessionId: currentSessionId,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error saving report to localforage:', error);
    }
  }, [storageKey, setReport]);

  const clearReport = useCallback(async () => {
    setReport(null);
    setRepoUrl('');
    setSessionId(null);
    try {
      await localforage.removeItem(storageKey);
    } catch (error) {
      console.error('Error clearing report from localforage:', error);
    }
  }, [storageKey, setReport, setRepoUrl, setSessionId]);

  return { report, isHydrating, saveReport, clearReport };
}

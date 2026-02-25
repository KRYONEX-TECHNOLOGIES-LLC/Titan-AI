'use client';

import { useState, useEffect, useCallback } from 'react';

export function useMidnight(mounted: boolean, activeModel: string) {
  const [midnightActive, setMidnightActive] = useState(false);
  const [showFactoryView, setShowFactoryView] = useState(false);
  const [trustLevel, setTrustLevel] = useState<1 | 2 | 3>(1);
  const [confidenceScore, setConfidenceScore] = useState(100);
  const [confidenceStatus, setConfidenceStatus] = useState<'healthy' | 'warning' | 'error'>('healthy');
  const [protocolMode, setProtocolMode] = useState(true);
  const [startError, setStartError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    fetch('/api/midnight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setModel', model: activeModel }),
    }).catch(() => {});
  }, [activeModel, mounted]);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem('titan-midnight', JSON.stringify({ midnightActive, trustLevel, protocolMode }));
    } catch { /* ignore */ }
  }, [mounted, midnightActive, trustLevel, protocolMode]);

  useEffect(() => {
    if (!mounted) return;
    try {
      const saved = localStorage.getItem('titan-midnight');
      if (saved) {
        const state = JSON.parse(saved);
        if (state.trustLevel) setTrustLevel(state.trustLevel);
        if (state.protocolMode !== undefined) setProtocolMode(state.protocolMode);
      }
    } catch { /* ignore */ }
  }, [mounted]);

  // Poll backend status and sync midnightActive with reality
  useEffect(() => {
    if (!mounted) return;
    const syncStatus = async () => {
      try {
        const res = await fetch('/api/midnight', { cache: 'no-store' });
        if (res.ok) {
          const status = await res.json();
          const backendRunning = !!status.running;
          setMidnightActive(backendRunning);
          if (!backendRunning && showFactoryView) {
            setShowFactoryView(false);
          }
        }
      } catch { /* ignore */ }
    };
    void syncStatus();
    const interval = setInterval(syncStatus, 8000);
    return () => clearInterval(interval);
  }, [mounted, showFactoryView]);

  const startMidnight = useCallback(async () => {
    if (midnightActive) {
      setShowFactoryView(true);
      return;
    }
    setIsStarting(true);
    setStartError(null);
    try {
      const res = await fetch('/api/midnight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          trustLevel,
          model: activeModel,
          useProtocolMode: protocolMode,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setStartError(data.error || data.message || `Start failed (HTTP ${res.status})`);
        setMidnightActive(false);
        return;
      }
      setMidnightActive(true);
      setShowFactoryView(true);
      setStartError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error — is the server running?';
      setStartError(msg);
      setMidnightActive(false);
    } finally {
      setIsStarting(false);
    }
  }, [midnightActive, trustLevel, activeModel, protocolMode]);

  const stopMidnight = useCallback(async () => {
    try {
      await fetch('/api/midnight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
    } catch { /* best effort */ }
    setMidnightActive(false);
    setShowFactoryView(false);
    setStartError(null);
  }, []);

  return {
    midnightActive, setMidnightActive,
    showFactoryView, setShowFactoryView,
    trustLevel, setTrustLevel,
    confidenceScore, setConfidenceScore,
    confidenceStatus, setConfidenceStatus,
    protocolMode, setProtocolMode,
    startMidnight,
    stopMidnight,
    startError,
    isStarting,
  };
}

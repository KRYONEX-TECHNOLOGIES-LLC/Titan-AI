'use client';

import { useState, useEffect, useCallback } from 'react';

export function useMidnight(mounted: boolean, activeModel: string) {
  const [midnightActive, setMidnightActive] = useState(false);
  const [showFactoryView, setShowFactoryView] = useState(false);
  const [trustLevel, setTrustLevel] = useState<1 | 2 | 3>(1);
  const [confidenceScore, setConfidenceScore] = useState(100);
  const [confidenceStatus, setConfidenceStatus] = useState<'healthy' | 'warning' | 'error'>('healthy');
  const [protocolMode, setProtocolMode] = useState(true);

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
        if (state.midnightActive !== undefined) setMidnightActive(state.midnightActive);
        if (state.protocolMode !== undefined) setProtocolMode(state.protocolMode);
      }
    } catch { /* ignore */ }
  }, [mounted]);

  const startMidnight = useCallback(async () => {
    if (midnightActive) {
      setShowFactoryView(true);
      return;
    }
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
      if (data.success) {
        setMidnightActive(true);
        setShowFactoryView(true);
      }
    } catch {
      setMidnightActive(true);
      setShowFactoryView(true);
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
  };
}

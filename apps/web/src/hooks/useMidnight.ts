'use client';

import { useState, useEffect } from 'react';

export function useMidnight(mounted: boolean, activeModel: string) {
  const [midnightActive, setMidnightActive] = useState(false);
  const [showFactoryView, setShowFactoryView] = useState(false);
  const [trustLevel, setTrustLevel] = useState<1 | 2 | 3>(1);
  const [confidenceScore, setConfidenceScore] = useState(100);
  const [confidenceStatus, setConfidenceStatus] = useState<'healthy' | 'warning' | 'error'>('healthy');

  // Sync worker model
  useEffect(() => {
    if (!mounted) return;
    fetch('/api/midnight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setModel', model: activeModel }),
    }).catch(() => {});
  }, [activeModel, mounted]);

  // Persist midnight state
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem('titan-midnight', JSON.stringify({ midnightActive, trustLevel }));
    } catch { /* ignore */ }
  }, [mounted, midnightActive, trustLevel]);

  // Restore midnight state
  useEffect(() => {
    if (!mounted) return;
    try {
      const saved = localStorage.getItem('titan-midnight');
      if (saved) {
        const state = JSON.parse(saved);
        if (state.trustLevel) setTrustLevel(state.trustLevel);
        if (state.midnightActive !== undefined) setMidnightActive(state.midnightActive);
      }
    } catch { /* ignore */ }
  }, [mounted]);

  const startMidnight = async () => {
    if (midnightActive) {
      setShowFactoryView(true);
      return;
    }
    try {
      const res = await fetch('/api/midnight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', trustLevel, model: activeModel }),
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
  };

  const stopMidnight = () => {
    setMidnightActive(false);
  };

  return {
    midnightActive, setMidnightActive,
    showFactoryView, setShowFactoryView,
    trustLevel, setTrustLevel,
    confidenceScore, setConfidenceScore,
    confidenceStatus, setConfidenceStatus,
    startMidnight,
    stopMidnight,
  };
}

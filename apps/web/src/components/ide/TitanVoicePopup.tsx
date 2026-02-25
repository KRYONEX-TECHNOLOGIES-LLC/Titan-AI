'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { ProactiveThought } from '@/lib/voice/thought-engine';
import { useTitanVoice } from '@/stores/titan-voice.store';

interface TitanVoicePopupProps {
  thought: ProactiveThought | null;
  onDismiss: () => void;
  onTellMore: (thought: ProactiveThought) => void;
  onSnooze: (durationMs: number) => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  project_improvement: '🔧',
  new_idea: '💡',
  check_in: '👋',
  knowledge_share: '📚',
  warning: '⚠️',
  motivation: '🚀',
};

const CATEGORY_COLORS: Record<string, string> = {
  project_improvement: '#3b82f6',
  new_idea: '#f59e0b',
  check_in: '#10b981',
  knowledge_share: '#8b5cf6',
  warning: '#ef4444',
  motivation: '#06b6d4',
};

export default function TitanVoicePopup({ thought, onDismiss, onTellMore, onSnooze }: TitanVoicePopupProps) {
  const [visible, setVisible] = useState(false);
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);
  const voiceStore = useTitanVoice();

  useEffect(() => {
    if (thought) {
      requestAnimationFrame(() => setVisible(true));
      if (voiceStore.autoSpeak && voiceStore.voiceEnabled && !thought.spoken) {
        voiceStore.speak(thought.text);
      }
    } else {
      setVisible(false);
    }
  }, [thought, voiceStore]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setTimeout(onDismiss, 300);
  }, [onDismiss]);

  const handleTellMore = useCallback(() => {
    if (thought) onTellMore(thought);
    handleDismiss();
  }, [thought, onTellMore, handleDismiss]);

  const handleSpeak = useCallback(() => {
    if (thought) {
      voiceStore.speak(thought.text, 7);
    }
  }, [thought, voiceStore]);

  if (!thought) return null;

  const icon = CATEGORY_ICONS[thought.category] || '🤖';
  const accentColor = CATEGORY_COLORS[thought.category] || '#3b82f6';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 9999,
        maxWidth: 380,
        transform: visible ? 'translateY(0)' : 'translateY(120%)',
        opacity: visible ? 1 : 0,
        transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
    >
      <div
        style={{
          background: '#1a1a2e',
          border: `1px solid ${accentColor}40`,
          borderRadius: 12,
          padding: '14px 16px',
          boxShadow: `0 8px 32px ${accentColor}20, 0 0 0 1px ${accentColor}15`,
          backdropFilter: 'blur(16px)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${accentColor}, ${accentColor}80)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: accentColor, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Titan
            </div>
          </div>
          <button
            onClick={handleDismiss}
            style={{
              background: 'none',
              border: 'none',
              color: '#666',
              cursor: 'pointer',
              fontSize: 16,
              padding: '0 2px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Thought Text */}
        <div style={{ fontSize: 13, color: '#e0e0e0', lineHeight: 1.5, marginBottom: 10 }}>
          {thought.text}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            onClick={handleTellMore}
            style={{
              background: `${accentColor}20`,
              border: `1px solid ${accentColor}40`,
              color: accentColor,
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 11,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Tell me more
          </button>
          <button
            onClick={handleSpeak}
            style={{
              background: '#ffffff10',
              border: '1px solid #ffffff20',
              color: '#999',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            🔊 Speak
          </button>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowSnoozeMenu(!showSnoozeMenu)}
              style={{
                background: '#ffffff10',
                border: '1px solid #ffffff20',
                color: '#999',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              💤 Snooze
            </button>
            {showSnoozeMenu && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: 0,
                  background: '#1a1a2e',
                  border: '1px solid #ffffff20',
                  borderRadius: 8,
                  padding: 4,
                  marginBottom: 4,
                  minWidth: 120,
                }}
              >
                {[
                  { label: '30 min', ms: 1800000 },
                  { label: '1 hour', ms: 3600000 },
                  { label: '4 hours', ms: 14400000 },
                ].map(opt => (
                  <button
                    key={opt.ms}
                    onClick={() => {
                      onSnooze(opt.ms);
                      setShowSnoozeMenu(false);
                      handleDismiss();
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      color: '#ccc',
                      padding: '6px 10px',
                      fontSize: 11,
                      cursor: 'pointer',
                      textAlign: 'left',
                      borderRadius: 4,
                    }}
                    onMouseOver={(e) => { (e.target as HTMLElement).style.background = '#ffffff10'; }}
                    onMouseOut={(e) => { (e.target as HTMLElement).style.background = 'none'; }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

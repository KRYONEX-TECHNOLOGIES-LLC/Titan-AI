'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  const [speakingThis, setSpeakingThis] = useState(false);
  const voiceStore = useTitanVoice();
  const hasAutoSpoken = useRef<string | null>(null);

  useEffect(() => {
    if (thought) {
      requestAnimationFrame(() => setVisible(true));
      // Auto-speak new thoughts once, only if auto-speak is on
      if (
        voiceStore.autoSpeak &&
        voiceStore.voiceEnabled &&
        hasAutoSpoken.current !== thought.id
      ) {
        hasAutoSpoken.current = thought.id;
        voiceStore.speak(thought.text, 6);
      }
    } else {
      setVisible(false);
      setSpeakingThis(false);
    }
  }, [thought?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDismiss = useCallback(() => {
    setVisible(false);
    voiceStore.stopSpeaking();
    setTimeout(onDismiss, 300);
  }, [onDismiss, voiceStore]);

  const handleTellMore = useCallback(() => {
    if (thought) {
      voiceStore.stopSpeaking();
      onTellMore(thought);
    }
  }, [thought, onTellMore, voiceStore]);

  const handleSpeak = useCallback(() => {
    if (!thought) return;
    if (speakingThis) {
      voiceStore.stopSpeaking();
      setSpeakingThis(false);
    } else {
      setSpeakingThis(true);
      voiceStore.speak(thought.text, 8);
    }
  }, [thought, voiceStore, speakingThis]);

  // Track when speaking finishes
  useEffect(() => {
    if (speakingThis && !voiceStore.isSpeaking) {
      setSpeakingThis(false);
    }
  }, [voiceStore.isSpeaking, speakingThis]);

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
        maxWidth: 400,
        transform: visible ? 'translateY(0)' : 'translateY(120%)',
        opacity: visible ? 1 : 0,
        transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        pointerEvents: visible ? 'auto' : 'none',
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
              fontSize: 18,
              padding: '2px 4px',
              lineHeight: 1,
            }}
            title="Dismiss"
          >
            ×
          </button>
        </div>

        {/* Thought Text */}
        <div style={{ fontSize: 13, color: '#e0e0e0', lineHeight: 1.5, marginBottom: 12 }}>
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
              padding: '5px 12px',
              fontSize: 11,
              cursor: 'pointer',
              fontWeight: 500,
              transition: 'all 0.15s',
            }}
            onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = `${accentColor}35`; }}
            onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = `${accentColor}20`; }}
          >
            Tell me more
          </button>
          <button
            onClick={handleSpeak}
            style={{
              background: speakingThis ? '#ef444420' : '#ffffff10',
              border: `1px solid ${speakingThis ? '#ef444440' : '#ffffff20'}`,
              color: speakingThis ? '#ef4444' : '#999',
              borderRadius: 6,
              padding: '5px 12px',
              fontSize: 11,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = speakingThis ? '#ef444430' : '#ffffff20'; }}
            onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = speakingThis ? '#ef444420' : '#ffffff10'; }}
          >
            {speakingThis ? '⏹ Stop' : '🔊 Speak'}
          </button>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowSnoozeMenu(!showSnoozeMenu)}
              style={{
                background: showSnoozeMenu ? '#ffffff20' : '#ffffff10',
                border: '1px solid #ffffff20',
                color: '#999',
                borderRadius: 6,
                padding: '5px 12px',
                fontSize: 11,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = '#ffffff20'; }}
              onMouseOut={(e) => { if (!showSnoozeMenu) (e.currentTarget as HTMLElement).style.background = '#ffffff10'; }}
            >
              💤 Snooze
            </button>
            {showSnoozeMenu && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: 0,
                  background: '#1e1e2e',
                  border: '1px solid #ffffff25',
                  borderRadius: 8,
                  padding: 4,
                  marginBottom: 4,
                  minWidth: 130,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                }}
              >
                {[
                  { label: '15 minutes', ms: 900_000 },
                  { label: '30 minutes', ms: 1_800_000 },
                  { label: '1 hour', ms: 3_600_000 },
                  { label: '4 hours', ms: 14_400_000 },
                  { label: 'Rest of session', ms: 86_400_000 },
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
                      padding: '7px 12px',
                      fontSize: 11,
                      cursor: 'pointer',
                      textAlign: 'left',
                      borderRadius: 4,
                      transition: 'background 0.1s',
                    }}
                    onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = '#ffffff12'; }}
                    onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
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

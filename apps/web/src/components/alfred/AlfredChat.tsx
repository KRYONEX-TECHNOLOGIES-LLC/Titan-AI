'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAlfredCanvas } from '@/stores/alfred-canvas-store';
import { AlfredQuickActions } from './AlfredQuickActions';
import { AlfredChoiceChips, parseChoices } from './AlfredChoiceChips';
import { AlfredActionBar, parseActions } from './AlfredActionBar';
import { AlfredArtifactCard, parseArtifacts } from './AlfredArtifactCard';

interface ConversationEntry {
  role: 'user' | 'alfred';
  text: string;
  time: string;
  buildSteps?: Array<{ id: string; tool: string; description: string; status: string; result?: string }>;
}

interface AlfredChatProps {
  alfredState: string;
  conversationLog: ConversationEntry[];
  voice: {
    isListening: boolean;
    interimText: string;
    errorMessage: string | null;
    clearError: () => void;
  };
  sendManual: (text: string) => void;
  titanVoice: {
    isSpeaking: boolean;
    voiceEnabled: boolean;
    stopSpeaking: () => void;
    toggleVoice: () => void;
  };
  renderMessage: (text: string) => React.ReactNode;
  WaveformVisualizer: React.ComponentType<{ active: boolean; speaking: boolean }>;
  BuildProgressCard: React.ComponentType<{ steps: Array<{ id: string; tool: string; description: string; status: string; result?: string }> }>;
}

export function AlfredChat({
  alfredState, conversationLog, voice, sendManual,
  titanVoice, renderMessage, WaveformVisualizer, BuildProgressCard,
}: AlfredChatProps) {
  const logEndRef = useRef<HTMLDivElement>(null);
  const [manualInput, setManualInput] = useState('');
  const [attachedImages, setAttachedImages] = useState<File[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const { pushContent, addArtifact, setPendingAction } = useAlfredCanvas();

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationLog]);

  const handleManualSend = useCallback((text?: string) => {
    const msg = text ?? manualInput.trim();
    if (!msg && attachedImages.length === 0) return;
    if (attachedImages.length > 0 && !text) {
      const imageNames = attachedImages.map(f => f.name).join(', ');
      sendManual(msg ? `${msg}\n[Attached images: ${imageNames}]` : `[Attached images: ${imageNames}]`);
    } else {
      sendManual(msg);
    }
    setManualInput('');
    setAttachedImages([]);
  }, [manualInput, attachedImages, sendManual]);

  const handleActionClick = useCallback((action: string) => {
    const lower = action.toLowerCase();
    if (lower === 'proceed' || lower === 'yes' || lower === 'confirm' || lower === 'go') {
      sendManual('proceed');
    } else if (lower === 'cancel' || lower === 'no') {
      setPendingAction(null);
      sendManual('cancel');
    } else if (lower === 'play' || lower === 'run' || lower === 'execute') {
      sendManual(`run ${action.toLowerCase()}`);
    } else {
      sendManual(action);
    }
  }, [sendManual, setPendingAction]);

  const handleImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) setAttachedImages(prev => [...prev, ...files]);
  }, []);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) setAttachedImages(prev => [...prev, ...files]);
  }, []);

  const isProcessing = alfredState === 'processing';

  useEffect(() => {
    if (conversationLog.length === 0) return;
    const last = conversationLog[conversationLog.length - 1];
    if (last && last.role === 'alfred' && last.text.length > 200) {
      if (last.text.includes('http') || last.text.includes('```') || last.text.includes('##')) {
        pushContent({
          type: last.text.includes('```') ? 'code' : 'screen',
          title: last.text.includes('```') ? 'Code from Alfred' : 'Alfred Response',
          data: last.text,
          timestamp: Date.now(),
        });
      }
    }

    if (last && last.role === 'alfred') {
      const { artifacts } = parseArtifacts(last.text);
      for (const art of artifacts) {
        addArtifact(art);
      }
    }
  }, [conversationLog, pushContent, addArtifact]);

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      {/* Waveform */}
      <div className="px-3 py-2 border-b border-[#2a2a2a]">
        <WaveformVisualizer active={true} speaking={titanVoice.isSpeaking} />
        {voice.errorMessage && (
          <div className="mt-1.5 rounded bg-red-900/20 border border-red-800/40 p-1.5 flex items-center justify-between">
            <span className="text-[10px] text-red-300">{voice.errorMessage}</span>
            <button onClick={voice.clearError} className="text-red-400 text-[12px] hover:text-red-300 ml-2">x</button>
          </div>
        )}
        {voice.interimText && (
          <div className="mt-1.5 rounded bg-[#1a1a2e] border border-cyan-800/30 p-1.5">
            <span className="text-[10px] text-cyan-400 mr-1">Hearing:</span>
            <span className="text-[11px] text-white/80 italic">{voice.interimText}</span>
          </div>
        )}
      </div>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {conversationLog.map((entry, i) => {
          if (entry.buildSteps && entry.buildSteps.length > 0) {
            return (
              <div key={i} className="flex gap-2 justify-start">
                <AlfredAvatar />
                <div className="max-w-[90%] flex-1">
                  <BuildProgressCard steps={entry.buildSteps} />
                </div>
              </div>
            );
          }

          const parsed = entry.role === 'alfred' ? parseChoices(entry.text) : null;
          const actionsParsed = entry.role === 'alfred' ? parseActions(parsed?.cleanText || entry.text) : null;
          const artifactsParsed = entry.role === 'alfred' ? parseArtifacts(actionsParsed?.cleanText || parsed?.cleanText || entry.text) : null;
          const displayText = artifactsParsed?.cleanText || actionsParsed?.cleanText || parsed?.cleanText || entry.text;
          const choices = parsed?.choices || [];
          const actions = actionsParsed?.actions || [];
          const artifacts = artifactsParsed?.artifacts || [];
          const isLastAlfred = entry.role === 'alfred' && i === conversationLog.length - 1;

          return (
            <div key={i} className={`flex gap-2 ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {entry.role === 'alfred' && <AlfredAvatar />}
              <div className={`max-w-[85%] rounded-lg px-3 py-2 ${
                entry.role === 'user'
                  ? 'bg-blue-600/20 border border-blue-500/30'
                  : 'bg-[#252526] border border-[#3c3c3c]'
              }`}>
                <div className="text-[12px] text-[#e0e0e0] leading-relaxed whitespace-pre-wrap">
                  {entry.role === 'alfred' ? renderMessage(displayText) : displayText}
                </div>
                {choices.length > 0 && (
                  <AlfredChoiceChips choices={choices} onSelect={(c) => handleManualSend(c)} disabled={isProcessing} />
                )}
                {actions.length > 0 && isLastAlfred && (
                  <AlfredActionBar actions={actions} onAction={handleActionClick} disabled={isProcessing} />
                )}
                {artifacts.map((art) => (
                  <AlfredArtifactCard key={art.id} artifact={art} />
                ))}
                <span className="text-[9px] text-[#666] mt-1 block">{entry.time}</span>
              </div>
              {entry.role === 'user' && (
                <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-[9px] font-bold">U</span>
                </div>
              )}
            </div>
          );
        })}

        {isProcessing && (
          <div className="flex gap-2 justify-start">
            <AlfredAvatar />
            <div className="bg-[#252526] border border-[#3c3c3c] rounded-lg px-3 py-2">
              <div className="flex gap-1 items-center">
                <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={logEndRef} />
      </div>

      {/* Quick actions */}
      <AlfredQuickActions onSend={(t) => handleManualSend(t)} disabled={isProcessing} />

      {/* Input */}
      <div className="px-3 py-2.5 border-t border-[#3c3c3c] space-y-2">
        <div className="flex gap-1.5 flex-wrap items-center">
          {titanVoice.isSpeaking && (
            <button onClick={() => titanVoice.stopSpeaking()} className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-600/20 text-red-300 border border-red-500/40 hover:bg-red-600/30 transition-all">
              Stop Speaking
            </button>
          )}
          <button
            onClick={() => titanVoice.toggleVoice()}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${titanVoice.voiceEnabled ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40' : 'bg-[#2d2d2d] text-[#808080] border border-[#3c3c3c]'}`}
          >
            TTS {titanVoice.voiceEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {attachedImages.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {attachedImages.map((f, i) => (
              <div key={i} className="relative group">
                <div className="w-10 h-10 rounded border border-[#3c3c3c] bg-[#1a1a1a] overflow-hidden">
                  <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                </div>
                <button onClick={() => setAttachedImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-600 rounded-full text-[7px] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  x
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2" onDragOver={e => e.preventDefault()} onDrop={handleImageDrop}>
          <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />
          <button onClick={() => imageInputRef.current?.click()} className="px-2 py-1.5 rounded-lg bg-[#2d2d2d] border border-[#3c3c3c] text-[#808080] hover:text-white hover:border-[#555] transition-colors text-[12px]" title="Attach image">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
            </svg>
          </button>
          <input
            type="text"
            value={manualInput}
            onChange={e => setManualInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleManualSend(); } }}
            placeholder={voice.isListening ? 'Listening... or type here' : 'Talk to Alfred...'}
            className="flex-1 bg-[#1a1a1a] border border-[#3c3c3c] rounded-lg px-3 py-1.5 text-[12px] text-white placeholder-[#555] focus:border-cyan-600 focus:outline-none transition-colors"
            disabled={isProcessing}
          />
          <button
            onClick={() => handleManualSend()}
            disabled={isProcessing || (!manualInput.trim() && attachedImages.length === 0)}
            className="px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-[11px] font-medium hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function AlfredAvatar() {
  return (
    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
      <span className="text-white text-[9px] font-bold">A</span>
    </div>
  );
}

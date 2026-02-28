'use client';
import React from 'react';
import { useAlfredCanvas, type Artifact } from '@/stores/alfred-canvas-store';

interface AlfredArtifactCardProps {
  artifact: Artifact;
}

export function AlfredArtifactCard({ artifact }: AlfredArtifactCardProps) {
  const { pushContent } = useAlfredCanvas();

  const handleOpen = () => {
    if (artifact.type === 'url' && artifact.url) {
      pushContent({ type: 'screen', title: artifact.title, data: artifact.url, timestamp: Date.now(), meta: { url: artifact.url, isIframe: true } });
    } else if (artifact.type === 'video' && artifact.url) {
      pushContent({ type: 'video', title: artifact.title, data: artifact.url, timestamp: Date.now(), meta: { url: artifact.url } });
    } else if (artifact.type === 'simulation' || artifact.type === 'html') {
      pushContent({ type: 'simulation', title: artifact.title, data: artifact.code || '', timestamp: Date.now(), meta: { language: artifact.language } });
    } else if (artifact.type === 'code') {
      pushContent({ type: 'vibe', title: artifact.title, data: artifact.code || '', timestamp: Date.now(), meta: { language: artifact.language } });
    }
  };

  const getTypeIcon = () => {
    switch (artifact.type) {
      case 'code': return '{ }';
      case 'html': case 'simulation': return '▶';
      case 'url': return '🔗';
      case 'video': return '▶';
      case 'image': return '🖼';
      default: return '📄';
    }
  };

  const getTypeColor = () => {
    switch (artifact.type) {
      case 'code': return 'border-emerald-500/40 bg-emerald-500/10';
      case 'html': case 'simulation': return 'border-cyan-500/40 bg-cyan-500/10';
      case 'url': return 'border-blue-500/40 bg-blue-500/10';
      case 'video': return 'border-purple-500/40 bg-purple-500/10';
      default: return 'border-[#444] bg-[#1a1a1a]';
    }
  };

  return (
    <button
      onClick={handleOpen}
      className={`w-full flex items-center gap-3 mt-2 px-3 py-2.5 rounded-lg border transition-all hover:brightness-125 active:scale-[0.98] ${getTypeColor()}`}
    >
      <span className="text-[16px] w-8 h-8 flex items-center justify-center rounded-md bg-black/20">{getTypeIcon()}</span>
      <div className="flex-1 text-left min-w-0">
        <div className="text-[12px] font-medium text-white truncate">{artifact.title}</div>
        <div className="text-[10px] text-[#888]">{artifact.type} — click to open in canvas</div>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </button>
  );
}

const ARTIFACT_REGEX = /\[artifact:\s*(code|html|url|video|simulation)\s*(?:\|([^\]]*))?\]/g;

export function parseArtifacts(text: string, code?: string): { cleanText: string; artifacts: Artifact[] } {
  const artifacts: Artifact[] = [];
  let cleanText = text;
  let match;

  while ((match = ARTIFACT_REGEX.exec(text)) !== null) {
    const type = match[1] as Artifact['type'];
    const title = match[2]?.trim() || `${type.charAt(0).toUpperCase() + type.slice(1)} artifact`;
    artifacts.push({
      id: `art-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      title,
      code: code || undefined,
      timestamp: Date.now(),
    });
  }

  cleanText = text.replace(ARTIFACT_REGEX, '').trim();
  ARTIFACT_REGEX.lastIndex = 0;
  return { cleanText, artifacts };
}

'use client';

import React, { useMemo } from 'react';
import { useAlfredCanvas } from '@/stores/alfred-canvas-store';

const YT_REGEX = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/;

export function VideoView() {
  const { content, contentHistory } = useAlfredCanvas();

  const videoItems = contentHistory.filter((c) => c.type === 'video');
  const active = content?.type === 'video' ? content : videoItems[videoItems.length - 1];

  const youtubeId = useMemo(() => {
    if (!active?.data) return null;
    const match = active.data.match(YT_REGEX);
    return match?.[1] || null;
  }, [active]);

  const directUrl = useMemo(() => {
    if (!active?.data) return null;
    const url = (active.meta?.url as string) || active.data;
    if (url.match(/\.(mp4|webm|ogg)(\?|$)/i)) return url;
    return null;
  }, [active]);

  if (!active || (!youtubeId && !directUrl)) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#555] bg-[#0d0d0d]">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
          <line x1="7" y1="2" x2="7" y2="22" />
          <line x1="17" y1="2" x2="17" y2="22" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <line x1="2" y1="7" x2="7" y2="7" />
          <line x1="2" y1="17" x2="7" y2="17" />
          <line x1="17" y1="7" x2="22" y2="7" />
          <line x1="17" y1="17" x2="22" y2="17" />
        </svg>
        <p className="text-[13px] mt-3 text-[#ccc]">Video Player</p>
        <p className="text-[10px] text-[#555] mt-1 text-center max-w-[280px]">
          Share a YouTube link or video URL with Alfred to watch it here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-black">
      {active.title && (
        <div className="px-3 py-1.5 border-b border-[#2a2a2a] bg-[#111]">
          <span className="text-[11px] text-[#ccc] truncate">{active.title}</span>
        </div>
      )}
      <div className="flex-1 flex items-center justify-center min-h-0">
        {youtubeId ? (
          <iframe
            src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`}
            title={active.title || 'Video'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="w-full h-full border-0"
          />
        ) : directUrl ? (
          <video src={directUrl} controls autoPlay className="max-w-full max-h-full">
            <track kind="captions" />
          </video>
        ) : null}
      </div>
    </div>
  );
}

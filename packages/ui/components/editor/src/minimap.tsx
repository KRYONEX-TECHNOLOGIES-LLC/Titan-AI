// Minimap Component
// packages/ui/components/editor/src/minimap.tsx

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { clsx } from 'clsx';

export interface MinimapProps {
  lines: MinimapLine[];
  visibleStartLine: number;
  visibleEndLine: number;
  totalLines: number;
  width?: number;
  className?: string;
  onNavigate?: (line: number) => void;
}

export interface MinimapLine {
  lineNumber: number;
  tokens: MinimapToken[];
}

export interface MinimapToken {
  text: string;
  color?: string;
  startColumn: number;
}

export function Minimap({
  lines,
  visibleStartLine,
  visibleEndLine,
  totalLines,
  width = 100,
  className,
  onNavigate,
}: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [scale, setScale] = useState(1);

  const lineHeight = 2;
  const charWidth = 1;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate scale to fit all lines
    const containerHeight = containerRef.current?.clientHeight || 400;
    const requiredHeight = totalLines * lineHeight;
    const newScale = Math.min(1, containerHeight / requiredHeight);
    setScale(newScale);

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw minimap
    lines.forEach((line) => {
      const y = (line.lineNumber - 1) * lineHeight * newScale;
      
      line.tokens.forEach((token) => {
        ctx.fillStyle = token.color || '#888';
        const x = token.startColumn * charWidth;
        const tokenWidth = token.text.length * charWidth;
        ctx.fillRect(x, y, tokenWidth, lineHeight * newScale * 0.8);
      });
    });

  }, [lines, totalLines, width, scale]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const line = Math.floor(y / (lineHeight * scale)) + 1;
    
    onNavigate?.(Math.min(Math.max(1, line), totalLines));
  }, [scale, totalLines, onNavigate]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    handleClick(e);
  }, [handleClick]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      handleClick(e);
    }
  }, [isDragging, handleClick]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // Calculate viewport indicator position and size
  const viewportTop = (visibleStartLine - 1) * lineHeight * scale;
  const viewportHeight = (visibleEndLine - visibleStartLine + 1) * lineHeight * scale;

  return (
    <div
      ref={containerRef}
      className={clsx(
        'titan-minimap',
        'relative h-full overflow-hidden',
        'bg-minimap-background',
        className
      )}
      style={{ width }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={totalLines * lineHeight * scale}
        className="titan-minimap-canvas"
      />
      
      {/* Viewport indicator */}
      <div
        className={clsx(
          'titan-minimap-viewport',
          'absolute left-0 right-0',
          'bg-minimap-viewport/30 border border-minimap-viewport-border/50',
          'pointer-events-none'
        )}
        style={{
          top: viewportTop,
          height: Math.max(viewportHeight, 20),
        }}
      />
    </div>
  );
}

export interface MinimapSliderProps {
  totalLines: number;
  visibleStartLine: number;
  visibleEndLine: number;
  className?: string;
  onScroll?: (startLine: number) => void;
}

export function MinimapSlider({
  totalLines,
  visibleStartLine,
  visibleEndLine,
  className,
  onScroll,
}: MinimapSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const visibleLines = visibleEndLine - visibleStartLine + 1;
  const sliderHeight = Math.max((visibleLines / totalLines) * 100, 10);
  const sliderTop = ((visibleStartLine - 1) / totalLines) * 100;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const percentage = y / rect.height;
    const startLine = Math.floor(percentage * totalLines) + 1;
    
    onScroll?.(Math.min(Math.max(1, startLine), totalLines - visibleLines + 1));
  }, [isDragging, totalLines, visibleLines, onScroll]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleTrackClick = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const y = e.clientY - rect.top;
    const percentage = y / rect.height;
    const startLine = Math.floor(percentage * totalLines) + 1;
    
    onScroll?.(Math.min(Math.max(1, startLine), totalLines - visibleLines + 1));
  };

  return (
    <div
      ref={containerRef}
      className={clsx(
        'titan-minimap-slider',
        'relative w-3 h-full',
        'bg-minimap-slider-track',
        className
      )}
      onClick={handleTrackClick}
    >
      <div
        className={clsx(
          'titan-minimap-slider-thumb',
          'absolute left-0 right-0 rounded-sm',
          'bg-minimap-slider-thumb cursor-pointer',
          isDragging && 'bg-minimap-slider-thumb-active'
        )}
        style={{
          top: `${sliderTop}%`,
          height: `${sliderHeight}%`,
          minHeight: '20px',
        }}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
}

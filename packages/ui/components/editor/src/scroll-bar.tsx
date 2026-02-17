// Scroll Bar Component
// packages/ui/components/editor/src/scroll-bar.tsx

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { clsx } from 'clsx';

export interface ScrollBarProps {
  orientation: 'vertical' | 'horizontal';
  contentSize: number;
  viewportSize: number;
  scrollPosition: number;
  onScroll: (position: number) => void;
  className?: string;
}

export function ScrollBar({
  orientation,
  contentSize,
  viewportSize,
  scrollPosition,
  onScroll,
  className,
}: ScrollBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ position: 0, scrollPosition: 0 });

  const isVertical = orientation === 'vertical';
  
  // Calculate thumb size and position
  const ratio = Math.min(viewportSize / contentSize, 1);
  const thumbSize = Math.max(ratio * 100, 10); // Min 10%
  const maxScroll = contentSize - viewportSize;
  const thumbPosition = maxScroll > 0 ? (scrollPosition / maxScroll) * (100 - thumbSize) : 0;

  const handleTrackClick = (e: React.MouseEvent) => {
    const track = trackRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const clickPos = isVertical
      ? (e.clientY - rect.top) / rect.height
      : (e.clientX - rect.left) / rect.width;

    const newScroll = clickPos * maxScroll;
    onScroll(Math.max(0, Math.min(maxScroll, newScroll)));
  };

  const handleThumbMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    setDragStart({
      position: isVertical ? e.clientY : e.clientX,
      scrollPosition,
    });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !trackRef.current) return;

    const track = trackRef.current;
    const rect = track.getBoundingClientRect();
    const trackSize = isVertical ? rect.height : rect.width;
    const currentPos = isVertical ? e.clientY : e.clientX;
    const delta = currentPos - dragStart.position;
    const scrollDelta = (delta / trackSize) * contentSize;
    
    const newScroll = dragStart.scrollPosition + scrollDelta;
    onScroll(Math.max(0, Math.min(maxScroll, newScroll)));
  }, [isDragging, isVertical, dragStart, contentSize, maxScroll, onScroll]);

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

  // Don't render if content fits in viewport
  if (contentSize <= viewportSize) {
    return null;
  }

  return (
    <div
      ref={trackRef}
      className={clsx(
        'titan-scrollbar',
        isVertical ? 'w-3 h-full' : 'h-3 w-full',
        'bg-scrollbar-track',
        className
      )}
      onClick={handleTrackClick}
    >
      <div
        className={clsx(
          'titan-scrollbar-thumb',
          'rounded-full bg-scrollbar-thumb',
          'hover:bg-scrollbar-thumb-hover',
          isDragging && 'bg-scrollbar-thumb-active',
          isVertical ? 'w-full' : 'h-full',
        )}
        style={{
          [isVertical ? 'height' : 'width']: `${thumbSize}%`,
          [isVertical ? 'top' : 'left']: `${thumbPosition}%`,
          position: 'relative',
        }}
        onMouseDown={handleThumbMouseDown}
      />
    </div>
  );
}

export interface OverlayScrollBarProps {
  orientation: 'vertical' | 'horizontal';
  contentSize: number;
  viewportSize: number;
  scrollPosition: number;
  onScroll: (position: number) => void;
  autoHide?: boolean;
  hideDelay?: number;
  className?: string;
}

export function OverlayScrollBar({
  orientation,
  contentSize,
  viewportSize,
  scrollPosition,
  onScroll,
  autoHide = true,
  hideDelay = 1000,
  className,
}: OverlayScrollBarProps) {
  const [isVisible, setIsVisible] = useState(!autoHide);
  const hideTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (autoHide) {
      setIsVisible(true);
      
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      
      hideTimeoutRef.current = setTimeout(() => {
        setIsVisible(false);
      }, hideDelay);
    }
    
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [scrollPosition, autoHide, hideDelay]);

  const handleMouseEnter = () => {
    if (autoHide) {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      setIsVisible(true);
    }
  };

  const handleMouseLeave = () => {
    if (autoHide) {
      hideTimeoutRef.current = setTimeout(() => {
        setIsVisible(false);
      }, hideDelay);
    }
  };

  const isVertical = orientation === 'vertical';

  return (
    <div
      className={clsx(
        'titan-overlay-scrollbar',
        'absolute transition-opacity duration-200',
        isVertical ? 'right-0 top-0 bottom-0' : 'bottom-0 left-0 right-0',
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none',
        className
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <ScrollBar
        orientation={orientation}
        contentSize={contentSize}
        viewportSize={viewportSize}
        scrollPosition={scrollPosition}
        onScroll={onScroll}
        className="bg-transparent"
      />
    </div>
  );
}

export interface ScrollContainerProps {
  children: React.ReactNode;
  className?: string;
  showVertical?: boolean;
  showHorizontal?: boolean;
  overlayScrollbars?: boolean;
}

export function ScrollContainer({
  children,
  className,
  showVertical = true,
  showHorizontal = false,
  overlayScrollbars = true,
}: ScrollContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({
    scrollTop: 0,
    scrollLeft: 0,
    scrollHeight: 0,
    scrollWidth: 0,
    clientHeight: 0,
    clientWidth: 0,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateScrollState = () => {
      setScrollState({
        scrollTop: container.scrollTop,
        scrollLeft: container.scrollLeft,
        scrollHeight: container.scrollHeight,
        scrollWidth: container.scrollWidth,
        clientHeight: container.clientHeight,
        clientWidth: container.clientWidth,
      });
    };

    updateScrollState();
    container.addEventListener('scroll', updateScrollState);
    
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', updateScrollState);
      resizeObserver.disconnect();
    };
  }, []);

  const handleVerticalScroll = (position: number) => {
    if (containerRef.current) {
      containerRef.current.scrollTop = position;
    }
  };

  const handleHorizontalScroll = (position: number) => {
    if (containerRef.current) {
      containerRef.current.scrollLeft = position;
    }
  };

  const ScrollBarComponent = overlayScrollbars ? OverlayScrollBar : ScrollBar;

  return (
    <div className={clsx('titan-scroll-container relative', className)}>
      <div
        ref={containerRef}
        className="overflow-auto h-full w-full scrollbar-none"
      >
        {children}
      </div>

      {showVertical && (
        <ScrollBarComponent
          orientation="vertical"
          contentSize={scrollState.scrollHeight}
          viewportSize={scrollState.clientHeight}
          scrollPosition={scrollState.scrollTop}
          onScroll={handleVerticalScroll}
        />
      )}

      {showHorizontal && (
        <ScrollBarComponent
          orientation="horizontal"
          contentSize={scrollState.scrollWidth}
          viewportSize={scrollState.clientWidth}
          scrollPosition={scrollState.scrollLeft}
          onScroll={handleHorizontalScroll}
        />
      )}
    </div>
  );
}

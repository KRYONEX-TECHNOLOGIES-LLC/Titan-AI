// Tab Bar Component
// packages/ui/components/editor/src/tab-bar.tsx

import React, { useRef, useEffect, useState } from 'react';
import { clsx } from 'clsx';

export interface Tab {
  id: string;
  title: string;
  path?: string;
  icon?: React.ReactNode;
  isDirty?: boolean;
  isPinned?: boolean;
  isPreview?: boolean;
}

export interface TabBarProps {
  tabs: Tab[];
  activeTabId?: string;
  onTabSelect?: (tabId: string) => void;
  onTabClose?: (tabId: string) => void;
  onTabPin?: (tabId: string) => void;
  onTabReorder?: (fromIndex: number, toIndex: number) => void;
  className?: string;
}

export function TabBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onTabPin,
  onTabReorder,
  className,
}: TabBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      onTabReorder?.(draggedIndex, index);
      setDraggedIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (containerRef.current) {
      containerRef.current.scrollLeft += e.deltaY;
    }
  };

  return (
    <div
      ref={containerRef}
      className={clsx(
        'titan-tab-bar',
        'flex items-center h-9 overflow-x-auto overflow-y-hidden',
        'bg-tab-bar-background border-b border-tab-bar-border',
        'scrollbar-thin scrollbar-thumb-scrollbar scrollbar-track-transparent',
        className
      )}
      onWheel={handleWheel}
    >
      {tabs.map((tab, index) => (
        <TabItem
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          isDragging={draggedIndex === index}
          onSelect={() => onTabSelect?.(tab.id)}
          onClose={() => onTabClose?.(tab.id)}
          onPin={() => onTabPin?.(tab.id)}
          onDragStart={(e) => handleDragStart(e, index)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDragEnd={handleDragEnd}
        />
      ))}
    </div>
  );
}

interface TabItemProps {
  tab: Tab;
  isActive: boolean;
  isDragging: boolean;
  onSelect: () => void;
  onClose: () => void;
  onPin: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function TabItem({
  tab,
  isActive,
  isDragging,
  onSelect,
  onClose,
  onPin,
  onDragStart,
  onDragOver,
  onDragEnd,
}: TabItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  const handleMiddleClick = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      onClose();
    }
  };

  const handleDoubleClick = () => {
    onPin();
  };

  return (
    <div
      className={clsx(
        'titan-tab',
        'group flex items-center gap-2 px-3 h-full min-w-[120px] max-w-[200px]',
        'cursor-pointer select-none',
        'border-r border-tab-border',
        isActive
          ? 'bg-tab-active-background text-tab-active-foreground'
          : 'bg-tab-inactive-background text-tab-inactive-foreground hover:bg-tab-hover-background',
        tab.isPreview && 'italic',
        isDragging && 'opacity-50',
      )}
      draggable
      onClick={onSelect}
      onMouseDown={handleMiddleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      {tab.icon && (
        <span className="titan-tab-icon flex-shrink-0 w-4 h-4">
          {tab.icon}
        </span>
      )}
      
      <span className="titan-tab-title flex-1 truncate text-xs">
        {tab.title}
      </span>

      {tab.isPinned ? (
        <span className="titan-tab-pin flex-shrink-0 w-3 h-3 text-tab-pinned">
          <PinIcon />
        </span>
      ) : (
        <button
          className={clsx(
            'titan-tab-close flex-shrink-0 w-4 h-4 rounded',
            'flex items-center justify-center',
            'hover:bg-tab-close-hover',
            isHovered || isActive ? 'opacity-100' : 'opacity-0'
          )}
          onClick={handleClose}
          aria-label={`Close ${tab.title}`}
        >
          {tab.isDirty ? (
            <span className="w-2 h-2 rounded-full bg-tab-dirty" />
          ) : (
            <CloseIcon />
          )}
        </button>
      )}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M1 1L9 9M9 1L1 9" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707-.195-.195.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z" />
    </svg>
  );
}

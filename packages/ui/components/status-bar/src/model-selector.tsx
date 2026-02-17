// Model Selector Component
// packages/ui/components/status-bar/src/model-selector.tsx

import React, { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  tier: 'frontier' | 'standard' | 'local';
  contextWindow: number;
  costPer1kTokens?: number;
  speed: 'fast' | 'medium' | 'slow';
  capabilities: ('code' | 'chat' | 'vision' | 'function-calling')[];
  isAvailable: boolean;
}

export interface ModelSelectorProps {
  models: ModelInfo[];
  selectedModelId?: string;
  onSelectModel?: (modelId: string) => void;
  className?: string;
}

export function ModelSelector({
  models,
  selectedModelId,
  onSelectModel,
  className,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedModel = models.find(m => m.id === selectedModelId);

  const filteredModels = models.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.provider.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedModels = {
    frontier: filteredModels.filter(m => m.tier === 'frontier'),
    standard: filteredModels.filter(m => m.tier === 'standard'),
    local: filteredModels.filter(m => m.tier === 'local'),
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      inputRef.current?.focus();
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (modelId: string) => {
    onSelectModel?.(modelId);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div
      ref={containerRef}
      className={clsx('titan-model-selector relative', className)}
    >
      {/* Trigger */}
      <button
        className={clsx(
          'flex items-center gap-1.5 px-2 py-0.5 rounded',
          'hover:bg-status-bar-hover transition-colors',
          'text-status-bar-foreground'
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        <ModelIcon />
        <span className="text-xs truncate max-w-[120px]">
          {selectedModel?.name || 'Select Model'}
        </span>
        <ChevronIcon isOpen={isOpen} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className={clsx(
            'absolute bottom-full mb-1 left-0 w-72',
            'bg-model-dropdown-background border border-model-dropdown-border',
            'rounded-lg shadow-lg overflow-hidden z-50'
          )}
        >
          {/* Search */}
          <div className="p-2 border-b border-model-dropdown-border">
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search models..."
              className={clsx(
                'w-full px-2 py-1.5 text-sm rounded',
                'bg-model-search-background text-model-search-foreground',
                'border border-model-search-border',
                'focus:outline-none focus:border-model-search-focus-border',
                'placeholder:text-model-search-placeholder'
              )}
            />
          </div>

          {/* Model list */}
          <div className="max-h-64 overflow-auto">
            {groupedModels.frontier.length > 0 && (
              <ModelGroup
                title="Frontier Models"
                models={groupedModels.frontier}
                selectedModelId={selectedModelId}
                onSelect={handleSelect}
              />
            )}
            {groupedModels.standard.length > 0 && (
              <ModelGroup
                title="Standard Models"
                models={groupedModels.standard}
                selectedModelId={selectedModelId}
                onSelect={handleSelect}
              />
            )}
            {groupedModels.local.length > 0 && (
              <ModelGroup
                title="Local Models"
                models={groupedModels.local}
                selectedModelId={selectedModelId}
                onSelect={handleSelect}
              />
            )}

            {filteredModels.length === 0 && (
              <div className="p-4 text-center text-sm text-model-dropdown-empty">
                No models found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface ModelGroupProps {
  title: string;
  models: ModelInfo[];
  selectedModelId?: string;
  onSelect: (modelId: string) => void;
}

function ModelGroup({ title, models, selectedModelId, onSelect }: ModelGroupProps) {
  return (
    <div className="titan-model-group">
      <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-model-group-title bg-model-group-background">
        {title}
      </div>
      {models.map((model) => (
        <ModelOption
          key={model.id}
          model={model}
          isSelected={model.id === selectedModelId}
          onSelect={() => onSelect(model.id)}
        />
      ))}
    </div>
  );
}

interface ModelOptionProps {
  model: ModelInfo;
  isSelected: boolean;
  onSelect: () => void;
}

function ModelOption({ model, isSelected, onSelect }: ModelOptionProps) {
  const speedColors = {
    fast: 'text-model-speed-fast',
    medium: 'text-model-speed-medium',
    slow: 'text-model-speed-slow',
  };

  const tierBadgeColors = {
    frontier: 'bg-model-tier-frontier',
    standard: 'bg-model-tier-standard',
    local: 'bg-model-tier-local',
  };

  return (
    <button
      className={clsx(
        'w-full flex items-center gap-2 px-3 py-2 text-left',
        'hover:bg-model-option-hover transition-colors',
        isSelected && 'bg-model-option-selected',
        !model.isAvailable && 'opacity-50 cursor-not-allowed'
      )}
      onClick={model.isAvailable ? onSelect : undefined}
      disabled={!model.isAvailable}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{model.name}</span>
          <span className={clsx(
            'px-1 py-0.5 text-[9px] rounded text-white',
            tierBadgeColors[model.tier]
          )}>
            {model.tier}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-model-option-provider">{model.provider}</span>
          <span className="text-[10px] text-model-option-context">
            {formatContextWindow(model.contextWindow)}
          </span>
          {model.costPer1kTokens !== undefined && (
            <span className="text-[10px] text-model-option-cost">
              ${model.costPer1kTokens}/1K
            </span>
          )}
        </div>
      </div>

      {/* Speed indicator */}
      <span className={clsx('text-[10px]', speedColors[model.speed])}>
        {model.speed === 'fast' ? '⚡' : model.speed === 'medium' ? '🔄' : '🐢'}
      </span>

      {/* Selected check */}
      {isSelected && (
        <span className="w-4 h-4 text-model-option-check">
          <CheckIcon />
        </span>
      )}
    </button>
  );
}

function formatContextWindow(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(0)}M ctx`;
  }
  return `${(tokens / 1000).toFixed(0)}K ctx`;
}

// Icons
function ModelIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM2.04 4.326c.325 1.329 2.532 2.54 3.717 3.19.48.263.793.434.743.484-.08.08-.162.158-.242.234-.416.396-.787.749-.758 1.266.035.634.618.824 1.214 1.017.577.188 1.168.38 1.286.983.082.417-.075.988-.22 1.52-.215.782-.406 1.48.22 1.48 1.5-.5 3-1.5 4-2.5.333-1 .5-2 .5-3a7 7 0 1 0-9.46 4.326z" />
    </svg>
  );
}

function ChevronIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      className={clsx('w-3 h-3 transition-transform', isOpen && 'rotate-180')}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M3 5L6 8L9 5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
    </svg>
  );
}

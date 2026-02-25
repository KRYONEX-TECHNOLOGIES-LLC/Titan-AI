'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { ModelInfo } from '@/types/ide';
import { normalizeModelId } from '@/lib/model-registry';

export function useSettings(mounted: boolean) {
  const [fontSize, setFontSize] = useState(13);
  const [tabSize, setTabSize] = useState(2);
  const [wordWrap, setWordWrap] = useState(true);
  const [activeModel, setActiveModelRaw] = useState('claude-sonnet-4.6');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [modelRegistry, setModelRegistry] = useState<ModelInfo[]>([]);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [highlightedModelIndex, setHighlightedModelIndex] = useState(0);
  const modelSearchInputRef = useRef<HTMLInputElement>(null!);


  // Keep fallback model IDs aligned with MODEL_REGISTRY ids.
  // Mismatched IDs cause selector changes to get auto-reset.
  const models = ['protocol-team', 'titan-protocol', 'titan-protocol-v2', 'titan-omega-protocol', 'claude-opus-4.6', 'claude-sonnet-4.6', 'gpt-5.3', 'gpt-4o', 'gemini-2.5-pro'];

  const cappedModelRegistry = useMemo(() => modelRegistry.slice(0, 32), [modelRegistry]);

  const activeModelInfo = useMemo(() => {
    return cappedModelRegistry.find(m => m.id === activeModel || m.name === activeModel) || null;
  }, [cappedModelRegistry, activeModel]);

  const activeModelLabel = activeModelInfo?.name || activeModel;

  const filteredModels = useMemo(
    () =>
      cappedModelRegistry.filter(
        m =>
          modelSearchQuery.trim() === '' ||
          m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
          m.provider.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
          m.id.toLowerCase().includes(modelSearchQuery.toLowerCase())
      ),
    [cappedModelRegistry, modelSearchQuery]
  );

  // Fetch model registry
  useEffect(() => {
    fetch('/api/models')
      .then(res => res.json())
      .then(data => {
        if (data.models) {
          setModelRegistry((data.models as ModelInfo[]).slice(0, 32));
        }
      })
      .catch(console.error);
  }, []);

  // Ensure active model exists in registry
  useEffect(() => {
    if (cappedModelRegistry.length === 0) return;
    const normalized = normalizeModelId(activeModel);
    if (normalized !== activeModel) {
      setActiveModelRaw(normalized);
      return;
    }
    const exists = cappedModelRegistry.some(m => m.id === normalized || m.name === normalized);
    if (!exists) setActiveModelRaw(cappedModelRegistry[0].id);
  }, [activeModel, cappedModelRegistry]);

  // Focus model search when dropdown opens
  useEffect(() => {
    if (!showModelDropdown) return;
    setHighlightedModelIndex(0);
    requestAnimationFrame(() => {
      modelSearchInputRef.current?.focus();
      modelSearchInputRef.current?.select();
    });
  }, [showModelDropdown]);

  // Persist settings
  useEffect(() => {
    if (!mounted) return;
    try {
      const state = { activeModel, fontSize, tabSize, wordWrap };
      localStorage.setItem('titan-settings', JSON.stringify(state));
    } catch { /* ignore */ }
  }, [mounted, activeModel, fontSize, tabSize, wordWrap]);

  // Restore settings
  useEffect(() => {
    if (!mounted) return;
    try {
      const saved = localStorage.getItem('titan-settings');
      if (saved) {
        const state = JSON.parse(saved);
        if (state.activeModel) setActiveModelRaw(normalizeModelId(state.activeModel));
        if (state.fontSize) setFontSize(state.fontSize);
        if (state.tabSize) setTabSize(state.tabSize);
        if (state.wordWrap !== undefined) setWordWrap(state.wordWrap);
      }
    } catch { /* ignore */ }
  }, [mounted]);

  const selectActiveModel = useCallback((modelId: string) => {
    setActiveModelRaw(normalizeModelId(modelId));
    setShowModelDropdown(false);
    setModelSearchQuery('');
    setHighlightedModelIndex(0);
  }, []);

  const setActiveModel = useCallback((modelId: string) => {
    setActiveModelRaw(normalizeModelId(modelId));
  }, []);

  const handleModelSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedModelIndex(prev => Math.min(prev + 1, Math.max(filteredModels.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedModelIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredModels[highlightedModelIndex];
      if (target) selectActiveModel(target.id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowModelDropdown(false);
    }
  }, [filteredModels, highlightedModelIndex, selectActiveModel]);

  return {
    fontSize, setFontSize,
    tabSize, setTabSize,
    wordWrap, setWordWrap,
    activeModel, setActiveModel,
    showModelDropdown, setShowModelDropdown,
    modelRegistry, cappedModelRegistry,
    modelSearchQuery, setModelSearchQuery,
    highlightedModelIndex, setHighlightedModelIndex,
    modelSearchInputRef,
    models,
    activeModelInfo, activeModelLabel,
    filteredModels,
    selectActiveModel,
    handleModelSearchKeyDown,
  };
}

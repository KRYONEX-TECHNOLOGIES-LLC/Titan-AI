'use client';

import { useRef } from 'react';
import dynamic from 'next/dynamic';
import type { ModelInfo, FileTab } from '@/types/ide';

const IDEUserMenu = dynamic(() => import('@/components/ide/UserMenu'), { ssr: false });

interface TitleBarProps {
  activeView: string;
  setActiveView: (view: string) => void;
  tabs: FileTab[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onTabClose: (name: string, e: React.MouseEvent) => void;
  showPlusDropdown: boolean;
  setShowPlusDropdown: (v: boolean) => void;
  showModelDropdown: boolean;
  setShowModelDropdown: (v: boolean) => void;
  activeModel: string;
  activeModelLabel: string;
  cappedModelRegistry: ModelInfo[];
  filteredModels: ModelInfo[];
  modelSearchQuery: string;
  setModelSearchQuery: (v: string) => void;
  highlightedModelIndex: number;
  setHighlightedModelIndex: (v: number) => void;
  modelSearchInputRef: React.RefObject<HTMLInputElement>;
  onSelectModel: (id: string) => void;
  onModelSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onNewFile: () => void;
  onNewTerminal: () => void;
  onNewAgent: () => void;
  mounted: boolean;
}

export default function TitleBar(props: TitleBarProps) {
  const {
    activeView, setActiveView, tabs, activeTab, setActiveTab, onTabClose,
    showPlusDropdown, setShowPlusDropdown, showModelDropdown, setShowModelDropdown,
    activeModel, activeModelLabel, cappedModelRegistry, filteredModels,
    modelSearchQuery, setModelSearchQuery, highlightedModelIndex, setHighlightedModelIndex,
    modelSearchInputRef, onSelectModel, onModelSearchKeyDown,
    onNewFile, onNewTerminal, onNewAgent, mounted,
  } = props;

  return (
    <div className="h-[35px] bg-[#2b2b2b] flex items-center text-[13px] border-b border-[#3c3c3c] shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); setActiveView(activeView ? '' : 'titan-agent'); }}
        className="w-[46px] h-full flex items-center justify-center text-[#999] hover:text-white hover:bg-[#3c3c3c] transition-colors"
        title="Toggle Sidebar (Ctrl+B)"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1 3h14v1.5H1V3zm0 4.25h14v1.5H1v-1.5zm0 4.25h14V13H1v-1.5z"/>
        </svg>
      </button>

      <span className="text-[#e0e0e0] font-semibold text-[13px] mr-2 tracking-wide">Titan AI</span>

      <div className="flex-1 flex items-center h-full ml-2 overflow-hidden">
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowPlusDropdown(!showPlusDropdown); }}
            className="w-[28px] h-[28px] flex items-center justify-center text-[#808080] hover:text-white hover:bg-[#3c3c3c] rounded-[3px] mx-0.5 shrink-0 transition-colors"
            title="New..."
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1v6H2v1.5h6V15h1.5V8.5H16V7H9.5V1z"/></svg>
          </button>
          {showPlusDropdown && (
            <div className="absolute top-full left-0 mt-1 w-[200px] bg-[#2d2d2d] border border-[#3c3c3c] rounded-md shadow-lg py-1 z-50">
              <DropdownItem icon="📄" label="New File" shortcut="Ctrl+N" onClick={() => { onNewFile(); setShowPlusDropdown(false); }} />
              <DropdownItem icon="⬛" label="New Terminal" shortcut="Ctrl+`" onClick={() => { onNewTerminal(); setShowPlusDropdown(false); }} />
              <DropdownItem icon="✨" label="New Agent Session" onClick={() => { onNewAgent(); setShowPlusDropdown(false); }} />
            </div>
          )}
        </div>

        {tabs.map(tab => (
          <button
            key={tab.name}
            onClick={() => setActiveTab(tab.name)}
            className={`group h-[28px] flex items-center gap-1.5 px-3 text-[12px] rounded-[3px] mx-0.5 shrink-0 transition-colors ${
              activeTab === tab.name ? 'bg-[#1e1e1e] text-white' : 'text-[#808080] hover:text-[#cccccc] hover:bg-[#3c3c3c]'
            }`}
          >
            <span className="text-[10px] font-bold" style={{ color: tab.color }}>{tab.icon}</span>
            {tab.name}
            {tab.modified && <span className="text-[#007acc] ml-0.5">●</span>}
            <span
              onClick={(e) => onTabClose(tab.name, e)}
              className="ml-1 w-[16px] h-[16px] flex items-center justify-center text-[14px] text-[#808080] hover:text-white hover:bg-[#525252] rounded-[3px] opacity-0 group-hover:opacity-100"
            >×</span>
          </button>
        ))}
      </div>

      {/* Model Pill */}
      <div className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setShowModelDropdown(!showModelDropdown); }}
          style={activeModel === 'titan-protocol' ? {
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
            background: 'linear-gradient(90deg, #7c3aed 0%, #5b21b6 100%)',
            borderRadius: 9999, fontSize: 12, color: '#fff', fontWeight: 600,
            marginRight: 8, cursor: 'pointer', border: 'none', transition: 'opacity 0.15s',
          } : {
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
            background: '#2d2d2d', borderRadius: 9999, fontSize: 12, color: '#cccccc',
            marginRight: 8, cursor: 'pointer', border: 'none', transition: 'background 0.15s',
          }}
          onMouseEnter={e => { if (activeModel !== 'titan-protocol') (e.currentTarget as HTMLButtonElement).style.background = '#3c3c3c'; }}
          onMouseLeave={e => { if (activeModel !== 'titan-protocol') (e.currentTarget as HTMLButtonElement).style.background = '#2d2d2d'; }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: activeModel === 'titan-protocol' ? '#c084fc' : '#3fb950' }}></span>
          {activeModelLabel}
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M4 6l4 4 4-4z"/></svg>
        </button>
        {showModelDropdown && (
          <div className="absolute top-full right-0 mt-1 w-[320px] bg-[#2d2d2d] border border-[#3c3c3c] rounded-lg shadow-xl z-50 overflow-hidden">
            <div className="p-2 border-b border-[#3c3c3c]">
              <input
                ref={modelSearchInputRef}
                type="text"
                placeholder="Search models..."
                value={modelSearchQuery}
                onChange={(e) => { setModelSearchQuery(e.target.value); setHighlightedModelIndex(0); }}
                onKeyDown={onModelSearchKeyDown}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 text-[12px] text-[#cccccc] placeholder-[#666] focus:outline-none focus:border-[#007acc]"
              />
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {cappedModelRegistry.length > 0 ? (
                <>
                  {/* Titan Protocol — always at top */}
                  {(() => {
                    const titanModel = filteredModels.find(m => m.id === 'titan-protocol');
                    if (!titanModel) return null;
                    return (
                      <div>
                        <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, color: '#c084fc', background: 'linear-gradient(90deg, #1a1025 0%, #252525 100%)' }}>
                          Titan Protocol
                        </div>
                        <button
                          onClick={() => onSelectModel(titanModel.id)}
                          style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #3c3c3c', cursor: 'pointer', transition: 'background 0.15s', background: activeModel === titanModel.id ? 'linear-gradient(90deg, #2d1b4e 0%, #37373d 100%)' : 'transparent' }}
                          onMouseEnter={e => { if (activeModel !== titanModel.id) (e.currentTarget as HTMLButtonElement).style.background = '#2d1b4e40'; }}
                          onMouseLeave={e => { if (activeModel !== titanModel.id) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: activeModel === titanModel.id ? '#c084fc' : '#e0e0e0' }}>Titan Protocol</span>
                            <span style={{ fontSize: 10, color: '#c084fc', fontWeight: 600 }}>Titan AI</span>
                          </div>
                          <div style={{ fontSize: 10, color: '#8b5cf6', marginTop: 3 }}>Multi-agent governance with mandatory verification</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            <span style={{ fontSize: 9, color: '#7c3aed', background: '#7c3aed20', padding: '1px 5px', borderRadius: 3 }}>Self-Review</span>
                            <span style={{ fontSize: 9, color: '#7c3aed', background: '#7c3aed20', padding: '1px 5px', borderRadius: 3 }}>Fail-Gate</span>
                            <span style={{ fontSize: 9, color: '#7c3aed', background: '#7c3aed20', padding: '1px 5px', borderRadius: 3 }}>Quality Enforced</span>
                          </div>
                        </button>
                      </div>
                    );
                  })()}

                  {['frontier', 'standard', 'economy', 'local'].map(tier => {
                    const tierModels = filteredModels.filter(m => m.tier === tier && m.id !== 'titan-protocol');
                    if (tierModels.length === 0) return null;
                    return (
                      <div key={tier}>
                        <div className="px-3 py-1.5 text-[10px] font-semibold uppercase text-[#808080] bg-[#252525]">
                          {tier === 'frontier' ? 'Frontier' : tier === 'standard' ? 'Standard' : tier === 'economy' ? 'Economy' : 'Local'}
                        </div>
                        {tierModels.map(model => (
                          <button
                            key={model.id}
                            onClick={() => onSelectModel(model.id)}
                            className={`w-full text-left px-3 py-2 hover:bg-[#3c3c3c] transition-colors border-b border-[#333] ${activeModel === model.id ? 'bg-[#37373d]' : ''} ${filteredModels[highlightedModelIndex]?.id === model.id ? 'ring-1 ring-inset ring-[#007acc]' : ''}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className={`text-[12px] ${activeModel === model.id ? 'text-[#007acc]' : 'text-[#cccccc]'}`}>{model.name}</span>
                              <span className="text-[10px] text-[#666]">{model.provider}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[9px] text-[#555]">{(model.contextWindow / 1000).toFixed(0)}K ctx</span>
                              {model.supportsThinking && <span className="text-[9px] text-purple-400">*</span>}
                              {model.supportsVision && <span className="text-[9px] text-blue-400">*</span>}
                              {model.costPer1MInput === 0 ? (
                                <span className="text-[9px] text-green-400">Free</span>
                              ) : (
                                <span className="text-[9px] text-[#555]">${model.costPer1MInput}/1M</span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="p-4 text-center text-[#666] text-[12px]">Loading models...</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center pr-2">
        {mounted && <IDEUserMenu />}
      </div>
    </div>
  );
}

function DropdownItem({ icon, label, shortcut, onClick }: { icon: string; label: string; shortcut?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[#cccccc] hover:bg-[#3c3c3c] transition-colors">
      <span>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {shortcut && <span className="text-[#808080] text-[11px]">{shortcut}</span>}
    </button>
  );
}

'use client';

import { useRef, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { ModelInfo, FileTab } from '@/types/ide';
import { useGitHubAuth } from '@/providers/github-auth-provider';

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
          style={activeModel === 'titan-phoenix-protocol' ? {
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
            background: 'linear-gradient(90deg, #b45309 0%, #d97706 50%, #f59e0b 100%)',
            borderRadius: 9999, fontSize: 12, color: '#fff', fontWeight: 600,
            marginRight: 8, cursor: 'pointer', border: 'none', transition: 'opacity 0.15s',
          } : activeModel === 'titan-protocol' ? {
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
            background: 'linear-gradient(90deg, #7c3aed 0%, #5b21b6 100%)',
            borderRadius: 9999, fontSize: 12, color: '#fff', fontWeight: 600,
            marginRight: 8, cursor: 'pointer', border: 'none', transition: 'opacity 0.15s',
          } : {
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
            background: '#2d2d2d', borderRadius: 9999, fontSize: 12, color: '#cccccc',
            marginRight: 8, cursor: 'pointer', border: 'none', transition: 'background 0.15s',
          }}
          onMouseEnter={e => { if (activeModel !== 'titan-protocol' && activeModel !== 'titan-phoenix-protocol') (e.currentTarget as HTMLButtonElement).style.background = '#3c3c3c'; }}
          onMouseLeave={e => { if (activeModel !== 'titan-protocol' && activeModel !== 'titan-phoenix-protocol') (e.currentTarget as HTMLButtonElement).style.background = '#2d2d2d'; }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: activeModel === 'titan-phoenix-protocol' ? '#fbbf24' : activeModel === 'titan-protocol' ? '#c084fc' : '#3fb950' }}></span>
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
                  {/* Phoenix Protocol — pinnacle, always first */}
                  {(() => {
                    const phoenixModel = filteredModels.find(m => m.id === 'titan-phoenix-protocol');
                    if (!phoenixModel) return null;
                    return (
                      <div>
                        <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, color: '#f59e0b', background: 'linear-gradient(90deg, #1a1508 0%, #252015 100%)' }}>
                          Phoenix Protocol
                        </div>
                        <button
                          onClick={() => onSelectModel(phoenixModel.id)}
                          style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #3c3c3c', cursor: 'pointer', transition: 'background 0.15s', background: activeModel === phoenixModel.id ? 'linear-gradient(90deg, #422006 0%, #37373d 100%)' : 'transparent' }}
                          onMouseEnter={e => { if (activeModel !== phoenixModel.id) (e.currentTarget as HTMLButtonElement).style.background = '#42200640'; }}
                          onMouseLeave={e => { if (activeModel !== phoenixModel.id) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: activeModel === phoenixModel.id ? '#f59e0b' : '#e0e0e0' }}>Phoenix Protocol</span>
                            <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>Titan AI</span>
                          </div>
                          <div style={{ fontSize: 10, color: '#d97706', marginTop: 3 }}>5-role orchestration: 80.2% SWE-Bench coder + GPT-5 class reasoner — 40x cheaper than Opus</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 9, color: '#f59e0b', background: '#f59e0b18', padding: '1px 5px', borderRadius: 3 }}>5 Models</span>
                            <span style={{ fontSize: 9, color: '#f59e0b', background: '#f59e0b18', padding: '1px 5px', borderRadius: 3 }}>Self-Healing</span>
                            <span style={{ fontSize: 9, color: '#f59e0b', background: '#f59e0b18', padding: '1px 5px', borderRadius: 3 }}>3-Strike</span>
                            <span style={{ fontSize: 9, color: '#f59e0b', background: '#f59e0b18', padding: '1px 5px', borderRadius: 3 }}>Consensus</span>
                          </div>
                        </button>
                      </div>
                    );
                  })()}

                  {/* Titan Protocol — always at top after Phoenix */}
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
                    const tierModels = filteredModels.filter(m => m.tier === tier && m.id !== 'titan-protocol' && m.id !== 'titan-phoenix-protocol');
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

      <div className="flex items-center gap-1.5 pr-2">
        {mounted && <GitHubConnectButton />}
        {mounted && <IDEUserMenu />}
      </div>
    </div>
  );
}

function GitHubConnectButton() {
  const { user, isConnected, isLoading, signIn, signOut, error, clearError } = useGitHubAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  useEffect(() => {
    if (error) {
      const t = setTimeout(clearError, 8000);
      return () => clearTimeout(t);
    }
  }, [error, clearError]);

  if (isLoading) {
    return <div className="w-6 h-6 rounded-full bg-[#3c3c3c] animate-pulse" />;
  }

  if (error) {
    return (
      <div ref={ref} className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setDropdownOpen(!dropdownOpen); }}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-[#3a1a1a] text-[#f85149] rounded-full text-[12px] font-medium border border-[#f85149]/30"
          title="GitHub connection error"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          Error
        </button>
        {dropdownOpen && (
          <div className="absolute top-full right-0 mt-1.5 w-[300px] bg-[#1e1e1e] border border-[#f85149]/30 rounded-lg shadow-2xl z-[9999] p-3">
            <p className="text-[12px] text-[#f85149] mb-2">{error}</p>
            <div className="flex gap-2">
              <button onClick={() => { clearError(); signIn(); setDropdownOpen(false); }} className="flex-1 px-3 py-1.5 text-[11px] bg-[#24292f] hover:bg-[#32383f] text-white rounded-md transition-colors">Retry</button>
              <button onClick={() => { clearError(); setDropdownOpen(false); }} className="px-3 py-1.5 text-[11px] text-[#666] hover:text-white rounded-md transition-colors">Dismiss</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Not connected
  if (!isConnected) {
    return (
      <button
        onClick={signIn}
        className="flex items-center gap-1.5 px-2.5 py-1 bg-[#24292f] hover:bg-[#32383f] text-[#e0e0e0] rounded-full text-[12px] font-medium transition-colors border border-[#3c3c3c]"
        title="Connect GitHub for git push, pull, clone"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
        </svg>
        Connect GitHub
      </button>
    );
  }

  // Connected -- show avatar + dropdown
  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setDropdownOpen(!dropdownOpen); }}
        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-full hover:bg-[#3c3c3c] transition-colors border border-transparent hover:border-[#3c3c3c]"
        title={`GitHub: @${user?.login}`}
      >
        {user?.avatar_url ? (
          <img src={user.avatar_url} alt={user.login} className="w-6 h-6 rounded-full ring-2 ring-[#3fb950]/40" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-[#24292f] flex items-center justify-center text-white text-[10px] font-bold ring-2 ring-[#3fb950]/40">
            {user?.login?.[0]?.toUpperCase() || 'G'}
          </div>
        )}
      </button>

      {dropdownOpen && (
        <div className="absolute top-full right-0 mt-1.5 w-[240px] bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg shadow-2xl z-[9999] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#3c3c3c]">
            <div className="flex items-center gap-3">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user.login} className="w-10 h-10 rounded-full ring-2 ring-[#3fb950]/30" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#24292f] flex items-center justify-center text-white text-sm font-bold">
                  {user?.login?.[0]?.toUpperCase() || 'G'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-white truncate">{user?.name || user?.login}</div>
                <div className="text-[11px] text-[#3fb950] truncate">@{user?.login}</div>
              </div>
              <div className="w-2 h-2 rounded-full bg-[#3fb950]" title="Connected" />
            </div>
          </div>

          <div className="py-1">
            <a
              href={`https://github.com/${user?.login}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setDropdownOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-[12px] text-[#cccccc] hover:bg-[#2a2a2a] transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M3 3h8v2H5.5l7.5 7.5-1.5 1.5L4 6.5V9H2V3z"/></svg>
              View Profile
            </a>
            <div className="h-px bg-[#2a2a2a] my-0.5" />
            <button
              onClick={() => { setDropdownOpen(false); signOut(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-[12px] text-[#f85149] hover:bg-[#2a2a2a] transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              Disconnect GitHub
            </button>
          </div>
        </div>
      )}
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

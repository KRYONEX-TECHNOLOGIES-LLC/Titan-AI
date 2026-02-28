'use client';

import { useState, useEffect, useCallback } from 'react';
import { nexusRegistry, type NexusAddon, type AddonStatus } from '@/lib/nexus/nexus-registry';

type Category = 'All' | 'Automation' | 'Research' | 'Trading' | 'Communication' | 'DevOps' | 'Custom';
type Tab = 'available' | 'installed';

const CATEGORIES: Category[] = ['All', 'Automation', 'Research', 'Trading', 'Communication', 'DevOps', 'Custom'];

interface BuiltInAddon {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: Category;
  author: string;
}

const BUILT_IN_ADDONS: BuiltInAddon[] = [
  { id: 'nexus-trading-bot', name: 'Trading Bot', description: 'AI-powered trading with risk management for crypto & stocks', icon: '📈', category: 'Trading', author: 'Kryonex Technologies' },
  { id: 'nexus-home-assistant', name: 'Home Assistant', description: 'Control smart home devices — lights, thermostats, locks, cameras', icon: '🏠', category: 'Automation', author: 'Kryonex Technologies' },
  { id: 'nexus-food-delivery', name: 'Food Delivery', description: 'Order food & groceries from popular delivery services', icon: '🍕', category: 'Automation', author: 'Kryonex Technologies' },
  { id: 'nexus-travel', name: 'Travel Booking', description: 'Search and book flights, hotels, and event tickets', icon: '✈️', category: 'Research', author: 'Kryonex Technologies' },
  { id: 'nexus-code-review', name: 'Code Review', description: 'Automated PR review with style checks and vulnerability scanning', icon: '🔍', category: 'DevOps', author: 'Kryonex Technologies' },
  { id: 'nexus-seo-analyzer', name: 'SEO Analyzer', description: 'Analyze pages for SEO, meta tags, performance, and accessibility', icon: '📊', category: 'Research', author: 'Kryonex Technologies' },
  { id: 'nexus-social-media', name: 'Social Media Manager', description: 'Schedule posts, track analytics, and manage multiple platforms', icon: '📱', category: 'Communication', author: 'Kryonex Technologies' },
  { id: 'nexus-data-scraper', name: 'Data Scraper', description: 'Extract structured data from websites with smart selectors', icon: '🕷️', category: 'Custom', author: 'Kryonex Technologies' },
];

function seedBuiltIns() {
  for (const addon of BUILT_IN_ADDONS) {
    if (!nexusRegistry.get(addon.id)) {
      nexusRegistry.register({
        id: addon.id,
        name: addon.name,
        description: addon.description,
        author: addon.author,
        version: '1.0.0',
        pricing: 'free',
        category: addon.category.toLowerCase(),
        icon: addon.icon,
        permissions: [],
        skillInstructions: '',
        tools: [],
        status: 'available',
      });
    }
  }
}

function categoryOf(addon: NexusAddon): Category {
  const map: Record<string, Category> = {
    trading: 'Trading', finance: 'Trading',
    automation: 'Automation', home: 'Automation', lifestyle: 'Automation',
    research: 'Research', travel: 'Research',
    communication: 'Communication',
    devops: 'DevOps',
    custom: 'Custom',
  };
  return map[addon.category.toLowerCase()] ?? 'Custom';
}

const CATEGORY_COLORS: Record<Category, string> = {
  All: 'bg-slate-700 text-slate-200',
  Automation: 'bg-emerald-900/60 text-emerald-300',
  Research: 'bg-blue-900/60 text-blue-300',
  Trading: 'bg-amber-900/60 text-amber-300',
  Communication: 'bg-violet-900/60 text-violet-300',
  DevOps: 'bg-orange-900/60 text-orange-300',
  Custom: 'bg-pink-900/60 text-pink-300',
};

export default function NexusStore() {
  const [tab, setTab] = useState<Tab>('available');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category>('All');
  const [addons, setAddons] = useState<NexusAddon[]>([]);

  const refresh = useCallback(() => {
    setAddons([...nexusRegistry.getAll()]);
  }, []);

  useEffect(() => {
    seedBuiltIns();
    refresh();
  }, [refresh]);

  const filtered = addons.filter((a) => {
    if (tab === 'installed' && a.status === 'available') return false;
    if (tab === 'available' && a.status !== 'available') return false;
    if (category !== 'All' && categoryOf(a) !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      return a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q);
    }
    return true;
  });

  const handleInstall = (id: string) => {
    nexusRegistry.install(id);
    nexusRegistry.enable(id);
    refresh();
  };

  const handleUninstall = (id: string) => {
    nexusRegistry.uninstall(id);
    seedBuiltIns();
    refresh();
  };

  const handleToggle = (id: string, current: AddonStatus) => {
    if (current === 'enabled') nexusRegistry.disable(id);
    else nexusRegistry.enable(id);
    refresh();
  };

  const iconForAddon = (addon: NexusAddon): string => {
    if (addon.icon) return addon.icon;
    const match = BUILT_IN_ADDONS.find((b) => b.id === addon.id);
    return match?.icon ?? '🧩';
  };

  return (
    <div className="h-full flex flex-col bg-[#0d0d0d] text-slate-100">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-[#2a2a2a] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧩</span>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-cyan-300">Nexus Store</h2>
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search add-ons..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[#2a2a2a] bg-[#141414] pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-cyan-600 focus:outline-none transition-colors"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg bg-[#141414] p-0.5 border border-[#2a2a2a]">
          {(['available', 'installed'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-md py-1 text-[11px] font-medium capitalize transition-all ${
                tab === t
                  ? 'bg-cyan-600/20 text-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.15)]'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t}
              <span className="ml-1 text-[10px] opacity-60">
                ({t === 'available'
                  ? addons.filter((a) => a.status === 'available').length
                  : addons.filter((a) => a.status !== 'available').length})
              </span>
            </button>
          ))}
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-all ${
                category === c
                  ? 'bg-cyan-600/30 text-cyan-300 ring-1 ring-cyan-500/40'
                  : 'bg-[#1a1a1a] text-slate-500 hover:text-slate-300 hover:bg-[#222]'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-600 text-xs">
            <span className="text-2xl mb-2">🔍</span>
            No add-ons found
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {filtered.map((addon) => {
              const isInstalled = addon.status !== 'available';
              const isEnabled = addon.status === 'enabled';
              const cat = categoryOf(addon);

              return (
                <div
                  key={addon.id}
                  className="group rounded-xl border border-[#2a2a2a] bg-[#111111] p-3 hover:border-cyan-700/40 hover:bg-[#131318] transition-all"
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className="w-10 h-10 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center text-xl flex-shrink-0">
                      {iconForAddon(addon)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white truncate">{addon.name}</span>
                        <span className={`rounded-full px-1.5 py-px text-[9px] font-medium ${CATEGORY_COLORS[cat]}`}>
                          {cat}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-2 leading-relaxed">{addon.description}</p>
                      <div className="mt-1 text-[10px] text-slate-600">{addon.author} · v{addon.version}</div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      {isInstalled ? (
                        <>
                          {/* Toggle */}
                          <button
                            onClick={() => handleToggle(addon.id, addon.status)}
                            className={`relative w-8 h-4 rounded-full transition-colors ${
                              isEnabled ? 'bg-cyan-600' : 'bg-[#2a2a2a]'
                            }`}
                            title={isEnabled ? 'Disable' : 'Enable'}
                          >
                            <span
                              className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
                                isEnabled ? 'left-[18px]' : 'left-0.5'
                              }`}
                            />
                          </button>
                          <button
                            onClick={() => handleUninstall(addon.id)}
                            className="text-[10px] text-red-400/70 hover:text-red-400 transition-colors"
                          >
                            Uninstall
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleInstall(addon.id)}
                          className="rounded-md bg-cyan-600/20 px-2.5 py-1 text-[10px] font-medium text-cyan-300 ring-1 ring-cyan-500/30 hover:bg-cyan-600/30 hover:ring-cyan-400/50 transition-all"
                        >
                          Install
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CodeDirectoryData, CodeEntry } from '@/lib/plan/code-scanner';

interface CodeDirectoryState {
  directory: CodeDirectoryData;
  isScanning: boolean;
  lastError: string | null;

  setDirectory: (data: CodeDirectoryData) => void;
  setScanning: (v: boolean) => void;
  setError: (err: string | null) => void;

  addEntry: (section: keyof Omit<CodeDirectoryData, 'scannedAt'>, entry: CodeEntry) => void;
  removeEntry: (section: keyof Omit<CodeDirectoryData, 'scannedAt'>, path: string) => void;
  updateEntry: (section: keyof Omit<CodeDirectoryData, 'scannedAt'>, path: string, updates: Partial<CodeEntry>) => void;

  serialize: (maxChars?: number) => string;
  clear: () => void;
}

const EMPTY_DIR: CodeDirectoryData = {
  routes: [], apiEndpoints: [], components: [], stores: [],
  hooks: [], types: [], configs: [], styles: [], scannedAt: 0,
};

export const useCodeDirectory = create<CodeDirectoryState>()(
  persist(
    (set, get) => ({
      directory: { ...EMPTY_DIR },
      isScanning: false,
      lastError: null,

      setDirectory: (data) => set({ directory: data, lastError: null }),
      setScanning: (v) => set({ isScanning: v }),
      setError: (err) => set({ lastError: err }),

      addEntry: (section, entry) => {
        set(state => {
          const dir = { ...state.directory };
          const list = [...(dir[section] as CodeEntry[])];
          const existing = list.findIndex(e => e.path === entry.path);
          if (existing >= 0) {
            list[existing] = { ...list[existing], ...entry };
          } else {
            list.push(entry);
          }
          (dir[section] as CodeEntry[]) = list;
          dir.scannedAt = Date.now();
          return { directory: dir };
        });
      },

      removeEntry: (section, path) => {
        set(state => {
          const dir = { ...state.directory };
          (dir[section] as CodeEntry[]) = (dir[section] as CodeEntry[]).filter(e => e.path !== path);
          return { directory: dir };
        });
      },

      updateEntry: (section, path, updates) => {
        set(state => {
          const dir = { ...state.directory };
          (dir[section] as CodeEntry[]) = (dir[section] as CodeEntry[]).map(e =>
            e.path === path ? { ...e, ...updates } : e,
          );
          return { directory: dir };
        });
      },

      serialize: (maxChars = 4000) => {
        const dir = get().directory;
        if (!dir || dir.scannedAt === 0) return '';
        const sections: string[] = ['=== PROJECT DIRECTORY (auto-indexed) ==='];

        const addSection = (label: string, items: CodeEntry[]) => {
          if (items.length === 0) return;
          sections.push(`\n[${label}]`);
          items.forEach(item => {
            const desc = item.description ? ` — ${item.description}` : '';
            sections.push(`  ${item.path}: ${item.name}${desc}`);
          });
        };

        addSection('ROUTES/PAGES', dir.routes);
        addSection('API ENDPOINTS', dir.apiEndpoints);
        addSection('COMPONENTS', dir.components);
        addSection('STORES', dir.stores);
        addSection('HOOKS', dir.hooks);
        addSection('TYPES', dir.types);
        addSection('CONFIGS', dir.configs);

        sections.push('\n=== END DIRECTORY ===');
        let result = sections.join('\n');
        if (result.length > maxChars) result = result.slice(0, maxChars) + '\n...(truncated)';
        return result;
      },

      clear: () => set({ directory: { ...EMPTY_DIR }, lastError: null }),
    }),
    {
      name: 'titan-code-directory',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ directory: state.directory }),
    },
  ),
);

'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  CartographyGraph,
  CartographyResult,
  LLMAnalysis,
  GraphNode,
  CartographyQueryResult,
} from '@/lib/cartography/types';

interface CartographyState {
  graph: CartographyGraph | null;
  analysis: LLMAnalysis | null;
  lastScanAt: number;
  isScanning: boolean;
  scanError: string | null;
  isQuerying: boolean;

  scan: (workspacePath?: string, fileTree?: string, forceRefresh?: boolean) => Promise<void>;
  query: (question: string) => Promise<CartographyQueryResult | null>;
  getContextForProtocol: (maxChars?: number) => string;
  getHotspotsAbove: (threshold: number) => GraphNode[];
  clear: () => void;
}

const EMPTY: Pick<CartographyState, 'graph' | 'analysis' | 'lastScanAt' | 'isScanning' | 'scanError' | 'isQuerying'> = {
  graph: null,
  analysis: null,
  lastScanAt: 0,
  isScanning: false,
  scanError: null,
  isQuerying: false,
};

export const useCartographyStore = create<CartographyState>()(
  persist(
    (set, get) => ({
      ...EMPTY,

      scan: async (workspacePath?: string, fileTree?: string, forceRefresh?: boolean) => {
        if (get().isScanning) return;
        set({ isScanning: true, scanError: null });

        try {
          const res = await fetch('/api/cartography/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspacePath, fileTree, forceRefresh }),
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Scan failed' }));
            throw new Error(err.error || `Scan failed (${res.status})`);
          }

          const result: CartographyResult = await res.json();
          set({
            graph: result.graph,
            analysis: result.analysis,
            lastScanAt: result.scannedAt,
            isScanning: false,
          });
        } catch (err) {
          set({ isScanning: false, scanError: (err as Error).message });
        }
      },

      query: async (question: string) => {
        const { graph, analysis } = get();
        if (!graph || !analysis) return null;

        set({ isQuerying: true });
        try {
          const res = await fetch('/api/cartography/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, graph, analysis }),
          });

          if (!res.ok) return null;
          const data: CartographyQueryResult = await res.json();
          return data;
        } catch {
          return null;
        } finally {
          set({ isQuerying: false });
        }
      },

      getContextForProtocol: (maxChars = 3000) => {
        const { graph, analysis } = get();
        if (!graph || !analysis) return '';

        const lines: string[] = [
          '=== CODEBASE INTELLIGENCE (auto-analyzed) ===',
          `Health Score: ${analysis.healthScore}/100`,
          `Architecture: ${analysis.architectureSummary.slice(0, 200)}`,
        ];

        const critical = graph.nodes.filter(n => n.hotspotCategory === 'critical').slice(0, 5);
        if (critical.length > 0) {
          lines.push(`Hotspots: ${critical.map(n => `${n.name} (fan-in:${n.fanIn})`).join(', ')}`);
        }

        if (graph.cycles.length > 0) {
          lines.push(`Cycles: ${graph.cycles.slice(0, 3).map(c => c.files.join(' <-> ')).join('; ')}`);
        }

        const topClusters = graph.clusters.slice(0, 5);
        if (topClusters.length > 0) {
          lines.push(`Key clusters: ${topClusters.map(c => `${c.directory} (${c.files.length} files)`).join(', ')}`);
        }

        if (analysis.risks.length > 0) {
          lines.push(`Risks: ${analysis.risks.slice(0, 3).join('; ')}`);
        }

        lines.push('=== END INTELLIGENCE ===');

        let result = lines.join('\n');
        if (result.length > maxChars) result = result.slice(0, maxChars) + '\n...(truncated)';
        return result;
      },

      getHotspotsAbove: (threshold: number) => {
        const { graph } = get();
        if (!graph) return [];
        return graph.nodes.filter(n => n.hotspotScore >= threshold);
      },

      clear: () => set({ ...EMPTY }),
    }),
    {
      name: 'titan-cartography',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        graph: state.graph,
        analysis: state.analysis,
        lastScanAt: state.lastScanAt,
      }),
    },
  ),
);

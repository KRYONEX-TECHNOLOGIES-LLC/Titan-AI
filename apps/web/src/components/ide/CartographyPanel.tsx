'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
  MarkerType,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useCartographyStore } from '@/stores/cartography-store';
import { useFileStore } from '@/stores/file-store';
import { feedCartographyToBrain } from '@/lib/cartography/brain-feed';
import {
  HudButton,
  HudCard,
  HudHeader,
  HudGauge,
  AnimatedCounter,
  PulsingDot,
} from '@/components/hud/HudStyles';
import type { GraphNode, GraphEdge, FileKind, CartographyQueryResult } from '@/lib/cartography/types';

const KIND_COLORS: Record<FileKind, string> = {
  component: '#3b82f6',
  hook: '#8b5cf6',
  store: '#10b981',
  'api-route': '#f59e0b',
  util: '#6b7280',
  type: '#64748b',
  config: '#475569',
  style: '#ec4899',
  test: '#06b6d4',
  unknown: '#4b5563',
};

const KIND_BG: Record<FileKind, string> = {
  component: '#1e3a5f',
  hook: '#2d1f5e',
  store: '#0d3d2e',
  'api-route': '#3d2f0d',
  util: '#1f2937',
  type: '#1e293b',
  config: '#1a202c',
  style: '#3d0d2e',
  test: '#0d3d3d',
  unknown: '#1f2937',
};

function buildFlowNodes(graphNodes: GraphNode[], filter: string, kindFilter: FileKind | 'all'): Node[] {
  const filtered = graphNodes.filter(n => {
    if (filter && !n.path.toLowerCase().includes(filter.toLowerCase())) return false;
    if (kindFilter !== 'all' && n.kind !== kindFilter) return false;
    return true;
  });

  const clusterMap = new Map<string, GraphNode[]>();
  for (const n of filtered) {
    if (!clusterMap.has(n.cluster)) clusterMap.set(n.cluster, []);
    clusterMap.get(n.cluster)!.push(n);
  }

  const nodes: Node[] = [];
  let clusterY = 0;

  for (const [cluster, clusterNodes] of clusterMap) {
    const cols = Math.ceil(Math.sqrt(clusterNodes.length));
    clusterNodes.forEach((gn, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * 220 + 50;
      const y = clusterY + row * 100 + 50;

      const borderColor = gn.hotspotCategory === 'critical'
        ? '#ef4444'
        : gn.hotspotCategory === 'important'
          ? '#f59e0b'
          : KIND_COLORS[gn.kind];

      nodes.push({
        id: gn.id,
        position: { x, y },
        data: {
          label: gn.name,
          ...gn,
        },
        style: {
          background: KIND_BG[gn.kind],
          border: `2px solid ${borderColor}`,
          borderRadius: '8px',
          padding: '8px 12px',
          color: '#e2e8f0',
          fontSize: '11px',
          fontWeight: 500,
          width: 180,
          boxShadow: gn.hotspotCategory === 'critical'
            ? '0 0 12px rgba(239,68,68,0.3)'
            : 'none',
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
    });

    const rows = Math.ceil(clusterNodes.length / Math.ceil(Math.sqrt(clusterNodes.length)));
    clusterY += rows * 100 + 80;
  }

  return nodes;
}

function buildFlowEdges(graphEdges: GraphEdge[], visibleNodeIds: Set<string>): Edge[] {
  return graphEdges
    .filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target))
    .map((e, i) => ({
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      animated: e.type === 'dynamic',
      style: {
        stroke: e.isCyclic ? '#ef4444' : e.type === 'dynamic' ? '#8b5cf6' : '#475569',
        strokeWidth: e.isCyclic ? 2 : 1,
        opacity: 0.6,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 12,
        height: 12,
        color: e.isCyclic ? '#ef4444' : '#475569',
      },
    }));
}

function NodeDetail({ node }: { node: GraphNode }) {
  return (
    <div className="text-[11px] text-slate-300 space-y-1.5 p-2">
      <div className="text-[13px] font-semibold text-white truncate">{node.path}</div>
      <div className="flex gap-3">
        <span>Kind: <span className="text-cyan-300">{node.kind}</span></span>
        <span>Lines: <span className="text-cyan-300">{node.lineCount}</span></span>
      </div>
      <div className="flex gap-3">
        <span>Fan-in: <span className="text-emerald-300">{node.fanIn}</span></span>
        <span>Fan-out: <span className="text-amber-300">{node.fanOut}</span></span>
      </div>
      <div className="flex gap-3">
        <span>Betweenness: <span className="text-violet-300">{node.betweenness}</span></span>
        <span>Funcs: <span className="text-slate-300">{node.functionCount}</span></span>
      </div>
      <div>
        Hotspot: <span className={
          node.hotspotCategory === 'critical' ? 'text-red-400' :
          node.hotspotCategory === 'important' ? 'text-amber-400' : 'text-emerald-400'
        }>{node.hotspotScore}/100 ({node.hotspotCategory})</span>
      </div>
    </div>
  );
}

export default function CartographyPanel() {
  const { graph, analysis, isScanning, scanError, lastScanAt, scan, query, isQuerying } = useCartographyStore();
  const workspacePath = useFileStore(s => s.workspacePath);

  const [filter, setFilter] = useState('');
  const [kindFilter, setKindFilter] = useState<FileKind | 'all'>('all');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [queryInput, setQueryInput] = useState('');
  const [queryResult, setQueryResult] = useState<CartographyQueryResult | null>(null);
  const [activeTab, setActiveTab] = useState<'graph' | 'hotspots' | 'query'>('graph');

  const flowNodes = useMemo(() => {
    if (!graph) return [];
    return buildFlowNodes(graph.nodes, filter, kindFilter);
  }, [graph, filter, kindFilter]);

  const visibleIds = useMemo(() => new Set(flowNodes.map(n => n.id)), [flowNodes]);

  const flowEdges = useMemo(() => {
    if (!graph) return [];
    return buildFlowEdges(graph.edges, visibleIds);
  }, [graph, visibleIds]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => { setNodes(flowNodes); }, [flowNodes, setNodes]);
  useEffect(() => { setEdges(flowEdges); }, [flowEdges, setEdges]);

  const handleScan = useCallback(async () => {
    await scan(workspacePath || undefined, undefined, true);
    const result = useCartographyStore.getState();
    if (result.graph && result.analysis) {
      feedCartographyToBrain({ graph: result.graph, analysis: result.analysis, scannedAt: Date.now() });
    }
  }, [scan, workspacePath]);

  const handleNodeClick: NodeMouseHandler = useCallback((_evt, node) => {
    const gn = graph?.nodes.find(n => n.id === node.id);
    if (gn) setSelectedNode(gn);
  }, [graph]);

  const handleQuery = useCallback(async () => {
    if (!queryInput.trim()) return;
    const result = await query(queryInput.trim());
    setQueryResult(result);
  }, [query, queryInput]);

  const healthColor = analysis
    ? analysis.healthScore >= 70 ? 'green' : analysis.healthScore >= 40 ? 'amber' : 'red'
    : 'neutral';

  const kinds: Array<FileKind | 'all'> = ['all', 'component', 'hook', 'store', 'api-route', 'util', 'type', 'config'];

  return (
    <div className="flex flex-col h-full bg-[#0d1117] overflow-hidden">
      <HudHeader
        title="Codebase Cartography"
        subtitle={analysis ? `Health ${analysis.healthScore}/100 | ${graph?.totalFiles ?? 0} files | ${graph?.totalEdges ?? 0} edges` : 'Scan a project to begin'}
        right={
          <HudButton onClick={handleScan} disabled={isScanning} tone="cyan">
            {isScanning ? 'Scanning...' : 'Scan Now'}
          </HudButton>
        }
      />

      {scanError && (
        <div className="mx-3 mt-2 p-2 rounded border border-red-500/40 bg-red-500/10 text-red-300 text-[11px]">
          {scanError}
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex gap-1 px-3 pt-2">
        {(['graph', 'hotspots', 'query'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 rounded-t text-[11px] font-medium transition-colors ${
              activeTab === tab
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 border-b-0'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab === 'graph' ? 'Dependency Graph' : tab === 'hotspots' ? 'Hotspots' : 'Ask Cartographer'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {/* GRAPH TAB */}
        {activeTab === 'graph' && (
          <div className="flex flex-col h-full">
            {/* Filters */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/50">
              <input
                type="text"
                placeholder="Filter files..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="flex-1 bg-[#1a1f2e] border border-slate-600/40 rounded px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
              />
              <select
                value={kindFilter}
                onChange={e => setKindFilter(e.target.value as FileKind | 'all')}
                className="bg-[#1a1f2e] border border-slate-600/40 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-cyan-500/50"
              >
                {kinds.map(k => (
                  <option key={k} value={k}>{k === 'all' ? 'All Types' : k}</option>
                ))}
              </select>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-2 px-3 py-1.5 border-b border-slate-700/30">
              {Object.entries(KIND_COLORS).filter(([k]) => k !== 'unknown').map(([kind, color]) => (
                <span key={kind} className="flex items-center gap-1 text-[10px] text-slate-400">
                  <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                  {kind}
                </span>
              ))}
              <span className="flex items-center gap-1 text-[10px] text-red-400">
                <span className="w-2 h-2 rounded-full bg-red-500" /> cycle
              </span>
            </div>

            {/* React Flow Graph */}
            <div className="flex-1 relative">
              {graph && graph.nodes.length > 0 ? (
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onNodeClick={handleNodeClick}
                  fitView
                  minZoom={0.1}
                  maxZoom={2}
                  proOptions={{ hideAttribution: true }}
                  style={{ background: '#0a0e1a' }}
                >
                  <Background color="#1e293b" gap={20} size={1} />
                  <Controls
                    showInteractive={false}
                    style={{ background: '#1a1f2e', border: '1px solid #334155', borderRadius: '8px' }}
                  />
                  <MiniMap
                    nodeColor={(n: Node) => {
                      const kind = (n.data as Record<string, unknown>)?.kind as FileKind;
                      return KIND_COLORS[kind] || '#4b5563';
                    }}
                    maskColor="rgba(0,0,0,0.7)"
                    style={{ background: '#0d1322', border: '1px solid #1e293b' }}
                  />
                </ReactFlow>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500 text-[13px]">
                  {isScanning ? (
                    <div className="flex items-center gap-2">
                      <PulsingDot tone="cyan" /> Scanning codebase...
                    </div>
                  ) : (
                    'No graph data. Click "Scan Now" to analyze.'
                  )}
                </div>
              )}

              {/* Selected Node Detail Panel */}
              {selectedNode && (
                <div className="absolute top-2 right-2 w-[260px] bg-[#0d1322]/95 backdrop-blur border border-cyan-500/30 rounded-lg shadow-lg z-50">
                  <div className="flex items-center justify-between px-2 py-1.5 border-b border-cyan-500/20">
                    <span className="text-[10px] uppercase tracking-wider text-cyan-400">File Detail</span>
                    <button onClick={() => setSelectedNode(null)} className="text-slate-400 hover:text-white text-[14px]">x</button>
                  </div>
                  <NodeDetail node={selectedNode} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* HOTSPOTS TAB */}
        {activeTab === 'hotspots' && (
          <div className="flex flex-col gap-3 p-3 overflow-y-auto h-full">
            {analysis && (
              <HudCard title="Health Score" tone={healthColor as 'green' | 'amber' | 'red'}>
                <div className="flex items-center gap-4">
                  <HudGauge label="Health" value={analysis.healthScore} max={100} tone={healthColor as 'green' | 'amber' | 'red'} />
                  <div className="text-[11px] text-slate-300 flex-1">
                    <p>{analysis.architectureSummary.slice(0, 200)}</p>
                  </div>
                </div>
              </HudCard>
            )}

            {graph && graph.nodes.filter(n => n.hotspotCategory === 'critical').length > 0 && (
              <HudCard title="Critical Hotspots" tone="red">
                <div className="space-y-2">
                  {graph.nodes.filter(n => n.hotspotCategory === 'critical').slice(0, 10).map(n => (
                    <div key={n.id} className="flex items-center justify-between text-[11px] py-1 border-b border-slate-700/30 last:border-0">
                      <span className="text-slate-200 truncate flex-1 mr-2">{n.path}</span>
                      <span className="text-red-400 whitespace-nowrap">score {n.hotspotScore}</span>
                    </div>
                  ))}
                </div>
              </HudCard>
            )}

            {graph && graph.cycles.length > 0 && (
              <HudCard title={`Import Cycles (${graph.cycles.length})`} tone="amber">
                <div className="space-y-1.5">
                  {graph.cycles.slice(0, 8).map((c, i) => (
                    <div key={i} className="text-[10px] text-amber-200/80 font-mono">
                      {c.files.join(' -> ')}
                    </div>
                  ))}
                </div>
              </HudCard>
            )}

            {analysis && analysis.refactoringSuggestions.length > 0 && (
              <HudCard title="Refactoring Suggestions" tone="purple">
                <div className="space-y-1.5">
                  {analysis.refactoringSuggestions.map((s, i) => (
                    <div key={i} className="text-[11px] text-slate-300 pl-2 border-l-2 border-violet-500/40">
                      {s}
                    </div>
                  ))}
                </div>
              </HudCard>
            )}

            {analysis && analysis.risks.length > 0 && (
              <HudCard title="Risks" tone="red">
                <div className="space-y-1.5">
                  {analysis.risks.map((r, i) => (
                    <div key={i} className="text-[11px] text-red-200/80">{r}</div>
                  ))}
                </div>
              </HudCard>
            )}

            {graph && (
              <HudCard title="Cluster Cohesion" tone="cyan">
                <div className="space-y-1.5">
                  {graph.clusters.slice(0, 10).map(c => (
                    <div key={c.id} className="flex items-center justify-between text-[11px] py-1">
                      <span className="text-slate-300 truncate flex-1 mr-2">{c.directory}</span>
                      <span className="text-slate-400">{c.files.length} files</span>
                      <span className={`ml-2 ${c.cohesion >= 0.7 ? 'text-emerald-400' : c.cohesion >= 0.4 ? 'text-amber-400' : 'text-red-400'}`}>
                        {Math.round(c.cohesion * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </HudCard>
            )}
          </div>
        )}

        {/* QUERY TAB */}
        {activeTab === 'query' && (
          <div className="flex flex-col gap-3 p-3 h-full">
            <HudCard title="Ask the Cartographer" tone="cyan">
              <div className="space-y-2">
                <p className="text-[11px] text-slate-400">
                  Ask natural language questions about the codebase architecture, dependencies, or structure.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. What files depend on llm-call.ts?"
                    value={queryInput}
                    onChange={e => setQueryInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleQuery()}
                    className="flex-1 bg-[#1a1f2e] border border-slate-600/40 rounded px-2 py-1.5 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
                    disabled={!graph || isQuerying}
                  />
                  <HudButton onClick={handleQuery} disabled={!graph || isQuerying || !queryInput.trim()}>
                    {isQuerying ? 'Thinking...' : 'Ask'}
                  </HudButton>
                </div>
              </div>
            </HudCard>

            {queryResult && (
              <HudCard title="Answer" tone="green">
                <div className="space-y-2">
                  <p className="text-[11px] text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {queryResult.answer}
                  </p>
                  {queryResult.relevantFiles.length > 0 && (
                    <div className="pt-1 border-t border-slate-700/40">
                      <div className="text-[10px] text-slate-400 mb-1">Relevant files:</div>
                      {queryResult.relevantFiles.map((f, i) => (
                        <div key={i} className="text-[10px] text-cyan-300 font-mono">{f}</div>
                      ))}
                    </div>
                  )}
                </div>
              </HudCard>
            )}

            {!graph && (
              <div className="text-center text-slate-500 text-[12px] mt-8">
                Run a scan first to enable queries.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats Footer */}
      {graph && (
        <div className="flex items-center gap-4 px-3 py-1.5 border-t border-slate-700/40 text-[10px] text-slate-500">
          <span>Files: <AnimatedCounter label="Files" value={graph.totalFiles} /></span>
          <span>Edges: <AnimatedCounter label="Edges" value={graph.totalEdges} /></span>
          <span>Cycles: <AnimatedCounter label="Cycles" value={graph.cycles.length} /></span>
          <span>Clusters: <AnimatedCounter label="Clusters" value={graph.clusters.length} /></span>
          {lastScanAt > 0 && (
            <span className="ml-auto">
              Last scan: {new Date(lastScanAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export type FileKind =
  | 'component'
  | 'hook'
  | 'store'
  | 'api-route'
  | 'util'
  | 'type'
  | 'config'
  | 'style'
  | 'test'
  | 'unknown';

export interface CartographyFileNode {
  path: string;
  name: string;
  kind: FileKind;
  language: string;
  lineCount: number;
  functionCount: number;
  imports: string[];
  exports: string[];
  dynamicImports: string[];
}

export interface GraphNode {
  id: string;
  path: string;
  name: string;
  kind: FileKind;
  language: string;
  lineCount: number;
  functionCount: number;
  fanIn: number;
  fanOut: number;
  betweenness: number;
  hotspotScore: number;
  hotspotCategory: 'critical' | 'important' | 'normal';
  cluster: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'static' | 'dynamic';
  isCyclic: boolean;
}

export interface ImportCycle {
  files: string[];
  length: number;
}

export interface Cluster {
  id: string;
  label: string;
  directory: string;
  files: string[];
  internalEdges: number;
  externalEdges: number;
  cohesion: number;
}

export interface AntiPattern {
  type: 'god-file' | 'orphan' | 'cycle' | 'high-coupling';
  file: string;
  detail: string;
  severity: 'critical' | 'warning' | 'info';
}

export interface CartographyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: Cluster[];
  cycles: ImportCycle[];
  antiPatterns: AntiPattern[];
  totalFiles: number;
  totalEdges: number;
  scannedAt: number;
}

export interface LLMAnalysis {
  architectureSummary: string;
  hotspotAnalysis: string;
  refactoringSuggestions: string[];
  healthScore: number;
  keyDecisions: string[];
  risks: string[];
}

export interface CartographyResult {
  graph: CartographyGraph;
  analysis: LLMAnalysis;
  scannedAt: number;
}

export interface CartographyQueryResult {
  answer: string;
  relevantFiles: string[];
}

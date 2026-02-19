/**
 * Worker Manager - Coordinates web workers for background processing
 * Manages: indexer (file indexing), embedding (vector search), agent (multi-agent tasks)
 */

type WorkerType = 'indexer' | 'embedding' | 'agent';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

class WorkerManager {
  private workers = new Map<WorkerType, Worker>();
  private pending = new Map<string, PendingRequest>();
  private listeners = new Map<string, Set<(data: any) => void>>();
  private initialized = false;

  init() {
    if (this.initialized || typeof window === 'undefined') return;

    try {
      this.workers.set('indexer', new Worker(
        new URL('../workers/indexer.worker.ts', import.meta.url),
        { type: 'module' }
      ));
      this.workers.set('embedding', new Worker(
        new URL('../workers/embedding.worker.ts', import.meta.url),
        { type: 'module' }
      ));
      this.workers.set('agent', new Worker(
        new URL('../workers/agent.worker.ts', import.meta.url),
        { type: 'module' }
      ));

      for (const [type, worker] of this.workers) {
        worker.onmessage = (event) => this.handleMessage(type, event.data);
        worker.onerror = (error) => console.error(`[${type} worker] Error:`, error);
      }

      this.initialized = true;
      console.log('[WorkerManager] All workers initialized');
    } catch (e) {
      console.warn('[WorkerManager] Failed to init workers:', e);
    }
  }

  private handleMessage(type: WorkerType, data: any) {
    if (data.type === 'progress') {
      const eventKey = `${type}:progress`;
      this.listeners.get(eventKey)?.forEach(fn => fn(data));
      return;
    }

    if (data.id) {
      const pending = this.pending.get(data.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pending.delete(data.id);
        if (data.success) {
          pending.resolve(data.result);
        } else {
          pending.reject(new Error(data.error || 'Worker error'));
        }
      }
    }
  }

  private send<T>(type: WorkerType, messageType: string, payload?: any, timeoutMs = 30000): Promise<T> {
    return new Promise((resolve, reject) => {
      const worker = this.workers.get(type);
      if (!worker) {
        reject(new Error(`Worker "${type}" not initialized`));
        return;
      }

      const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Worker "${type}" timed out`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timeout });
      worker.postMessage({ type: messageType, payload, id });
    });
  }

  onProgress(type: WorkerType, callback: (data: any) => void) {
    const key = `${type}:progress`;
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(callback);
    return () => this.listeners.get(key)?.delete(callback);
  }

  // Indexer operations
  async indexFiles(files: Array<{ path: string; content: string; language: string }>) {
    this.init();
    return this.send<{ indexed: number }>('indexer', 'index', files);
  }

  async searchIndex(query: string, limit = 10) {
    this.init();
    return this.send<Array<{ path: string; score: number; matches: any[] }>>('indexer', 'search', { query, limit });
  }

  async getIndexStatus() {
    this.init();
    return this.send<{ files: number; totalSize: number; symbols: number }>('indexer', 'status');
  }

  async clearIndex() {
    this.init();
    return this.send<{ cleared: number }>('indexer', 'clear');
  }

  // Embedding operations
  async embedTexts(texts: string[]) {
    this.init();
    return this.send<{ embedded: number; ids: string[] }>('embedding', 'embed', { texts });
  }

  async semanticSearch(query: string, k = 10) {
    this.init();
    return this.send<Array<{ id: string; text: string; score: number }>>('embedding', 'search', { query, k });
  }

  // Agent operations
  async executeAgentTask(instruction: string, context?: Record<string, unknown>) {
    this.init();
    return this.send<{ success: boolean; steps: any[]; result?: any; error?: string }>(
      'agent', 'execute', { instruction, context }, 120000
    );
  }

  async cancelAgentTask() {
    this.init();
    return this.send<{ cancelled: boolean }>('agent', 'cancel');
  }

  destroy() {
    for (const worker of this.workers.values()) {
      worker.terminate();
    }
    this.workers.clear();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Worker destroyed'));
    }
    this.pending.clear();
    this.initialized = false;
  }
}

export const workerManager = new WorkerManager();

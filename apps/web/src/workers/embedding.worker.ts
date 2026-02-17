// Embedding Web Worker
// apps/web/src/workers/embedding.worker.ts

interface EmbeddingMessage {
  type: 'embed' | 'search' | 'clear' | 'status';
  payload?: unknown;
  id: string;
}

interface EmbedRequest {
  texts: string[];
  model?: string;
}

interface SearchRequest {
  query: string;
  k?: number;
  threshold?: number;
}

interface EmbeddingEntry {
  id: string;
  text: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
  timestamp: number;
}

// In-memory vector store
const vectorStore: Map<string, EmbeddingEntry> = new Map();

// Simple embedding dimension (in production, use actual model dimension)
const EMBEDDING_DIM = 384;

self.onmessage = async (event: MessageEvent<EmbeddingMessage>) => {
  const { type, payload, id } = event.data;

  try {
    let result: unknown;

    switch (type) {
      case 'embed':
        result = await embedTexts(payload as EmbedRequest);
        break;
      case 'search':
        result = semanticSearch(payload as SearchRequest);
        break;
      case 'clear':
        result = clearStore();
        break;
      case 'status':
        result = getStatus();
        break;
      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    self.postMessage({ id, success: true, result });
  } catch (error) {
    self.postMessage({
      id,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

async function embedTexts(request: EmbedRequest): Promise<{ embedded: number; ids: string[] }> {
  const ids: string[] = [];

  for (const text of request.texts) {
    const id = generateId();
    const embedding = await generateEmbedding(text);
    
    vectorStore.set(id, {
      id,
      text,
      embedding,
      timestamp: Date.now(),
    });

    ids.push(id);

    // Report progress
    self.postMessage({
      type: 'progress',
      current: ids.length,
      total: request.texts.length,
    });
  }

  return { embedded: ids.length, ids };
}

async function generateEmbedding(text: string): Promise<number[]> {
  // In production, this would call an embedding API or local model
  // For now, generate a simple hash-based pseudo-embedding
  
  const embedding: number[] = new Array(EMBEDDING_DIM).fill(0);
  const words = text.toLowerCase().split(/\s+/);
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (let j = 0; j < word.length; j++) {
      const idx = (word.charCodeAt(j) * (i + 1) * (j + 1)) % EMBEDDING_DIM;
      embedding[idx] += 1 / (i + 1);
    }
  }

  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= magnitude;
    }
  }

  return embedding;
}

function semanticSearch(request: SearchRequest): Array<{ id: string; text: string; score: number }> {
  const { query, k = 10, threshold = 0.0 } = request;
  
  // Generate query embedding synchronously (simplified)
  const queryEmbedding = generateEmbeddingSync(query);
  
  const results: Array<{ id: string; text: string; score: number }> = [];

  for (const entry of vectorStore.values()) {
    const score = cosineSimilarity(queryEmbedding, entry.embedding);
    
    if (score >= threshold) {
      results.push({
        id: entry.id,
        text: entry.text,
        score,
      });
    }
  }

  // Sort by score and return top k
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, k);
}

function generateEmbeddingSync(text: string): number[] {
  const embedding: number[] = new Array(EMBEDDING_DIM).fill(0);
  const words = text.toLowerCase().split(/\s+/);
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (let j = 0; j < word.length; j++) {
      const idx = (word.charCodeAt(j) * (i + 1) * (j + 1)) % EMBEDDING_DIM;
      embedding[idx] += 1 / (i + 1);
    }
  }

  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= magnitude;
    }
  }

  return embedding;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) return 0;

  return dotProduct / (magnitudeA * magnitudeB);
}

function clearStore(): { cleared: number } {
  const count = vectorStore.size;
  vectorStore.clear();
  return { cleared: count };
}

function getStatus(): { entries: number; dimension: number } {
  return {
    entries: vectorStore.size,
    dimension: EMBEDDING_DIM,
  };
}

function generateId(): string {
  return `emb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export {};

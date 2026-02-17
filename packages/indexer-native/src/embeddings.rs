// Rust embedding generator with caching support
// packages/indexer-native/src/embeddings.rs

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::collections::HashMap;
use std::sync::RwLock;

/// Embedding vector type
pub type EmbeddingVector = Vec<f32>;

/// Cache entry for embeddings
#[derive(Clone)]
pub struct CacheEntry {
    pub embedding: EmbeddingVector,
    pub timestamp: u64,
    pub hash: String,
}

/// LRU Cache for embeddings
pub struct EmbeddingCache {
    entries: HashMap<String, CacheEntry>,
    order: Vec<String>,
    max_size: usize,
}

impl EmbeddingCache {
    pub fn new(max_size: usize) -> Self {
        Self {
            entries: HashMap::new(),
            order: Vec::new(),
            max_size,
        }
    }

    pub fn get(&mut self, key: &str) -> Option<&EmbeddingVector> {
        if self.entries.contains_key(key) {
            // Move to end (most recently used)
            self.order.retain(|k| k != key);
            self.order.push(key.to_string());
            Some(&self.entries.get(key).unwrap().embedding)
        } else {
            None
        }
    }

    pub fn set(&mut self, key: String, entry: CacheEntry) {
        if self.entries.len() >= self.max_size {
            // Evict least recently used
            if let Some(lru_key) = self.order.first().cloned() {
                self.entries.remove(&lru_key);
                self.order.remove(0);
            }
        }
        self.order.push(key.clone());
        self.entries.insert(key, entry);
    }

    pub fn clear(&mut self) {
        self.entries.clear();
        self.order.clear();
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }
}

/// Global embedding cache
lazy_static::lazy_static! {
    static ref EMBEDDING_CACHE: RwLock<EmbeddingCache> = RwLock::new(EmbeddingCache::new(10000));
}

/// Embedding request for batch processing
#[napi(object)]
pub struct EmbeddingRequest {
    pub id: String,
    pub text: String,
    pub model: Option<String>,
}

/// Embedding result
#[napi(object)]
pub struct EmbeddingResult {
    pub id: String,
    pub embedding: Vec<f64>,
    pub cached: bool,
    pub dimensions: u32,
}

/// Text preprocessing for embeddings
#[napi]
pub fn preprocess_text(text: String, max_tokens: Option<u32>) -> String {
    let max_tokens = max_tokens.unwrap_or(8192) as usize;
    
    // Normalize whitespace
    let normalized = text
        .lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    
    // Truncate if needed (rough approximation: 1 token ≈ 4 chars)
    let max_chars = max_tokens * 4;
    if normalized.len() > max_chars {
        normalized[..max_chars].to_string()
    } else {
        normalized
    }
}

/// Compute content hash for caching
#[napi]
pub fn compute_content_hash(content: String) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    
    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

/// Check if embedding is cached
#[napi]
pub fn is_embedding_cached(content_hash: String) -> bool {
    if let Ok(cache) = EMBEDDING_CACHE.read() {
        cache.entries.contains_key(&content_hash)
    } else {
        false
    }
}

/// Get cached embedding
#[napi]
pub fn get_cached_embedding(content_hash: String) -> Option<Vec<f64>> {
    if let Ok(mut cache) = EMBEDDING_CACHE.write() {
        cache.get(&content_hash).map(|v| v.iter().map(|f| *f as f64).collect())
    } else {
        None
    }
}

/// Store embedding in cache
#[napi]
pub fn cache_embedding(content_hash: String, embedding: Vec<f64>) {
    if let Ok(mut cache) = EMBEDDING_CACHE.write() {
        let entry = CacheEntry {
            embedding: embedding.iter().map(|f| *f as f32).collect(),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            hash: content_hash.clone(),
        };
        cache.set(content_hash, entry);
    }
}

/// Clear embedding cache
#[napi]
pub fn clear_embedding_cache() {
    if let Ok(mut cache) = EMBEDDING_CACHE.write() {
        cache.clear();
    }
}

/// Get cache statistics
#[napi(object)]
pub struct CacheStats {
    pub size: u32,
    pub max_size: u32,
    pub hit_rate: f64,
}

static CACHE_HITS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static CACHE_MISSES: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

#[napi]
pub fn get_cache_stats() -> CacheStats {
    let hits = CACHE_HITS.load(std::sync::atomic::Ordering::Relaxed);
    let misses = CACHE_MISSES.load(std::sync::atomic::Ordering::Relaxed);
    let total = hits + misses;
    
    let size = if let Ok(cache) = EMBEDDING_CACHE.read() {
        cache.len() as u32
    } else {
        0
    };
    
    CacheStats {
        size,
        max_size: 10000,
        hit_rate: if total > 0 { hits as f64 / total as f64 } else { 0.0 },
    }
}

/// Chunk text for embedding
#[napi(object)]
pub struct TextChunk {
    pub text: String,
    pub start_offset: u32,
    pub end_offset: u32,
    pub overlap_prev: u32,
}

#[napi]
pub fn chunk_for_embedding(
    text: String,
    chunk_size: Option<u32>,
    overlap: Option<u32>,
) -> Vec<TextChunk> {
    let chunk_size = chunk_size.unwrap_or(512) as usize;
    let overlap = overlap.unwrap_or(50) as usize;
    
    let words: Vec<&str> = text.split_whitespace().collect();
    let mut chunks = Vec::new();
    let mut i = 0;
    
    while i < words.len() {
        let end = (i + chunk_size).min(words.len());
        let chunk_words = &words[i..end];
        let chunk_text = chunk_words.join(" ");
        
        // Calculate actual character offsets
        let start_offset = if i == 0 {
            0
        } else {
            words[..i].iter().map(|w| w.len() + 1).sum::<usize>()
        };
        
        chunks.push(TextChunk {
            text: chunk_text,
            start_offset: start_offset as u32,
            end_offset: (start_offset + chunk_words.iter().map(|w| w.len() + 1).sum::<usize>()) as u32,
            overlap_prev: if i > 0 { overlap as u32 } else { 0 },
        });
        
        if end >= words.len() {
            break;
        }
        
        i += chunk_size - overlap;
    }
    
    chunks
}

/// Normalize embedding vector
#[napi]
pub fn normalize_embedding(embedding: Vec<f64>) -> Vec<f64> {
    let magnitude: f64 = embedding.iter().map(|x| x * x).sum::<f64>().sqrt();
    if magnitude > 0.0 {
        embedding.iter().map(|x| x / magnitude).collect()
    } else {
        embedding
    }
}

/// Compute cosine similarity between two embeddings
#[napi]
pub fn cosine_similarity(a: Vec<f64>, b: Vec<f64>) -> f64 {
    if a.len() != b.len() {
        return 0.0;
    }
    
    let dot_product: f64 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let magnitude_a: f64 = a.iter().map(|x| x * x).sum::<f64>().sqrt();
    let magnitude_b: f64 = b.iter().map(|x| x * x).sum::<f64>().sqrt();
    
    if magnitude_a > 0.0 && magnitude_b > 0.0 {
        dot_product / (magnitude_a * magnitude_b)
    } else {
        0.0
    }
}

/// Batch cosine similarity computation
#[napi]
pub fn batch_cosine_similarity(query: Vec<f64>, embeddings: Vec<Vec<f64>>) -> Vec<f64> {
    embeddings.iter().map(|e| cosine_similarity(query.clone(), e.clone())).collect()
}

/// Quantize embedding to reduce memory
#[napi]
pub fn quantize_embedding(embedding: Vec<f64>, bits: Option<u32>) -> Vec<i32> {
    let bits = bits.unwrap_or(8);
    let max_val = (1 << (bits - 1)) - 1;
    let min_val = -(1 << (bits - 1));
    
    // Find min/max for scaling
    let e_min = embedding.iter().cloned().fold(f64::INFINITY, f64::min);
    let e_max = embedding.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let scale = if e_max > e_min { (max_val - min_val) as f64 / (e_max - e_min) } else { 1.0 };
    
    embedding
        .iter()
        .map(|v| ((v - e_min) * scale + min_val as f64).round() as i32)
        .collect()
}

/// Dequantize embedding
#[napi]
pub fn dequantize_embedding(quantized: Vec<i32>, original_min: f64, original_max: f64, bits: Option<u32>) -> Vec<f64> {
    let bits = bits.unwrap_or(8);
    let max_val = (1 << (bits - 1)) - 1;
    let min_val = -(1 << (bits - 1));
    let scale = if original_max > original_min { (original_max - original_min) / (max_val - min_val) as f64 } else { 1.0 };
    
    quantized
        .iter()
        .map(|v| (*v - min_val) as f64 * scale + original_min)
        .collect()
}

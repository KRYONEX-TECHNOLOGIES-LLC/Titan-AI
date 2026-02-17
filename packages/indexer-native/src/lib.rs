//! Titan AI - Native Indexer
//!
//! High-performance code indexer using Tree-sitter for AST parsing
//! and Merkle trees for O(log N) incremental synchronization.

use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

mod parser;
mod merkle;
mod chunker;

/// Code chunk extracted from source
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeChunk {
    pub id: String,
    pub file_path: String,
    pub content: String,
    pub start_line: u32,
    pub end_line: u32,
    pub chunk_type: String,
    pub language: String,
    pub symbols: Vec<String>,
    pub hash: String,
}

/// Symbol extracted from code
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Symbol {
    pub name: String,
    pub kind: String,
    pub file_path: String,
    pub start_line: u32,
    pub end_line: u32,
    pub signature: Option<String>,
    pub exported: bool,
}

/// Merkle tree node for incremental sync
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MerkleNode {
    pub hash: String,
    pub path: String,
    pub is_file: bool,
    pub children: Vec<String>,
}

/// Sync diff result
#[napi(object)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncDiff {
    pub added: Vec<String>,
    pub modified: Vec<String>,
    pub deleted: Vec<String>,
}

/// Parse a file and extract code chunks
#[napi]
pub fn parse_file(file_path: String, content: String, language: String) -> Result<Vec<CodeChunk>> {
    parser::parse_file(&file_path, &content, &language)
        .map_err(|e| Error::from_reason(e.to_string()))
}

/// Extract symbols from a file
#[napi]
pub fn extract_symbols(file_path: String, content: String, language: String) -> Result<Vec<Symbol>> {
    parser::extract_symbols(&file_path, &content, &language)
        .map_err(|e| Error::from_reason(e.to_string()))
}

/// Build a Merkle tree from file hashes
#[napi]
pub fn build_merkle_tree(files: Vec<MerkleNode>) -> Result<String> {
    merkle::build_tree(&files)
        .map_err(|e| Error::from_reason(e.to_string()))
}

/// Compute diff between two Merkle trees
#[napi]
pub fn compute_merkle_diff(old_root: String, new_files: Vec<MerkleNode>) -> Result<SyncDiff> {
    merkle::compute_diff(&old_root, &new_files)
        .map_err(|e| Error::from_reason(e.to_string()))
}

/// Hash file content
#[napi]
pub fn hash_content(content: String) -> String {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Chunk code into semantic blocks
#[napi]
pub fn chunk_code(
    content: String,
    language: String,
    max_chunk_size: u32,
    overlap: u32,
) -> Result<Vec<CodeChunk>> {
    chunker::chunk_code(&content, &language, max_chunk_size as usize, overlap as usize)
        .map_err(|e| Error::from_reason(e.to_string()))
}

/// Get supported languages
#[napi]
pub fn get_supported_languages() -> Vec<String> {
    vec![
        "typescript".to_string(),
        "javascript".to_string(),
        "python".to_string(),
        "rust".to_string(),
        "go".to_string(),
    ]
}

/// Version info
#[napi]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

//! Merkle tree for incremental synchronization

use crate::{MerkleNode, SyncDiff};
use anyhow::Result;
use sha2::{Sha256, Digest};
use std::collections::HashMap;

/// Build a Merkle tree from file nodes
pub fn build_tree(files: &[MerkleNode]) -> Result<String> {
    if files.is_empty() {
        return Ok(hash_empty());
    }

    // Build leaf hashes
    let mut hashes: Vec<String> = files.iter().map(|f| f.hash.clone()).collect();

    // Build tree bottom-up
    while hashes.len() > 1 {
        let mut next_level = Vec::new();

        for chunk in hashes.chunks(2) {
            let combined = if chunk.len() == 2 {
                format!("{}{}", chunk[0], chunk[1])
            } else {
                chunk[0].clone()
            };
            next_level.push(hash_string(&combined));
        }

        hashes = next_level;
    }

    Ok(hashes.into_iter().next().unwrap_or_else(hash_empty))
}

/// Compute diff between old and new states
pub fn compute_diff(old_root: &str, new_files: &[MerkleNode]) -> Result<SyncDiff> {
    // Build new tree
    let new_root = build_tree(new_files)?;

    // If roots match, no changes
    if old_root == new_root {
        return Ok(SyncDiff {
            added: vec![],
            modified: vec![],
            deleted: vec![],
        });
    }

    // Build index of new files
    let new_index: HashMap<&str, &MerkleNode> = new_files
        .iter()
        .map(|f| (f.path.as_str(), f))
        .collect();

    // For now, return all files as modified since we don't have old state
    // In production, you'd compare against stored old tree
    Ok(SyncDiff {
        added: vec![],
        modified: new_files.iter().map(|f| f.path.clone()).collect(),
        deleted: vec![],
    })
}

/// Compute incremental diff between two file sets
pub fn compute_incremental_diff(
    old_files: &[MerkleNode],
    new_files: &[MerkleNode],
) -> SyncDiff {
    let old_index: HashMap<&str, &str> = old_files
        .iter()
        .map(|f| (f.path.as_str(), f.hash.as_str()))
        .collect();

    let new_index: HashMap<&str, &str> = new_files
        .iter()
        .map(|f| (f.path.as_str(), f.hash.as_str()))
        .collect();

    let mut added = Vec::new();
    let mut modified = Vec::new();
    let mut deleted = Vec::new();

    // Find added and modified
    for (path, new_hash) in &new_index {
        match old_index.get(path) {
            None => added.push(path.to_string()),
            Some(old_hash) if old_hash != new_hash => modified.push(path.to_string()),
            _ => {}
        }
    }

    // Find deleted
    for path in old_index.keys() {
        if !new_index.contains_key(path) {
            deleted.push(path.to_string());
        }
    }

    SyncDiff {
        added,
        modified,
        deleted,
    }
}

/// Hash an empty tree
fn hash_empty() -> String {
    hash_string("")
}

/// Hash a string
fn hash_string(s: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(s.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Verify a Merkle proof
pub fn verify_proof(
    leaf_hash: &str,
    proof: &[String],
    root: &str,
    index: usize,
) -> bool {
    let mut current = leaf_hash.to_string();
    let mut idx = index;

    for sibling in proof {
        current = if idx % 2 == 0 {
            hash_string(&format!("{}{}", current, sibling))
        } else {
            hash_string(&format!("{}{}", sibling, current))
        };
        idx /= 2;
    }

    current == root
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_tree() {
        let files = vec![
            MerkleNode {
                hash: "a".to_string(),
                path: "file1.ts".to_string(),
                is_file: true,
                children: vec![],
            },
            MerkleNode {
                hash: "b".to_string(),
                path: "file2.ts".to_string(),
                is_file: true,
                children: vec![],
            },
        ];

        let root = build_tree(&files).unwrap();
        assert!(!root.is_empty());
    }

    #[test]
    fn test_incremental_diff() {
        let old = vec![
            MerkleNode {
                hash: "a".to_string(),
                path: "file1.ts".to_string(),
                is_file: true,
                children: vec![],
            },
        ];

        let new = vec![
            MerkleNode {
                hash: "a".to_string(),
                path: "file1.ts".to_string(),
                is_file: true,
                children: vec![],
            },
            MerkleNode {
                hash: "b".to_string(),
                path: "file2.ts".to_string(),
                is_file: true,
                children: vec![],
            },
        ];

        let diff = compute_incremental_diff(&old, &new);
        assert_eq!(diff.added.len(), 1);
        assert_eq!(diff.added[0], "file2.ts");
        assert!(diff.modified.is_empty());
        assert!(diff.deleted.is_empty());
    }
}

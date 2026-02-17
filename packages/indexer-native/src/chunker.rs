//! Semantic code chunking

use crate::CodeChunk;
use anyhow::Result;
use sha2::{Sha256, Digest};

/// Chunk code into semantic blocks
pub fn chunk_code(
    content: &str,
    language: &str,
    max_chunk_size: usize,
    overlap: usize,
) -> Result<Vec<CodeChunk>> {
    let lines: Vec<&str> = content.lines().collect();
    let mut chunks = Vec::new();
    let mut current_start = 0;

    while current_start < lines.len() {
        // Find chunk end
        let chunk_end = find_chunk_boundary(
            &lines,
            current_start,
            max_chunk_size,
            language,
        );

        // Extract chunk content
        let chunk_lines = &lines[current_start..chunk_end];
        let chunk_content = chunk_lines.join("\n");

        // Generate hash
        let hash = hash_content(&chunk_content);
        let id = format!("chunk:{}:{}", current_start + 1, &hash[..8]);

        chunks.push(CodeChunk {
            id,
            file_path: String::new(), // Set by caller
            content: chunk_content,
            start_line: (current_start + 1) as u32,
            end_line: chunk_end as u32,
            chunk_type: "chunk".to_string(),
            language: language.to_string(),
            symbols: vec![],
            hash,
        });

        // Move to next chunk with overlap
        current_start = if chunk_end >= lines.len() {
            lines.len()
        } else {
            chunk_end.saturating_sub(overlap)
        };
    }

    Ok(chunks)
}

/// Find a natural chunk boundary
fn find_chunk_boundary(
    lines: &[&str],
    start: usize,
    max_size: usize,
    language: &str,
) -> usize {
    let ideal_end = (start + max_size).min(lines.len());

    // If we're at the end, return it
    if ideal_end >= lines.len() {
        return lines.len();
    }

    // Look backwards for a natural boundary
    for i in (start + max_size / 2..ideal_end).rev() {
        if is_natural_boundary(lines[i], language) {
            return i + 1;
        }
    }

    // No natural boundary found, use max size
    ideal_end
}

/// Check if a line is a natural chunk boundary
fn is_natural_boundary(line: &str, language: &str) -> bool {
    let trimmed = line.trim();

    // Empty lines are good boundaries
    if trimmed.is_empty() {
        return true;
    }

    // Closing braces
    if trimmed == "}" || trimmed == "};" {
        return true;
    }

    // Language-specific boundaries
    match language {
        "typescript" | "javascript" => {
            trimmed.starts_with("export ")
                || trimmed.starts_with("function ")
                || trimmed.starts_with("class ")
                || trimmed.starts_with("interface ")
                || trimmed.starts_with("const ")
        }
        "python" => {
            trimmed.starts_with("def ")
                || trimmed.starts_with("class ")
                || trimmed.starts_with("@")
        }
        "rust" => {
            trimmed.starts_with("fn ")
                || trimmed.starts_with("pub fn ")
                || trimmed.starts_with("impl ")
                || trimmed.starts_with("struct ")
        }
        "go" => {
            trimmed.starts_with("func ")
                || trimmed.starts_with("type ")
        }
        _ => false,
    }
}

/// Hash content
fn hash_content(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chunk_code() {
        let content = r#"
function foo() {
    return 1;
}

function bar() {
    return 2;
}
"#;

        let chunks = chunk_code(content, "typescript", 5, 1).unwrap();
        assert!(!chunks.is_empty());
    }

    #[test]
    fn test_natural_boundary() {
        assert!(is_natural_boundary("}", "typescript"));
        assert!(is_natural_boundary("export function", "typescript"));
        assert!(is_natural_boundary("def foo():", "python"));
        assert!(is_natural_boundary("fn main() {", "rust"));
    }
}

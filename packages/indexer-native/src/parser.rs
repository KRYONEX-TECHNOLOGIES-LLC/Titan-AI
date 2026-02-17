//! Tree-sitter based code parser

use crate::{CodeChunk, Symbol};
use anyhow::Result;
use sha2::{Sha256, Digest};

/// Parse a file and extract code chunks
pub fn parse_file(file_path: &str, content: &str, language: &str) -> Result<Vec<CodeChunk>> {
    let parser = get_parser(language)?;
    let tree = parser.parse(content, None)
        .ok_or_else(|| anyhow::anyhow!("Failed to parse file"))?;

    let root = tree.root_node();
    let mut chunks = Vec::new();

    // Extract top-level declarations as chunks
    extract_chunks_recursive(&root, content, file_path, language, &mut chunks);

    Ok(chunks)
}

/// Extract symbols from a file
pub fn extract_symbols(file_path: &str, content: &str, language: &str) -> Result<Vec<Symbol>> {
    let parser = get_parser(language)?;
    let tree = parser.parse(content, None)
        .ok_or_else(|| anyhow::anyhow!("Failed to parse file"))?;

    let root = tree.root_node();
    let mut symbols = Vec::new();

    extract_symbols_recursive(&root, content, file_path, &mut symbols);

    Ok(symbols)
}

/// Get parser for a language
fn get_parser(language: &str) -> Result<tree_sitter::Parser> {
    let mut parser = tree_sitter::Parser::new();

    let lang = match language {
        "typescript" | "tsx" => tree_sitter_typescript::LANGUAGE_TYPESCRIPT,
        "javascript" | "jsx" => tree_sitter_javascript::LANGUAGE,
        "python" => tree_sitter_python::LANGUAGE,
        "rust" => tree_sitter_rust::LANGUAGE,
        "go" => tree_sitter_go::LANGUAGE,
        _ => return Err(anyhow::anyhow!("Unsupported language: {}", language)),
    };

    parser.set_language(&lang.into())?;
    Ok(parser)
}

/// Recursively extract chunks from AST
fn extract_chunks_recursive(
    node: &tree_sitter::Node,
    content: &str,
    file_path: &str,
    language: &str,
    chunks: &mut Vec<CodeChunk>,
) {
    let kind = node.kind();

    // Check if this node is a chunk-worthy declaration
    if is_chunk_node(kind, language) {
        let start_line = node.start_position().row as u32 + 1;
        let end_line = node.end_position().row as u32 + 1;
        let node_content = &content[node.byte_range()];

        // Extract symbols from this node
        let symbols = extract_node_symbols(node, content);

        // Generate chunk ID and hash
        let hash = hash_content(node_content);
        let id = format!("{}:{}:{}", file_path, start_line, &hash[..8]);

        chunks.push(CodeChunk {
            id,
            file_path: file_path.to_string(),
            content: node_content.to_string(),
            start_line,
            end_line,
            chunk_type: map_node_kind(kind, language),
            language: language.to_string(),
            symbols,
            hash,
        });
    }

    // Recurse into children
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        extract_chunks_recursive(&child, content, file_path, language, chunks);
    }
}

/// Recursively extract symbols from AST
fn extract_symbols_recursive(
    node: &tree_sitter::Node,
    content: &str,
    file_path: &str,
    symbols: &mut Vec<Symbol>,
) {
    let kind = node.kind();

    // Check if this node defines a symbol
    if let Some(symbol) = extract_symbol(node, content, file_path) {
        symbols.push(symbol);
    }

    // Recurse into children
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        extract_symbols_recursive(&child, content, file_path, symbols);
    }
}

/// Check if node kind should be a chunk
fn is_chunk_node(kind: &str, language: &str) -> bool {
    match language {
        "typescript" | "javascript" => matches!(
            kind,
            "function_declaration"
                | "method_definition"
                | "class_declaration"
                | "interface_declaration"
                | "type_alias_declaration"
                | "enum_declaration"
                | "export_statement"
        ),
        "python" => matches!(kind, "function_definition" | "class_definition"),
        "rust" => matches!(
            kind,
            "function_item"
                | "impl_item"
                | "struct_item"
                | "enum_item"
                | "trait_item"
                | "mod_item"
        ),
        "go" => matches!(kind, "function_declaration" | "method_declaration" | "type_declaration"),
        _ => false,
    }
}

/// Map node kind to chunk type
fn map_node_kind(kind: &str, language: &str) -> String {
    match kind {
        "function_declaration" | "function_definition" | "function_item" => "function",
        "method_definition" | "method_declaration" => "method",
        "class_declaration" | "class_definition" => "class",
        "interface_declaration" | "trait_item" => "interface",
        "struct_item" | "type_declaration" => "type",
        "enum_declaration" | "enum_item" => "enum",
        "impl_item" => "impl",
        "mod_item" => "module",
        _ => "other",
    }
    .to_string()
}

/// Extract symbols from a node
fn extract_node_symbols(node: &tree_sitter::Node, content: &str) -> Vec<String> {
    let mut symbols = Vec::new();

    // Find identifier children
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.kind() == "identifier" || child.kind() == "type_identifier" {
            if let Ok(name) = child.utf8_text(content.as_bytes()) {
                symbols.push(name.to_string());
            }
        }
    }

    symbols
}

/// Extract a symbol from a node
fn extract_symbol(node: &tree_sitter::Node, content: &str, file_path: &str) -> Option<Symbol> {
    let kind = node.kind();

    // Only process declaration nodes
    if !is_symbol_node(kind) {
        return None;
    }

    // Find the name
    let name = find_name_child(node, content)?;

    // Check if exported
    let exported = is_exported(node, content);

    // Get signature (first line)
    let start = node.start_position();
    let end_of_sig = content[node.byte_range()]
        .find('{')
        .or_else(|| content[node.byte_range()].find(':'))
        .unwrap_or(content[node.byte_range()].len().min(100));
    let signature = content[node.start_byte()..node.start_byte() + end_of_sig]
        .trim()
        .to_string();

    Some(Symbol {
        name,
        kind: map_symbol_kind(kind),
        file_path: file_path.to_string(),
        start_line: start.row as u32 + 1,
        end_line: node.end_position().row as u32 + 1,
        signature: Some(signature),
        exported,
    })
}

/// Check if node kind defines a symbol
fn is_symbol_node(kind: &str) -> bool {
    matches!(
        kind,
        "function_declaration"
            | "function_definition"
            | "function_item"
            | "method_definition"
            | "method_declaration"
            | "class_declaration"
            | "class_definition"
            | "interface_declaration"
            | "struct_item"
            | "enum_declaration"
            | "enum_item"
            | "type_alias_declaration"
            | "trait_item"
    )
}

/// Map node kind to symbol kind
fn map_symbol_kind(kind: &str) -> String {
    match kind {
        "function_declaration" | "function_definition" | "function_item" => "function",
        "method_definition" | "method_declaration" => "method",
        "class_declaration" | "class_definition" => "class",
        "interface_declaration" | "trait_item" => "interface",
        "struct_item" => "class",
        "enum_declaration" | "enum_item" => "enum",
        "type_alias_declaration" => "type",
        _ => "variable",
    }
    .to_string()
}

/// Find name child of a node
fn find_name_child(node: &tree_sitter::Node, content: &str) -> Option<String> {
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.kind() == "identifier" || child.kind() == "type_identifier" {
            return child.utf8_text(content.as_bytes()).ok().map(|s| s.to_string());
        }
    }
    None
}

/// Check if a node is exported
fn is_exported(node: &tree_sitter::Node, content: &str) -> bool {
    // Check parent for export
    if let Some(parent) = node.parent() {
        if parent.kind() == "export_statement" {
            return true;
        }
    }

    // Check for pub keyword (Rust)
    let text = &content[node.byte_range()];
    text.starts_with("pub ") || text.starts_with("export ")
}

/// Hash content
fn hash_content(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

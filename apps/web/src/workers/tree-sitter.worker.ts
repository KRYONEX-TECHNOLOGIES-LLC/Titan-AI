/**
 * Tree-sitter Web Worker
 * Runs web-tree-sitter WASM entirely off the main thread.
 * Falls back gracefully if WASM cannot be loaded.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const self: Worker;

let Parser: any = null;
let initialized = false;

const languageParsers: Record<string, any> = {};

const LANG_WASM_MAP: Record<string, string> = {
  typescript: 'https://cdn.jsdelivr.net/npm/tree-sitter-typescript@0.20.2/tree-sitter-typescript.wasm',
  javascript: 'https://cdn.jsdelivr.net/npm/tree-sitter-javascript@0.20.0/tree-sitter-javascript.wasm',
  python: 'https://cdn.jsdelivr.net/npm/tree-sitter-python@0.20.2/tree-sitter-python.wasm',
  go: 'https://cdn.jsdelivr.net/npm/tree-sitter-go@0.20.0/tree-sitter-go.wasm',
  rust: 'https://cdn.jsdelivr.net/npm/tree-sitter-rust@0.20.3/tree-sitter-rust.wasm',
};

async function initTreeSitter() {
  try {
    const TreeSitter = await import('web-tree-sitter');
    await (TreeSitter.default ?? TreeSitter).init({
      locateFile: (path: string) =>
        `https://cdn.jsdelivr.net/npm/web-tree-sitter@0.20.8/${path}`,
    });
    Parser = (TreeSitter.default ?? TreeSitter);
    initialized = true;
    return true;
  } catch (err) {
    console.warn('[TreeSitterWorker] Could not init web-tree-sitter:', err);
    return false;
  }
}

async function getParser(language: string) {
  if (!initialized || !Parser) return null;
  if (languageParsers[language]) return languageParsers[language];

  const wasmUrl = LANG_WASM_MAP[language];
  if (!wasmUrl) return null;

  try {
    const lang = await Parser.Language.load(wasmUrl);
    const parser = new Parser();
    parser.setLanguage(lang);
    languageParsers[language] = parser;
    return parser;
  } catch {
    return null;
  }
}

function nodeToSymbol(node: any, language: string) {
  const KIND_MAP: Record<string, string> = {
    function_declaration: 'function',
    function_definition: 'function',
    arrow_function: 'function',
    method_definition: 'method',
    class_declaration: 'class',
    class_definition: 'class',
    interface_declaration: 'interface',
    type_alias_declaration: 'type',
    lexical_declaration: 'const',
    variable_declaration: 'variable',
    import_statement: 'import',
    export_statement: 'export',
  };
  return KIND_MAP[node.type] ?? null;
}

function extractSymbolsFromNode(node: any, code: string, language: string, depth = 0): any[] {
  if (depth > 8) return [];
  const symbols: any[] = [];
  const kind = nodeToSymbol(node, language);

  if (kind) {
    // Find name child
    const nameNode = node.childForFieldName?.('name') ?? node.namedChildren?.find((c: any) => c.type === 'identifier');
    const name = nameNode ? code.slice(nameNode.startIndex, nameNode.endIndex) : '';
    if (name) {
      symbols.push({
        name,
        kind,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        startColumn: node.startPosition.column,
        endColumn: node.endPosition.column,
        language,
      });
    }
  }

  for (const child of node.namedChildren ?? []) {
    symbols.push(...extractSymbolsFromNode(child, code, language, depth + 1));
  }
  return symbols;
}

function getAncestors(node: any): any[] {
  const ancestors: any[] = [];
  let current = node.parent;
  while (current) {
    ancestors.unshift(current);
    current = current.parent;
  }
  return ancestors;
}

self.onmessage = async (e) => {
  const { id, method, args } = e.data;

  try {
    let result: unknown = null;

    if (method === 'init') {
      result = await initTreeSitter();
    } else if (method === 'extractSymbols') {
      const { code, language } = args;
      const parser = await getParser(language);
      if (!parser) {
        self.postMessage({ id, result: [] });
        return;
      }
      const tree = parser.parse(code);
      result = extractSymbolsFromNode(tree.rootNode, code, language);
    } else if (method === 'getSmartSelection') {
      const { code, line, column, language } = args;
      const parser = await getParser(language);
      if (!parser) {
        self.postMessage({ id, result: [] });
        return;
      }
      const tree = parser.parse(code);
      const point = { row: line - 1, column };
      const node = tree.rootNode.descendantForPosition(point);
      if (!node) {
        self.postMessage({ id, result: [] });
        return;
      }

      const ranges = [];
      let current = node;
      while (current && current.type !== 'program' && current.type !== 'source_file') {
        ranges.push({
          startLine: current.startPosition.row + 1,
          startColumn: current.startPosition.column,
          endLine: current.endPosition.row + 1,
          endColumn: current.endPosition.column,
        });
        current = current.parent;
      }
      result = ranges;
    } else if (method === 'parse') {
      const { code, language } = args;
      const parser = await getParser(language);
      if (!parser) {
        self.postMessage({ id, result: null });
        return;
      }
      const tree = parser.parse(code);
      result = tree.rootNode.toString();
    }

    self.postMessage({ id, result });
  } catch (err: any) {
    self.postMessage({ id, result: null, error: err?.message ?? String(err) });
  }
};

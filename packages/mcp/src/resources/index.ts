/**
 * Titan AI MCP - Resource Definitions
 */

import type { MCPResource, ResourceContents } from '../types.js';

/**
 * Create a text resource
 */
export function createTextResource(
  uri: string,
  name: string,
  text: string,
  description?: string
): { definition: MCPResource; contents: ResourceContents } {
  return {
    definition: {
      uri,
      name,
      description,
      mimeType: 'text/plain',
    },
    contents: {
      uri,
      mimeType: 'text/plain',
      text,
    },
  };
}

/**
 * Create a JSON resource
 */
export function createJsonResource(
  uri: string,
  name: string,
  data: unknown,
  description?: string
): { definition: MCPResource; contents: ResourceContents } {
  return {
    definition: {
      uri,
      name,
      description,
      mimeType: 'application/json',
    },
    contents: {
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(data, null, 2),
    },
  };
}

/**
 * Create a code resource
 */
export function createCodeResource(
  uri: string,
  name: string,
  code: string,
  language: string,
  description?: string
): { definition: MCPResource; contents: ResourceContents } {
  const mimeTypes: Record<string, string> = {
    typescript: 'text/typescript',
    javascript: 'text/javascript',
    python: 'text/x-python',
    rust: 'text/x-rust',
    go: 'text/x-go',
  };

  return {
    definition: {
      uri,
      name,
      description,
      mimeType: mimeTypes[language] ?? 'text/plain',
    },
    contents: {
      uri,
      mimeType: mimeTypes[language] ?? 'text/plain',
      text: code,
    },
  };
}

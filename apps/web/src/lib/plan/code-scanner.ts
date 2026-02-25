import { callModelDirect } from '@/lib/llm-call';

export interface CodeEntry {
  path: string;
  name: string;
  description: string;
  exports: string[];
  dependencies: string[];
}

export interface CodeDirectoryData {
  routes: CodeEntry[];
  apiEndpoints: Array<CodeEntry & { method?: string }>;
  components: CodeEntry[];
  stores: CodeEntry[];
  hooks: CodeEntry[];
  types: CodeEntry[];
  configs: CodeEntry[];
  styles: CodeEntry[];
  scannedAt: number;
}

const SCANNER_PROMPT = `You are a codebase scanner. Analyze the file tree and classify every significant file.
Return ONLY valid JSON (no markdown, no code fences):
{
  "routes": [{ "path": "/login", "name": "Login", "description": "...", "file": "src/pages/Login.tsx" }],
  "apiEndpoints": [{ "path": "/api/auth", "name": "Auth API", "method": "POST", "file": "src/api/auth.ts" }],
  "components": [{ "path": "src/components/Header.tsx", "name": "Header", "description": "..." }],
  "stores": [{ "path": "src/stores/user.ts", "name": "userStore", "description": "..." }],
  "hooks": [{ "path": "src/hooks/useAuth.ts", "name": "useAuth", "description": "..." }],
  "types": [{ "path": "src/types/user.ts", "name": "User types", "description": "..." }],
  "configs": [{ "path": "tsconfig.json", "name": "TypeScript config", "description": "..." }],
  "styles": [{ "path": "src/globals.css", "name": "Global styles", "description": "..." }]
}

Rules:
- Be exhaustive: include EVERY page, route, API endpoint, component, store, hook, type file, config
- For routes: infer from file structure (pages/, app/ directories, router config)
- For API endpoints: look for route.ts, api/ directories, express/fastify route files
- Include package.json scripts as configs
- Skip node_modules, .next, dist, build directories`;

export async function scanCodebase(
  fileTree: string,
  keyFileContents?: Record<string, string>,
): Promise<CodeDirectoryData> {
  const userMsg = [
    '## File Tree',
    '```',
    fileTree.slice(0, 20000),
    '```',
    keyFileContents
      ? Object.entries(keyFileContents)
          .map(([path, content]) => `## ${path}\n\`\`\`\n${content.slice(0, 3000)}\n\`\`\``)
          .join('\n\n')
      : '',
  ].filter(Boolean).join('\n\n');

  try {
    const response = await callModelDirect(
      'google/gemini-2.0-flash-001',
      [
        { role: 'system', content: SCANNER_PROMPT },
        { role: 'user', content: userMsg },
      ],
      { temperature: 0.1, maxTokens: 8000 },
    );

    const cleaned = response.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
    let parsed: Record<string, unknown[]>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    }

    const normalize = (arr: unknown[]): CodeEntry[] =>
      (arr || []).map((item: any) => ({
        path: item.file || item.path || '',
        name: item.name || '',
        description: item.description || '',
        exports: Array.isArray(item.exports) ? item.exports : [],
        dependencies: Array.isArray(item.dependencies) ? item.dependencies : [],
      }));

    return {
      routes: normalize(parsed.routes as unknown[]),
      apiEndpoints: (parsed.apiEndpoints as any[] || []).map((item: any) => ({
        path: item.file || item.path || '',
        name: item.name || '',
        description: item.description || '',
        exports: [],
        dependencies: [],
        method: item.method || 'GET',
      })),
      components: normalize(parsed.components as unknown[]),
      stores: normalize(parsed.stores as unknown[]),
      hooks: normalize(parsed.hooks as unknown[]),
      types: normalize(parsed.types as unknown[]),
      configs: normalize(parsed.configs as unknown[]),
      styles: normalize(parsed.styles as unknown[]),
      scannedAt: Date.now(),
    };
  } catch (err) {
    console.error('[code-scanner] Scan failed:', (err as Error).message);
    return {
      routes: [], apiEndpoints: [], components: [], stores: [],
      hooks: [], types: [], configs: [], styles: [], scannedAt: Date.now(),
    };
  }
}

export function serializeDirectory(dir: CodeDirectoryData, maxChars = 4000): string {
  if (!dir || dir.scannedAt === 0) return '';
  const sections: string[] = ['=== CODE DIRECTORY ==='];

  if (dir.routes.length > 0) {
    sections.push('\n[ROUTES]');
    dir.routes.forEach(r => sections.push(`  ${r.path} -> ${r.name} (${r.description})`));
  }
  if (dir.apiEndpoints.length > 0) {
    sections.push('\n[API ENDPOINTS]');
    dir.apiEndpoints.forEach(a => sections.push(`  ${(a as any).method || 'GET'} ${a.path} -> ${a.name}`));
  }
  if (dir.components.length > 0) {
    sections.push('\n[COMPONENTS]');
    dir.components.forEach(c => sections.push(`  ${c.path} -> ${c.name}`));
  }
  if (dir.stores.length > 0) {
    sections.push('\n[STORES]');
    dir.stores.forEach(s => sections.push(`  ${s.path} -> ${s.name}`));
  }
  if (dir.hooks.length > 0) {
    sections.push('\n[HOOKS]');
    dir.hooks.forEach(h => sections.push(`  ${h.path} -> ${h.name}`));
  }

  sections.push('\n=== END DIRECTORY ===');
  let result = sections.join('\n');
  if (result.length > maxChars) result = result.slice(0, maxChars) + '\n...(truncated)';
  return result;
}

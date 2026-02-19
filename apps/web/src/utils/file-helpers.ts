export function getLanguageFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java', c: 'c', cpp: 'cpp', h: 'c',
    cs: 'csharp', rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml',
    html: 'html', css: 'css', scss: 'scss', less: 'less',
    md: 'markdown', sql: 'sql', sh: 'shell', bash: 'shell', zsh: 'shell',
    dockerfile: 'dockerfile', makefile: 'makefile', graphql: 'graphql',
    env: 'plaintext', txt: 'plaintext', log: 'plaintext',
  };
  return langMap[ext] || 'plaintext';
}

export function getFileInfo(fileName: string): { icon: string; color: string } {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts': case 'tsx': return { icon: 'TS', color: '#3178c6' };
    case 'js': case 'jsx': return { icon: 'JS', color: '#f7df1e' };
    case 'css': return { icon: 'CSS', color: '#563d7c' };
    case 'json': return { icon: '{ }', color: '#f1e05a' };
    case 'md': return { icon: 'MD', color: '#083fa1' };
    case 'py': return { icon: 'PY', color: '#3572A5' };
    case 'html': return { icon: 'HTML', color: '#e34c26' };
    case 'scss': case 'less': return { icon: 'CSS', color: '#c6538c' };
    case 'yaml': case 'yml': return { icon: 'YML', color: '#cb171e' };
    case 'env': return { icon: 'ENV', color: '#ecd53f' };
    case 'sh': case 'bash': return { icon: 'SH', color: '#89e051' };
    case 'rs': return { icon: 'RS', color: '#dea584' };
    case 'go': return { icon: 'GO', color: '#00ADD8' };
    default: return { icon: 'TXT', color: '#808080' };
  }
}

export interface ParsedResponse {
  thinking: string;
  content: string;
}

export function parseThinkingTags(rawContent: string): ParsedResponse {
  const thinkingRegex = /<thinking>([\s\S]*?)<\/thinking>/gi;
  let thinking = '';
  let content = rawContent;

  const matches = rawContent.matchAll(thinkingRegex);
  for (const match of matches) {
    thinking += (thinking ? '\n' : '') + match[1].trim();
  }

  content = rawContent.replace(thinkingRegex, '').trim();
  return { thinking, content };
}

export function extractFileBlocks(content: string): Array<{ filename: string; content: string; language: string }> {
  const fileBlockRegex = /```(\w+)?(?::([^\n]+))?\n([\s\S]*?)```/g;
  const blocks: Array<{ filename: string; content: string; language: string }> = [];

  let match;
  while ((match = fileBlockRegex.exec(content)) !== null) {
    const language = match[1] || 'text';
    const filename = match[2] || '';
    const code = match[3] || '';

    if (code.split('\n').length > 15 || filename) {
      blocks.push({
        filename: filename || `untitled.${language}`,
        content: code,
        language,
      });
    }
  }

  return blocks;
}

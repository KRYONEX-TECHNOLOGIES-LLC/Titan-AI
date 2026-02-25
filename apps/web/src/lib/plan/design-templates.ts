export interface DesignTemplate {
  id: string;
  name: string;
  tier: 'basic' | 'modern' | 'elite';
  preview: string;
  description: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    muted: string;
  };
  cssVars: Record<string, string>;
  fontFamily: string;
  borderRadius: string;
  style: string;
}

export const DESIGN_TEMPLATES: DesignTemplate[] = [
  // Basic (3)
  {
    id: 'clean-minimal',
    name: 'Clean Minimal',
    tier: 'basic',
    preview: '▢',
    description: 'Simple, clean design with lots of whitespace. Works for any project.',
    colors: { primary: '#2563eb', secondary: '#64748b', accent: '#0891b2', background: '#ffffff', surface: '#f8fafc', text: '#0f172a', muted: '#94a3b8' },
    cssVars: { '--radius': '8px', '--shadow': '0 1px 3px rgba(0,0,0,0.1)' },
    fontFamily: 'Inter, system-ui, sans-serif',
    borderRadius: '8px',
    style: 'Light and airy with subtle shadows.',
  },
  {
    id: 'dark-standard',
    name: 'Dark Standard',
    tier: 'basic',
    preview: '◼',
    description: 'Standard dark mode. Easy on the eyes, professional.',
    colors: { primary: '#3b82f6', secondary: '#6b7280', accent: '#8b5cf6', background: '#0f172a', surface: '#1e293b', text: '#f1f5f9', muted: '#64748b' },
    cssVars: { '--radius': '6px', '--shadow': '0 1px 3px rgba(0,0,0,0.3)' },
    fontFamily: 'Inter, system-ui, sans-serif',
    borderRadius: '6px',
    style: 'Deep dark with blue accents.',
  },
  {
    id: 'warm-neutral',
    name: 'Warm Neutral',
    tier: 'basic',
    preview: '◫',
    description: 'Warm tones with an inviting feel. Great for consumer apps.',
    colors: { primary: '#d97706', secondary: '#92400e', accent: '#059669', background: '#fffbeb', surface: '#fef3c7', text: '#1c1917', muted: '#78716c' },
    cssVars: { '--radius': '12px', '--shadow': '0 2px 4px rgba(0,0,0,0.06)' },
    fontFamily: "'DM Sans', system-ui, sans-serif",
    borderRadius: '12px',
    style: 'Warm ambers with emerald accents.',
  },

  // Modern (4)
  {
    id: 'glass-morphism',
    name: 'Glass Morphism',
    tier: 'modern',
    preview: '◇',
    description: 'Frosted glass effect with translucent cards and vivid gradients.',
    colors: { primary: '#6366f1', secondary: '#a855f7', accent: '#ec4899', background: '#0c0a1d', surface: 'rgba(255,255,255,0.05)', text: '#e2e8f0', muted: '#64748b' },
    cssVars: { '--radius': '16px', '--shadow': '0 8px 32px rgba(99,102,241,0.15)', '--blur': 'blur(20px)' },
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
    borderRadius: '16px',
    style: 'Translucent surfaces with purple-pink gradients and backdrop blur.',
  },
  {
    id: 'neo-brutalism',
    name: 'Neo Brutalism',
    tier: 'modern',
    preview: '▣',
    description: 'Bold borders, offset shadows, bright colors. Edgy and memorable.',
    colors: { primary: '#000000', secondary: '#fbbf24', accent: '#ef4444', background: '#fefce8', surface: '#ffffff', text: '#000000', muted: '#6b7280' },
    cssVars: { '--radius': '0px', '--shadow': '4px 4px 0px #000', '--border': '3px solid #000' },
    fontFamily: "'Space Mono', monospace",
    borderRadius: '0px',
    style: 'Thick borders, offset shadows, raw aesthetic.',
  },
  {
    id: 'aurora-gradient',
    name: 'Aurora Gradient',
    tier: 'modern',
    preview: '◈',
    description: 'Flowing gradient backgrounds inspired by the Northern Lights.',
    colors: { primary: '#06b6d4', secondary: '#8b5cf6', accent: '#10b981', background: '#030712', surface: '#111827', text: '#f9fafb', muted: '#6b7280' },
    cssVars: { '--radius': '12px', '--shadow': '0 4px 24px rgba(6,182,212,0.1)', '--gradient': 'linear-gradient(135deg, #06b6d4, #8b5cf6, #10b981)' },
    fontFamily: "'Outfit', system-ui, sans-serif",
    borderRadius: '12px',
    style: 'Flowing aurora gradients with teal-violet-emerald palette.',
  },
  {
    id: 'soft-clay',
    name: 'Soft Clay',
    tier: 'modern',
    preview: '◎',
    description: 'Neumorphic soft UI with gentle inner/outer shadows.',
    colors: { primary: '#6366f1', secondary: '#8b5cf6', accent: '#f472b6', background: '#e2e8f0', surface: '#e2e8f0', text: '#1e293b', muted: '#64748b' },
    cssVars: { '--radius': '20px', '--shadow-out': '8px 8px 16px #c5cbd3, -8px -8px 16px #ffffff', '--shadow-in': 'inset 4px 4px 8px #c5cbd3, inset -4px -4px 8px #ffffff' },
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    borderRadius: '20px',
    style: 'Soft neumorphic raised/pressed surfaces.',
  },

  // Elite — Iron Man Style (4)
  {
    id: 'stark-hud',
    name: 'Stark HUD',
    tier: 'elite',
    preview: '⬡',
    description: 'Tony Stark holographic UI. Cyan wireframes on dark backgrounds.',
    colors: { primary: '#00d4ff', secondary: '#ff6b35', accent: '#ffd700', background: '#0a0a0f', surface: 'rgba(0,212,255,0.03)', text: '#e0f7ff', muted: '#3d6b7a' },
    cssVars: { '--radius': '2px', '--shadow': '0 0 20px rgba(0,212,255,0.15)', '--border': '1px solid rgba(0,212,255,0.3)', '--glow': '0 0 10px rgba(0,212,255,0.5)' },
    fontFamily: "'Rajdhani', 'Orbitron', monospace",
    borderRadius: '2px',
    style: 'Holographic HUD with cyan glow lines, technical readouts, hexagonal accents.',
  },
  {
    id: 'arc-reactor',
    name: 'Arc Reactor',
    tier: 'elite',
    preview: '⊛',
    description: 'Pulsing arc reactor energy. Concentric rings and energy visualizations.',
    colors: { primary: '#00b8ff', secondary: '#00ff88', accent: '#ff3366', background: '#050510', surface: 'rgba(0,184,255,0.04)', text: '#c0e8ff', muted: '#2a4a5e' },
    cssVars: { '--radius': '50%', '--shadow': '0 0 30px rgba(0,184,255,0.2)', '--pulse': 'pulse 2s ease-in-out infinite', '--border': '1px solid rgba(0,184,255,0.2)' },
    fontFamily: "'Exo 2', 'Rajdhani', monospace",
    borderRadius: '8px',
    style: 'Circular/ring motifs with pulsing energy effects and radial gradients.',
  },
  {
    id: 'vibranium-mesh',
    name: 'Vibranium Mesh',
    tier: 'elite',
    preview: '⬢',
    description: 'Wakanda tech aesthetic. Hexagonal patterns with vibranium purple energy.',
    colors: { primary: '#a855f7', secondary: '#6d28d9', accent: '#c084fc', background: '#0f0520', surface: 'rgba(168,85,247,0.05)', text: '#e9d5ff', muted: '#4a2d6e' },
    cssVars: { '--radius': '4px', '--shadow': '0 0 25px rgba(168,85,247,0.15)', '--border': '1px solid rgba(168,85,247,0.25)', '--pattern': 'hexagonal' },
    fontFamily: "'Audiowide', 'Exo 2', monospace",
    borderRadius: '4px',
    style: 'Hexagonal grid patterns with deep purple energy veins and iridescent surfaces.',
  },
  {
    id: 'alfred-prime',
    name: 'Alfred Prime',
    tier: 'elite',
    preview: '◉',
    description: 'Full Alfred interface. Floating panels, scan lines, data streams.',
    colors: { primary: '#00ffcc', secondary: '#00aaff', accent: '#ffaa00', background: '#000a0f', surface: 'rgba(0,255,204,0.02)', text: '#b0ffe6', muted: '#1a4a3e' },
    cssVars: { '--radius': '0px', '--shadow': '0 0 15px rgba(0,255,204,0.1)', '--border': '1px solid rgba(0,255,204,0.2)', '--scanline': 'linear-gradient(transparent 50%, rgba(0,255,204,0.03) 50%)' },
    fontFamily: "'Share Tech Mono', 'Fira Code', monospace",
    borderRadius: '0px',
    style: 'Scan-line overlays, data readout typography, floating translucent panels, matrix-green on black.',
  },

  // Additional Elite (4)
  {
    id: 'cyber-neon',
    name: 'Cyber Neon',
    tier: 'elite',
    preview: '⊕',
    description: 'Cyberpunk 2077 inspired. Hot neon on dark chrome surfaces.',
    colors: { primary: '#ff2d6f', secondary: '#00f0ff', accent: '#ffe600', background: '#0d0221', surface: '#1a0a3e', text: '#f0e6ff', muted: '#5a3e8e' },
    cssVars: { '--radius': '2px', '--shadow': '0 0 20px rgba(255,45,111,0.3)', '--border': '1px solid rgba(255,45,111,0.4)', '--neon': 'drop-shadow(0 0 6px rgba(255,45,111,0.6))' },
    fontFamily: "'Orbitron', 'Rajdhani', monospace",
    borderRadius: '2px',
    style: 'Hot pink neon on deep purple-black. Chrome accents and sharp angles.',
  },
  {
    id: 'quantum-field',
    name: 'Quantum Field',
    tier: 'elite',
    preview: '⊗',
    description: 'Quantum computing visualization. Particle fields and probability clouds.',
    colors: { primary: '#4ade80', secondary: '#22d3ee', accent: '#f472b6', background: '#020617', surface: 'rgba(74,222,128,0.03)', text: '#d1fae5', muted: '#1a3a2e' },
    cssVars: { '--radius': '4px', '--shadow': '0 0 20px rgba(74,222,128,0.1)', '--border': '1px solid rgba(74,222,128,0.15)' },
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    borderRadius: '4px',
    style: 'Particle dots, probability wave backgrounds, quantum-green on void-black.',
  },
  {
    id: 'obsidian-forge',
    name: 'Obsidian Forge',
    tier: 'elite',
    preview: '⬤',
    description: 'Dark forged metal with ember accents. Raw power aesthetic.',
    colors: { primary: '#f97316', secondary: '#dc2626', accent: '#fbbf24', background: '#0c0a09', surface: '#1c1917', text: '#fafaf9', muted: '#57534e' },
    cssVars: { '--radius': '4px', '--shadow': '0 4px 16px rgba(249,115,22,0.1)', '--border': '1px solid rgba(249,115,22,0.2)' },
    fontFamily: "'Rajdhani', 'Exo 2', system-ui",
    borderRadius: '4px',
    style: 'Forged metal textures, ember-orange glow, dark stone backgrounds.',
  },
  {
    id: 'matrix-rain',
    name: 'Matrix Rain',
    tier: 'elite',
    preview: '⊞',
    description: 'The Matrix digital rain. Green phosphor on black. Pure code aesthetic.',
    colors: { primary: '#00ff41', secondary: '#008f11', accent: '#00ff41', background: '#000000', surface: 'rgba(0,255,65,0.02)', text: '#00ff41', muted: '#003b00' },
    cssVars: { '--radius': '0px', '--shadow': '0 0 10px rgba(0,255,65,0.2)', '--border': '1px solid rgba(0,255,65,0.15)', '--rain': 'matrix-rain 10s linear infinite' },
    fontFamily: "'Share Tech Mono', 'Courier New', monospace",
    borderRadius: '0px',
    style: 'Green phosphor text, black background, digital rain overlay, CRT scanlines.',
  },
];

export function getTemplate(id: string): DesignTemplate | undefined {
  return DESIGN_TEMPLATES.find(t => t.id === id);
}

export function getTemplatesByTier(tier: 'basic' | 'modern' | 'elite'): DesignTemplate[] {
  return DESIGN_TEMPLATES.filter(t => t.tier === tier);
}

export function customizeTemplateColors(
  template: DesignTemplate,
  overrides: Partial<DesignTemplate['colors']>,
): DesignTemplate {
  return {
    ...template,
    colors: { ...template.colors, ...overrides },
    id: `${template.id}-custom`,
    name: `${template.name} (Custom)`,
  };
}

export function templateToCSS(template: DesignTemplate): string {
  const { colors, cssVars, fontFamily, borderRadius } = template;
  const vars = [
    `--color-primary: ${colors.primary};`,
    `--color-secondary: ${colors.secondary};`,
    `--color-accent: ${colors.accent};`,
    `--color-bg: ${colors.background};`,
    `--color-surface: ${colors.surface};`,
    `--color-text: ${colors.text};`,
    `--color-muted: ${colors.muted};`,
    `--font-family: ${fontFamily};`,
    `--border-radius: ${borderRadius};`,
    ...Object.entries(cssVars).map(([k, v]) => `${k}: ${v};`),
  ];
  return `:root {\n  ${vars.join('\n  ')}\n}`;
}

export function templateToPromptDirective(template: DesignTemplate): string {
  return [
    `DESIGN TEMPLATE: ${template.name} (${template.tier})`,
    `STYLE: ${template.style}`,
    `COLORS: primary=${template.colors.primary}, secondary=${template.colors.secondary}, accent=${template.colors.accent}, bg=${template.colors.background}`,
    `FONT: ${template.fontFamily}`,
    `RADIUS: ${template.borderRadius}`,
    `DIRECTIVE: Apply this visual style to ALL UI elements. Use these exact colors, font, and border-radius. Create a cohesive ${template.tier}-tier design.`,
  ].join('\n');
}

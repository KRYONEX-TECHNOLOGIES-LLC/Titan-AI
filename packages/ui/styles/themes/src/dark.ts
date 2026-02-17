// Dark Theme
// packages/ui/styles/themes/src/dark.ts

import { Theme } from './types';

export const darkTheme: Theme = {
  name: 'Dark',
  id: 'titan-dark-default',
  type: 'dark',
  colors: {
    // Primary colors
    primary: '#0ea5e9',
    primaryForeground: '#ffffff',
    primaryHover: '#0284c7',

    // Secondary colors
    secondary: '#1e293b',
    secondaryForeground: '#f8fafc',
    secondaryHover: '#334155',

    // Accent colors
    accent: '#8b5cf6',
    accentForeground: '#ffffff',
    accentHover: '#7c3aed',

    // Background colors
    background: '#0f172a',
    backgroundAlt: '#1e293b',
    backgroundHover: '#334155',

    // Foreground colors
    foreground: '#f8fafc',
    foregroundMuted: '#94a3b8',
    foregroundSubtle: '#64748b',

    // Border colors
    border: '#334155',
    borderHover: '#475569',
    borderFocus: '#0ea5e9',

    // Status colors
    success: '#22c55e',
    successForeground: '#ffffff',
    warning: '#f59e0b',
    warningForeground: '#000000',
    error: '#ef4444',
    errorForeground: '#ffffff',
    info: '#3b82f6',
    infoForeground: '#ffffff',

    // Editor colors
    editor: {
      background: '#0f172a',
      foreground: '#e2e8f0',
      lineHighlight: '#1e293b',
      selection: '#3b82f640',
      selectionHighlight: '#3b82f620',
      cursor: '#0ea5e9',
      cursorLine: '#1e293b',
      lineNumber: '#64748b',
      lineNumberActive: '#e2e8f0',
      gutter: '#0f172a',
      gutterActive: '#1e293b',
      minimap: '#1e293b',
      minimapSlider: '#3b82f640',
      bracketMatch: '#3b82f640',
      indentGuide: '#334155',
      indentGuideActive: '#475569',
      whitespace: '#334155',
      wordHighlight: '#3b82f620',
      wordHighlightStrong: '#3b82f640',
    },

    // Terminal colors
    terminal: {
      background: '#0f172a',
      foreground: '#e2e8f0',
      cursor: '#0ea5e9',
      cursorAccent: '#0f172a',
      selection: '#3b82f640',
      black: '#1e293b',
      red: '#ef4444',
      green: '#22c55e',
      yellow: '#f59e0b',
      blue: '#3b82f6',
      magenta: '#a855f7',
      cyan: '#06b6d4',
      white: '#f1f5f9',
      brightBlack: '#475569',
      brightRed: '#f87171',
      brightGreen: '#4ade80',
      brightYellow: '#fbbf24',
      brightBlue: '#60a5fa',
      brightMagenta: '#c084fc',
      brightCyan: '#22d3ee',
      brightWhite: '#ffffff',
    },

    // Sidebar colors
    sidebar: {
      background: '#0f172a',
      foreground: '#e2e8f0',
      border: '#1e293b',
      headerBackground: '#1e293b',
      headerForeground: '#f8fafc',
      sectionBackground: '#0f172a',
      sectionForeground: '#94a3b8',
      itemHover: '#1e293b',
      itemActive: '#334155',
      itemActiveForeground: '#f8fafc',
    },

    // Status bar colors
    statusBar: {
      background: '#1e293b',
      foreground: '#94a3b8',
      border: '#334155',
      itemHover: '#334155',
      debuggingBackground: '#f59e0b',
      debuggingForeground: '#000000',
      noFolderBackground: '#8b5cf6',
      noFolderForeground: '#ffffff',
    },

    // AI-specific colors
    ai: {
      accent: '#0ea5e9',
      accentHover: '#0284c7',
      thinking: '#f59e0b',
      generating: '#22c55e',
      success: '#22c55e',
      error: '#ef4444',
      suggestionBackground: '#1e293b',
      suggestionBorder: '#334155',
      diffAdded: '#22c55e20',
      diffRemoved: '#ef444420',
      diffModified: '#3b82f620',
      codeBlockBackground: '#1e293b',
      codeBlockBorder: '#334155',
    },
  },

  fonts: {
    sans: 'Inter, system-ui, -apple-system, sans-serif',
    mono: 'JetBrains Mono, Fira Code, Menlo, Monaco, monospace',
    sizeBase: '14px',
    sizeSmall: '12px',
    sizeLarge: '16px',
    lineHeight: '1.5',
  },

  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
  },

  borders: {
    radius: '6px',
    radiusSmall: '4px',
    radiusLarge: '8px',
    width: '1px',
  },

  shadows: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    focus: '0 0 0 2px rgb(14 165 233 / 0.5)',
  },
};

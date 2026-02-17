// Light Theme
// packages/ui/styles/themes/src/light.ts

import { Theme } from './types';

export const lightTheme: Theme = {
  name: 'Light',
  id: 'titan-light-default',
  type: 'light',
  colors: {
    // Primary colors
    primary: '#0284c7',
    primaryForeground: '#ffffff',
    primaryHover: '#0369a1',

    // Secondary colors
    secondary: '#f1f5f9',
    secondaryForeground: '#0f172a',
    secondaryHover: '#e2e8f0',

    // Accent colors
    accent: '#7c3aed',
    accentForeground: '#ffffff',
    accentHover: '#6d28d9',

    // Background colors
    background: '#ffffff',
    backgroundAlt: '#f8fafc',
    backgroundHover: '#f1f5f9',

    // Foreground colors
    foreground: '#0f172a',
    foregroundMuted: '#475569',
    foregroundSubtle: '#94a3b8',

    // Border colors
    border: '#e2e8f0',
    borderHover: '#cbd5e1',
    borderFocus: '#0284c7',

    // Status colors
    success: '#16a34a',
    successForeground: '#ffffff',
    warning: '#d97706',
    warningForeground: '#ffffff',
    error: '#dc2626',
    errorForeground: '#ffffff',
    info: '#2563eb',
    infoForeground: '#ffffff',

    // Editor colors
    editor: {
      background: '#ffffff',
      foreground: '#0f172a',
      lineHighlight: '#f8fafc',
      selection: '#3b82f640',
      selectionHighlight: '#3b82f620',
      cursor: '#0284c7',
      cursorLine: '#f8fafc',
      lineNumber: '#94a3b8',
      lineNumberActive: '#0f172a',
      gutter: '#ffffff',
      gutterActive: '#f8fafc',
      minimap: '#f1f5f9',
      minimapSlider: '#3b82f640',
      bracketMatch: '#3b82f640',
      indentGuide: '#e2e8f0',
      indentGuideActive: '#cbd5e1',
      whitespace: '#e2e8f0',
      wordHighlight: '#3b82f620',
      wordHighlightStrong: '#3b82f640',
    },

    // Terminal colors
    terminal: {
      background: '#ffffff',
      foreground: '#0f172a',
      cursor: '#0284c7',
      cursorAccent: '#ffffff',
      selection: '#3b82f640',
      black: '#0f172a',
      red: '#dc2626',
      green: '#16a34a',
      yellow: '#d97706',
      blue: '#2563eb',
      magenta: '#9333ea',
      cyan: '#0891b2',
      white: '#f8fafc',
      brightBlack: '#475569',
      brightRed: '#ef4444',
      brightGreen: '#22c55e',
      brightYellow: '#f59e0b',
      brightBlue: '#3b82f6',
      brightMagenta: '#a855f7',
      brightCyan: '#06b6d4',
      brightWhite: '#ffffff',
    },

    // Sidebar colors
    sidebar: {
      background: '#f8fafc',
      foreground: '#0f172a',
      border: '#e2e8f0',
      headerBackground: '#f1f5f9',
      headerForeground: '#0f172a',
      sectionBackground: '#f8fafc',
      sectionForeground: '#475569',
      itemHover: '#f1f5f9',
      itemActive: '#e2e8f0',
      itemActiveForeground: '#0f172a',
    },

    // Status bar colors
    statusBar: {
      background: '#0284c7',
      foreground: '#ffffff',
      border: '#0369a1',
      itemHover: '#0369a1',
      debuggingBackground: '#d97706',
      debuggingForeground: '#ffffff',
      noFolderBackground: '#7c3aed',
      noFolderForeground: '#ffffff',
    },

    // AI-specific colors
    ai: {
      accent: '#0284c7',
      accentHover: '#0369a1',
      thinking: '#d97706',
      generating: '#16a34a',
      success: '#16a34a',
      error: '#dc2626',
      suggestionBackground: '#f8fafc',
      suggestionBorder: '#e2e8f0',
      diffAdded: '#16a34a20',
      diffRemoved: '#dc262620',
      diffModified: '#2563eb20',
      codeBlockBackground: '#f8fafc',
      codeBlockBorder: '#e2e8f0',
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
    focus: '0 0 0 2px rgb(2 132 199 / 0.5)',
  },
};

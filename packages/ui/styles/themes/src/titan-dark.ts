// Titan Dark Theme - The signature Titan AI theme
// packages/ui/styles/themes/src/titan-dark.ts

import { Theme } from './types';

export const titanDarkTheme: Theme = {
  name: 'Titan Dark',
  id: 'titan-dark-signature',
  type: 'dark',
  colors: {
    // Primary colors - Titan blue/cyan
    primary: '#00d9ff',
    primaryForeground: '#000000',
    primaryHover: '#00b8d9',

    // Secondary colors - Deep purple
    secondary: '#1a1a2e',
    secondaryForeground: '#e0e0ff',
    secondaryHover: '#252542',

    // Accent colors - Electric purple
    accent: '#a855f7',
    accentForeground: '#ffffff',
    accentHover: '#9333ea',

    // Background colors - Deep space
    background: '#0a0a14',
    backgroundAlt: '#12121f',
    backgroundHover: '#1a1a2e',

    // Foreground colors
    foreground: '#e0e0ff',
    foregroundMuted: '#8b8ba7',
    foregroundSubtle: '#5a5a7a',

    // Border colors
    border: '#252542',
    borderHover: '#3a3a5c',
    borderFocus: '#00d9ff',

    // Status colors
    success: '#00ff88',
    successForeground: '#000000',
    warning: '#ffaa00',
    warningForeground: '#000000',
    error: '#ff4466',
    errorForeground: '#ffffff',
    info: '#00aaff',
    infoForeground: '#000000',

    // Editor colors
    editor: {
      background: '#0a0a14',
      foreground: '#e0e0ff',
      lineHighlight: '#12121f',
      selection: '#00d9ff30',
      selectionHighlight: '#00d9ff15',
      cursor: '#00d9ff',
      cursorLine: '#12121f',
      lineNumber: '#5a5a7a',
      lineNumberActive: '#e0e0ff',
      gutter: '#0a0a14',
      gutterActive: '#12121f',
      minimap: '#12121f',
      minimapSlider: '#00d9ff30',
      bracketMatch: '#00d9ff40',
      indentGuide: '#252542',
      indentGuideActive: '#3a3a5c',
      whitespace: '#252542',
      wordHighlight: '#a855f720',
      wordHighlightStrong: '#a855f740',
    },

    // Terminal colors - Vibrant
    terminal: {
      background: '#0a0a14',
      foreground: '#e0e0ff',
      cursor: '#00d9ff',
      cursorAccent: '#0a0a14',
      selection: '#00d9ff30',
      black: '#12121f',
      red: '#ff4466',
      green: '#00ff88',
      yellow: '#ffaa00',
      blue: '#00aaff',
      magenta: '#a855f7',
      cyan: '#00d9ff',
      white: '#e0e0ff',
      brightBlack: '#5a5a7a',
      brightRed: '#ff6688',
      brightGreen: '#44ffaa',
      brightYellow: '#ffcc44',
      brightBlue: '#44ccff',
      brightMagenta: '#c084fc',
      brightCyan: '#44eeff',
      brightWhite: '#ffffff',
    },

    // Sidebar colors
    sidebar: {
      background: '#0a0a14',
      foreground: '#e0e0ff',
      border: '#1a1a2e',
      headerBackground: '#12121f',
      headerForeground: '#e0e0ff',
      sectionBackground: '#0a0a14',
      sectionForeground: '#8b8ba7',
      itemHover: '#1a1a2e',
      itemActive: '#252542',
      itemActiveForeground: '#00d9ff',
    },

    // Status bar colors - Titan gradient feel
    statusBar: {
      background: '#12121f',
      foreground: '#8b8ba7',
      border: '#1a1a2e',
      itemHover: '#1a1a2e',
      debuggingBackground: '#ffaa00',
      debuggingForeground: '#000000',
      noFolderBackground: '#a855f7',
      noFolderForeground: '#ffffff',
    },

    // AI-specific colors - Titan signature
    ai: {
      accent: '#00d9ff',
      accentHover: '#00b8d9',
      thinking: '#ffaa00',
      generating: '#00ff88',
      success: '#00ff88',
      error: '#ff4466',
      suggestionBackground: '#12121f',
      suggestionBorder: '#00d9ff30',
      diffAdded: '#00ff8820',
      diffRemoved: '#ff446620',
      diffModified: '#00aaff20',
      codeBlockBackground: '#12121f',
      codeBlockBorder: '#252542',
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
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.3)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.4), 0 2px 4px -2px rgb(0 0 0 / 0.3)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.4), 0 4px 6px -4px rgb(0 0 0 / 0.3)',
    focus: '0 0 0 2px rgb(0 217 255 / 0.5)',
  },
};

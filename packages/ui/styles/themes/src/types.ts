// Theme Types
// packages/ui/styles/themes/src/types.ts

export interface Theme {
  name: string;
  id: string;
  type: 'dark' | 'light';
  colors: ThemeColors;
  fonts: ThemeFonts;
  spacing: ThemeSpacing;
  borders: ThemeBorders;
  shadows: ThemeShadows;
}

export interface ThemeColors {
  // Primary colors
  primary: string;
  primaryForeground: string;
  primaryHover: string;

  // Secondary colors
  secondary: string;
  secondaryForeground: string;
  secondaryHover: string;

  // Accent colors
  accent: string;
  accentForeground: string;
  accentHover: string;

  // Background colors
  background: string;
  backgroundAlt: string;
  backgroundHover: string;

  // Foreground colors
  foreground: string;
  foregroundMuted: string;
  foregroundSubtle: string;

  // Border colors
  border: string;
  borderHover: string;
  borderFocus: string;

  // Status colors
  success: string;
  successForeground: string;
  warning: string;
  warningForeground: string;
  error: string;
  errorForeground: string;
  info: string;
  infoForeground: string;

  // Editor colors
  editor: EditorColors;

  // Terminal colors
  terminal: TerminalColors;

  // Sidebar colors
  sidebar: SidebarColors;

  // Status bar colors
  statusBar: StatusBarColors;

  // AI-specific colors
  ai: AIColors;
}

export interface EditorColors {
  background: string;
  foreground: string;
  lineHighlight: string;
  selection: string;
  selectionHighlight: string;
  cursor: string;
  cursorLine: string;
  lineNumber: string;
  lineNumberActive: string;
  gutter: string;
  gutterActive: string;
  minimap: string;
  minimapSlider: string;
  bracketMatch: string;
  indentGuide: string;
  indentGuideActive: string;
  whitespace: string;
  wordHighlight: string;
  wordHighlightStrong: string;
}

export interface TerminalColors {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selection: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface SidebarColors {
  background: string;
  foreground: string;
  border: string;
  headerBackground: string;
  headerForeground: string;
  sectionBackground: string;
  sectionForeground: string;
  itemHover: string;
  itemActive: string;
  itemActiveForeground: string;
}

export interface StatusBarColors {
  background: string;
  foreground: string;
  border: string;
  itemHover: string;
  debuggingBackground: string;
  debuggingForeground: string;
  noFolderBackground: string;
  noFolderForeground: string;
}

export interface AIColors {
  accent: string;
  accentHover: string;
  thinking: string;
  generating: string;
  success: string;
  error: string;
  suggestionBackground: string;
  suggestionBorder: string;
  diffAdded: string;
  diffRemoved: string;
  diffModified: string;
  codeBlockBackground: string;
  codeBlockBorder: string;
}

export interface ThemeFonts {
  sans: string;
  mono: string;
  sizeBase: string;
  sizeSmall: string;
  sizeLarge: string;
  lineHeight: string;
}

export interface ThemeSpacing {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
}

export interface ThemeBorders {
  radius: string;
  radiusSmall: string;
  radiusLarge: string;
  width: string;
}

export interface ThemeShadows {
  sm: string;
  md: string;
  lg: string;
  focus: string;
}

export interface ThemeToken {
  scope: string | string[];
  settings: {
    foreground?: string;
    background?: string;
    fontStyle?: 'italic' | 'bold' | 'underline' | 'strikethrough' | string;
  };
}

export interface SyntaxTheme {
  colors: ThemeColors;
  tokenColors: ThemeToken[];
}

// Theme Manager
// packages/ui/styles/themes/src/theme-manager.ts

import { Theme, ThemeColors } from './types';
import { darkTheme } from './dark';
import { lightTheme } from './light';
import { titanDarkTheme } from './titan-dark';

export class ThemeManager {
  private static instance: ThemeManager;
  private currentTheme: Theme;
  private themes: Map<string, Theme>;
  private listeners: Set<(theme: Theme) => void>;

  private constructor() {
    this.themes = new Map();
    this.listeners = new Set();
    
    // Register built-in themes
    this.registerTheme(darkTheme);
    this.registerTheme(lightTheme);
    this.registerTheme(titanDarkTheme);
    
    // Set default theme
    this.currentTheme = titanDarkTheme;
  }

  static getInstance(): ThemeManager {
    if (!ThemeManager.instance) {
      ThemeManager.instance = new ThemeManager();
    }
    return ThemeManager.instance;
  }

  registerTheme(theme: Theme): void {
    this.themes.set(theme.id, theme);
  }

  unregisterTheme(themeId: string): boolean {
    return this.themes.delete(themeId);
  }

  getTheme(themeId: string): Theme | undefined {
    return this.themes.get(themeId);
  }

  getAllThemes(): Theme[] {
    return Array.from(this.themes.values());
  }

  getDarkThemes(): Theme[] {
    return this.getAllThemes().filter(t => t.type === 'dark');
  }

  getLightThemes(): Theme[] {
    return this.getAllThemes().filter(t => t.type === 'light');
  }

  getCurrentTheme(): Theme {
    return this.currentTheme;
  }

  setTheme(themeId: string): boolean {
    const theme = this.themes.get(themeId);
    if (!theme) return false;

    this.currentTheme = theme;
    this.applyTheme(theme);
    this.notifyListeners();
    return true;
  }

  onThemeChange(listener: (theme: Theme) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.currentTheme));
  }

  private applyTheme(theme: Theme): void {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    
    // Apply color variables
    this.applyCSSVariables(root, theme.colors, '--titan');
    
    // Apply font variables
    root.style.setProperty('--titan-font-sans', theme.fonts.sans);
    root.style.setProperty('--titan-font-mono', theme.fonts.mono);
    root.style.setProperty('--titan-font-size-base', theme.fonts.sizeBase);
    root.style.setProperty('--titan-font-size-small', theme.fonts.sizeSmall);
    root.style.setProperty('--titan-font-size-large', theme.fonts.sizeLarge);
    root.style.setProperty('--titan-line-height', theme.fonts.lineHeight);
    
    // Apply spacing variables
    root.style.setProperty('--titan-spacing-xs', theme.spacing.xs);
    root.style.setProperty('--titan-spacing-sm', theme.spacing.sm);
    root.style.setProperty('--titan-spacing-md', theme.spacing.md);
    root.style.setProperty('--titan-spacing-lg', theme.spacing.lg);
    root.style.setProperty('--titan-spacing-xl', theme.spacing.xl);
    
    // Apply border variables
    root.style.setProperty('--titan-border-radius', theme.borders.radius);
    root.style.setProperty('--titan-border-radius-small', theme.borders.radiusSmall);
    root.style.setProperty('--titan-border-radius-large', theme.borders.radiusLarge);
    root.style.setProperty('--titan-border-width', theme.borders.width);
    
    // Apply shadow variables
    root.style.setProperty('--titan-shadow-sm', theme.shadows.sm);
    root.style.setProperty('--titan-shadow-md', theme.shadows.md);
    root.style.setProperty('--titan-shadow-lg', theme.shadows.lg);
    root.style.setProperty('--titan-shadow-focus', theme.shadows.focus);

    // Set color scheme for native elements
    root.setAttribute('data-theme', theme.id);
    root.setAttribute('data-theme-type', theme.type);
    root.style.colorScheme = theme.type;
  }

  private applyCSSVariables(
    element: HTMLElement,
    obj: Record<string, any>,
    prefix: string
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      const cssKey = `${prefix}-${this.camelToKebab(key)}`;
      
      if (typeof value === 'object' && value !== null) {
        this.applyCSSVariables(element, value, cssKey);
      } else {
        element.style.setProperty(cssKey, value);
      }
    }
  }

  private camelToKebab(str: string): string {
    return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  }

  // Generate CSS from theme
  generateCSS(theme: Theme): string {
    const lines: string[] = [':root {'];
    
    const addVariables = (obj: Record<string, any>, prefix: string) => {
      for (const [key, value] of Object.entries(obj)) {
        const cssKey = `${prefix}-${this.camelToKebab(key)}`;
        
        if (typeof value === 'object' && value !== null) {
          addVariables(value, cssKey);
        } else {
          lines.push(`  ${cssKey}: ${value};`);
        }
      }
    };

    addVariables(theme.colors, '--titan');
    
    lines.push(`  --titan-font-sans: ${theme.fonts.sans};`);
    lines.push(`  --titan-font-mono: ${theme.fonts.mono};`);
    lines.push(`  --titan-font-size-base: ${theme.fonts.sizeBase};`);
    lines.push(`  --titan-font-size-small: ${theme.fonts.sizeSmall};`);
    lines.push(`  --titan-font-size-large: ${theme.fonts.sizeLarge};`);
    lines.push(`  --titan-line-height: ${theme.fonts.lineHeight};`);
    
    lines.push(`  --titan-spacing-xs: ${theme.spacing.xs};`);
    lines.push(`  --titan-spacing-sm: ${theme.spacing.sm};`);
    lines.push(`  --titan-spacing-md: ${theme.spacing.md};`);
    lines.push(`  --titan-spacing-lg: ${theme.spacing.lg};`);
    lines.push(`  --titan-spacing-xl: ${theme.spacing.xl};`);
    
    lines.push(`  --titan-border-radius: ${theme.borders.radius};`);
    lines.push(`  --titan-border-radius-small: ${theme.borders.radiusSmall};`);
    lines.push(`  --titan-border-radius-large: ${theme.borders.radiusLarge};`);
    lines.push(`  --titan-border-width: ${theme.borders.width};`);
    
    lines.push(`  --titan-shadow-sm: ${theme.shadows.sm};`);
    lines.push(`  --titan-shadow-md: ${theme.shadows.md};`);
    lines.push(`  --titan-shadow-lg: ${theme.shadows.lg};`);
    lines.push(`  --titan-shadow-focus: ${theme.shadows.focus};`);
    
    lines.push(`  color-scheme: ${theme.type};`);
    lines.push('}');

    return lines.join('\n');
  }
}

// Export singleton instance helpers
export function getThemeManager(): ThemeManager {
  return ThemeManager.getInstance();
}

export function setTheme(themeId: string): boolean {
  return ThemeManager.getInstance().setTheme(themeId);
}

export function getCurrentTheme(): Theme {
  return ThemeManager.getInstance().getCurrentTheme();
}

export function getAllThemes(): Theme[] {
  return ThemeManager.getInstance().getAllThemes();
}

// React hook for theme (to be used with React)
export function createThemeContext() {
  const manager = ThemeManager.getInstance();
  
  return {
    theme: manager.getCurrentTheme(),
    setTheme: (id: string) => manager.setTheme(id),
    themes: manager.getAllThemes(),
  };
}

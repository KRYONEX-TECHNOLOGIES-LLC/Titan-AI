/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Titan AI color scheme
        titan: {
          primary: 'var(--titan-primary)',
          secondary: 'var(--titan-secondary)',
          accent: 'var(--titan-accent)',
          background: 'var(--titan-background)',
          foreground: 'var(--titan-foreground)',
        },
        // Editor colors
        editor: {
          background: 'var(--titan-editor-background)',
          foreground: 'var(--titan-editor-foreground)',
          selection: 'var(--titan-editor-selection)',
          cursor: 'var(--titan-editor-cursor)',
        },
        // AI-specific colors
        ai: {
          accent: 'var(--titan-ai-accent)',
          thinking: 'var(--titan-ai-thinking)',
          generating: 'var(--titan-ai-generating)',
          success: 'var(--titan-ai-success)',
          error: 'var(--titan-ai-error)',
        },
      },
      fontFamily: {
        sans: ['var(--titan-font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--titan-font-mono)', 'monospace'],
      },
      spacing: {
        'titan-xs': 'var(--titan-spacing-xs)',
        'titan-sm': 'var(--titan-spacing-sm)',
        'titan-md': 'var(--titan-spacing-md)',
        'titan-lg': 'var(--titan-spacing-lg)',
        'titan-xl': 'var(--titan-spacing-xl)',
      },
      borderRadius: {
        titan: 'var(--titan-border-radius)',
        'titan-sm': 'var(--titan-border-radius-small)',
        'titan-lg': 'var(--titan-border-radius-large)',
      },
      boxShadow: {
        'titan-sm': 'var(--titan-shadow-sm)',
        'titan-md': 'var(--titan-shadow-md)',
        'titan-lg': 'var(--titan-shadow-lg)',
        'titan-focus': 'var(--titan-shadow-focus)',
      },
    },
  },
  plugins: [],
};

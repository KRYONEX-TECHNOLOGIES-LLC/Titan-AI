/**
 * Titan AI - Tailwind CSS Preset
 * Shared design system configuration
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        // Titan AI Brand Colors
        titan: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
        // Editor theme colors
        editor: {
          bg: 'var(--editor-bg)',
          fg: 'var(--editor-fg)',
          selection: 'var(--editor-selection)',
          line: 'var(--editor-line)',
          comment: 'var(--editor-comment)',
          keyword: 'var(--editor-keyword)',
          string: 'var(--editor-string)',
          function: 'var(--editor-function)',
          variable: 'var(--editor-variable)',
          type: 'var(--editor-type)',
        },
        // UI semantic colors
        ui: {
          bg: {
            primary: 'var(--ui-bg-primary)',
            secondary: 'var(--ui-bg-secondary)',
            tertiary: 'var(--ui-bg-tertiary)',
          },
          border: {
            DEFAULT: 'var(--ui-border)',
            focus: 'var(--ui-border-focus)',
          },
          text: {
            primary: 'var(--ui-text-primary)',
            secondary: 'var(--ui-text-secondary)',
            muted: 'var(--ui-text-muted)',
          },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      spacing: {
        '4.5': '1.125rem',
        '13': '3.25rem',
        '15': '3.75rem',
        '18': '4.5rem',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 2s linear infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'slide-down': 'slideDown 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      boxShadow: {
        'panel': '0 2px 8px rgba(0, 0, 0, 0.15)',
        'dropdown': '0 4px 12px rgba(0, 0, 0, 0.2)',
        'modal': '0 8px 24px rgba(0, 0, 0, 0.25)',
      },
      borderRadius: {
        'panel': '0.375rem',
      },
      zIndex: {
        'dropdown': '100',
        'modal': '200',
        'tooltip': '300',
        'toast': '400',
      },
    },
  },
  plugins: [],
};

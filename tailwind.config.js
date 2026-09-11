/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/index.html',
    './src/renderer/**/*.{js,ts,jsx,tsx}',
    './src/shared/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        // Theme-aware surface colors (use CSS variables)
        surface: {
          DEFAULT: 'var(--color-surface)',
          raised: 'var(--color-surface-raised)',
          overlay: 'var(--color-surface-overlay)',
          sidebar: 'var(--color-surface-sidebar)',
          code: 'var(--code-bg)',  // Deep black for code blocks
        },
        // Theme-aware border colors (use CSS variables)
        border: {
          DEFAULT: 'var(--color-border)',
          subtle: 'var(--color-border-subtle)',
          emphasis: 'var(--color-border-emphasis)',
        },
        // Theme-aware text colors (use CSS variables)
        text: {
          DEFAULT: 'var(--color-text)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
        },
        // Semantic colors (only for status, not containers)
        semantic: {
          success: '#22c55e',  // green-500
          error: '#ef4444',    // red-500
          warning: '#f59e0b',  // amber-500
          info: '#3b82f6',     // blue-500
        },
        // Theme-aware accent color (driven by the active colorway)
        accent: {
          DEFAULT: 'var(--color-accent)',
          fg: 'var(--color-accent-fg)',
          subtle: 'var(--color-accent-subtle)',
          ring: 'var(--color-accent-ring)',
        },
        // Theme-aware colors using CSS variables
        // These aliases enable all existing components to automatically support light/dark mode
        'claude-dark': {
          bg: 'var(--color-surface)',
          surface: 'var(--color-surface-raised)',
          border: 'var(--color-border)',
          text: 'var(--color-text)',
          'text-secondary': 'var(--color-text-secondary)'
        }
      },
      // Softer, rounder default — matches the redesigned surfaces
      borderRadius: {
        DEFAULT: '6px',
        lg: '10px',
      },
      // Density scale: list rows read at 13px, metadata at 11px
      fontSize: {
        xs: ['13px', '18px'],
        '2xs': ['11px', '15px'],
      }
    }
  },
  plugins: [
    require('@tailwindcss/typography')
  ]
}

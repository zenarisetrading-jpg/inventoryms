import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Map to theme variables for premium operator interface
        sidebar: 'var(--sidebar-bg)',
        body: 'var(--body-bg)',
        card: 'var(--card-bg)',
        'brand-blue': 'var(--brand-blue)',
        'brand-amber': 'var(--brand-amber)',
        'primary': 'var(--primary-text)',
        'muted': 'var(--muted-text)',
        'border-color': 'var(--border-color)',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        data: ['JetBrains Mono', 'Roboto Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config

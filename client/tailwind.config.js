/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#070b14',
          panel: '#0d1527',
          panelBorder: '#1e293b',
          glowCyan: '#00f3ff',
          glowAmber: '#f59e0b',
          glowPink: '#ec4899',
          glowGreen: '#10b981',
          textMuted: '#64748b'
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'Menlo', 'Consolas', 'monospace']
      },
      boxShadow: {
        'glow-cyan': '0 0 25px -5px rgba(0, 243, 255, 0.4)',
        'glow-amber': '0 0 25px -5px rgba(245, 158, 11, 0.4)',
        'glow-green': '0 0 25px -5px rgba(16, 185, 129, 0.4)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 20s linear infinite',
      }
    },
  },
  plugins: [],
}

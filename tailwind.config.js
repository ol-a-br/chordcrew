/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ChordCrew design system
        surface: {
          0: '#0d1117',   // app background
          1: '#161b22',   // card / panel
          2: '#21262d',   // elevated surface
          3: '#30363d',   // border / divider
        },
        ink: {
          DEFAULT: '#e6edf3',
          muted: '#8b949e',
          faint: '#484f58',
        },
        // Chord colour — amber, warm and musical
        chord: {
          DEFAULT: '#f59e0b',
          light: '#fbbf24',
          dark: '#d97706',
        },
        // Section label colour
        section: '#38bdf8',
      },
      fontFamily: {
        ui: ['Outfit', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}

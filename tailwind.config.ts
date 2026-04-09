/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:      '#080810',
        panel:   '#10101a',
        raised:  '#181825',
        muted:   '#1e1e30',
        t1:      '#ededed',
        t2:      '#888888',
        t3:      '#555555',
        green:   '#22c55e',
        blue:    '#3b82f6',
        purple:  '#a78bfa',
        amber:   '#f59e0b',
        red:     '#ef4444',
        teal:    '#14b8a6',
        border:  'rgba(6,182,212,0.08)',
        gold:    '#FFD700',
        silver:  '#C0C0C0',
        bronze:  '#CD7F32',
        cyan:    '#06b6d4',
        pink:    '#ec4899',
        neonCyan: '#22d3ee',
        neonPurple: '#c084fc',
      },
      fontFamily: {
        mono: ['Geist Mono Variable', 'JetBrains Mono', 'monospace'],
        sans: ['Geist', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
        'float-up': {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(-24px)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fire-pulse': {
          '0%, 100%': { transform: 'scale(1)', filter: 'brightness(1)' },
          '50%': { transform: 'scale(1.12)', filter: 'brightness(1.3)' },
        },
        'neon-flicker': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.85' },
          '75%': { opacity: '0.95' },
        },
        'gradient-shift': {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        'screen-shake': {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '10%': { transform: 'translate(-3px, -2px)' },
          '20%': { transform: 'translate(3px, 2px)' },
          '30%': { transform: 'translate(-2px, 1px)' },
          '40%': { transform: 'translate(2px, -1px)' },
          '50%': { transform: 'translate(0, 0)' },
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'float-up': 'float-up 1.2s ease-out forwards',
        'shimmer': 'shimmer 3s ease-in-out infinite',
        'fire-pulse': 'fire-pulse 1.5s ease-in-out infinite',
        'neon-flicker': 'neon-flicker 3s ease-in-out infinite',
        'gradient-shift': 'gradient-shift 8s ease infinite',
        'screen-shake': 'screen-shake 0.5s ease-in-out',
      },
    },
  },
  plugins: [],
};

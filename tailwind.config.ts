/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:      '#0a0a0a',
        panel:   '#111111',
        raised:  '#1a1a1a',
        muted:   '#222222',
        t1:      '#ededed',
        t2:      '#888888',
        t3:      '#444444',
        green:   '#22c55e',
        blue:    '#3b82f6',
        purple:  '#a78bfa',
        amber:   '#f59e0b',
        red:     '#ef4444',
        teal:    '#14b8a6',
        border:  'rgba(255,255,255,0.06)',
        gold:    '#FFD700',
        silver:  '#C0C0C0',
        bronze:  '#CD7F32',
        cyan:    '#06b6d4',
        pink:    '#ec4899',
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
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'float-up': 'float-up 1.2s ease-out forwards',
        'shimmer': 'shimmer 3s ease-in-out infinite',
        'fire-pulse': 'fire-pulse 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

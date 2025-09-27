import type { Config } from 'tailwindcss';

export default {
  content: [
    './index.html',
    './src/**/*.{vue,ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: {
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
      },
    },
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: {
          50: 'hsl(var(--muted-50))',
          100: 'hsl(var(--muted-100))',
          200: 'hsl(var(--muted-200))',
          300: 'hsl(var(--muted-300))',
          400: 'hsl(var(--muted-400))',
          500: 'hsl(var(--muted-500))',
          600: 'hsl(var(--muted-600))',
          700: 'hsl(var(--muted-700))',
          800: 'hsl(var(--muted-800))',
          900: 'hsl(var(--muted-900))',
        },
        card: 'hsl(var(--card))',
        cardFg: 'hsl(var(--card-fg))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          fg: 'hsl(var(--primary-fg))',
        },
        danger: {
          DEFAULT: 'hsl(var(--danger))',
          fg: 'hsl(var(--danger-fg))',
        },
        ring: 'hsl(var(--ring))',
        border: 'hsl(var(--border))',
      },
      borderRadius: {
        xl: '14px',
        '2xl': '18px',
      },
      boxShadow: {
        soft: '0 8px 30px rgba(0,0,0,0.06)',
        card: '0 6px 24px rgba(15,23,42,0.06)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
} satisfies Config;



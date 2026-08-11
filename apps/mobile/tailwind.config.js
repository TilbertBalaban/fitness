/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: 'rgb(var(--color-background) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        destructive: 'rgb(var(--color-destructive) / <alpha-value>)',
        foreground: 'rgb(var(--color-foreground) / <alpha-value>)',
        'foreground-muted': 'rgb(var(--color-foreground-muted) / <alpha-value>)',
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        '2xl': '48px',
        '3xl': '64px',
      },
      fontSize: {
        label: ['14px', { lineHeight: '20px' }],
        body: ['16px', { lineHeight: '24px' }],
        heading: ['20px', { lineHeight: '24px' }],
        display: ['28px', { lineHeight: '34px' }],
      },
      fontWeight: {
        normal: '400',
        semibold: '600',
      },
    },
  },
  plugins: [],
};

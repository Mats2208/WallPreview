/** @type {import('tailwindcss').Config} */
const withAlpha = (variable) => `rgb(var(${variable}) / <alpha-value>)`

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: withAlpha('--accent'),
        'accent-hover': withAlpha('--accent-hover'),
        'accent-soft': withAlpha('--accent-soft'),
        surface: withAlpha('--surface'),
        'surface-1': withAlpha('--surface-1'),
        'surface-2': withAlpha('--surface-2'),
        'surface-3': withAlpha('--surface-3'),
        ink: withAlpha('--ink'),
        'ink-secondary': withAlpha('--ink-secondary'),
        'ink-muted': withAlpha('--ink-muted'),
        'stroke-divider': withAlpha('--stroke-divider'),
        'stroke-control': withAlpha('--stroke-control'),
        danger: withAlpha('--danger'),
        success: withAlpha('--success'),
      },
      borderRadius: {
        sm: 'var(--r-sm)',
        DEFAULT: 'var(--r-md)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
      },
      boxShadow: {
        2: 'var(--shadow-2)',
        4: 'var(--shadow-4)',
        8: 'var(--shadow-8)',
        16: 'var(--shadow-16)',
        64: 'var(--shadow-64)',
      },
      transitionTimingFunction: {
        decel: 'var(--curve-decel)',
        accel: 'var(--curve-accel)',
      },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
        slow: 'var(--dur-slow)',
      },
      fontFamily: {
        sans: ['"Segoe UI Variable Display"', '"Segoe UI Variable Text"', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

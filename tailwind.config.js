const c = (v) => `rgb(var(${v}) / <alpha-value>)`
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: c('--bg'),
        surface: c('--surface'),
        surface2: c('--surface2'),
        line: c('--line'),
        fg: c('--fg'),
        muted: c('--muted'),
        accent: c('--accent'),
        danger: c('--danger'),
        ok: c('--ok'),
        warn: c('--warn'),
      },
      fontFamily: { sans: ['"Segoe UI"', 'system-ui', '-apple-system', 'Roboto', 'sans-serif'] },
    },
  },
  plugins: [],
}

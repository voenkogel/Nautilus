/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        abyss: '#07141e', surface: '#102330', raised: '#193443', line: '#263e4b',
        ink: '#e5f0f3', muted: '#9ab0bc', accent: '#65d7e8', action: '#226879',
        positive: '#68d6a5', negative: '#ff8d87', warning: '#ebc47f', maintenance: '#b5a0f4',
      },
      fontFamily: {
        'roboto': ['IBM Plex Sans', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
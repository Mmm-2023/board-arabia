import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages project site uses /board-arabia/; Vercel (and local) use /.
const base =
  process.env.GITHUB_PAGES === 'true' || process.env.VITE_BASE_PATH
    ? process.env.VITE_BASE_PATH || '/board-arabia/'
    : '/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
})

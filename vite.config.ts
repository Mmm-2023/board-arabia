import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Custom domain (boardarabia.com) is served at the domain root.
// Local `npm run dev` stays at /. Set VITE_BASE_PATH only to override.
const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
})

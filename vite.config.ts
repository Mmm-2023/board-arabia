import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages project site: https://mmm-2023.github.io/board-arabia/
export default defineConfig({
  base: '/board-arabia/',
  plugins: [react(), tailwindcss()],
})

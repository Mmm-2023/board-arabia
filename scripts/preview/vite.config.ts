import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  publicDir: new URL('../../public', import.meta.url).pathname,
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 4181,
    strictPort: true,
  },
})

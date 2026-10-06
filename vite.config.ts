import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Custom domain (boardarabia.com) is served at the domain root.
// Local `npm run dev` stays at /. Set VITE_BASE_PATH only to override.
const base = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base,
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.replaceAll('\\', '/').endsWith('/src/config/legalPageIdentity.ts')) return 'legal-pages'
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'prioritize-css',
      transformIndexHtml: {
        order: 'post',
        handler(html) {
          const script = html.match(/<script type="module"[^>]*><\/script>/)?.[0]
          if (!script) return html
          const src = script.match(/src="([^"]+)"/)?.[1]
          if (!src) return html
          const loader =
            `<script>window.addEventListener("load",function(){var s=document.createElement("script");s.type="module";s.src="${src}";document.body.appendChild(s)});</script>`
          return html
            .replace(script, '')
            .replace(/<link rel="modulepreload"[^>]*>/g, '')
            .replace(
              /<link rel="stylesheet"([^>]*?)href="([^"]+\.css)">/,
              '<link rel="stylesheet" fetchpriority="high"$1href="$2">',
            )
            .replace('</body>', `    ${loader}\n  </body>`)
        },
      },
    },
  ],
})

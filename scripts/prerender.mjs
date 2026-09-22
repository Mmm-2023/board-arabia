import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const routes = [
  '/',
  '/apply',
  '/for-members',
  '/for-capital',
  '/partners',
  '/how-it-works',
  '/about',
]

const base = (process.env.VITE_BASE_PATH || '/').replace(/\/$/, '')
const port = 4179

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    let pathname = decodeURIComponent(url.pathname)
    if (base && pathname.startsWith(base)) {
      pathname = pathname.slice(base.length) || '/'
    }
    const ext = path.extname(pathname)
    let filePath = path.join(dist, pathname)
    if (pathname.endsWith('/')) filePath = path.join(filePath, 'index.html')

    if (!ext && !fs.existsSync(filePath)) {
      filePath = path.join(dist, 'index.html')
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404)
      res.end('not found')
      return
    }

    const type = MIME[path.extname(filePath)] || 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': type })
    fs.createReadStream(filePath).pipe(res)
  })

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

function routeFile(route) {
  if (route === '/') return path.join(dist, 'index.html')
  return path.join(dist, route.slice(1), 'index.html')
}

function tagAttr(html, pattern) {
  const tag = html.match(pattern)?.[0] || ''
  return tag.match(/content="([^"]*)"/)?.[1] || tag.match(/href="([^"]*)"/)?.[1] || ''
}

function assertPage(route, html) {
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] || ''
  const descriptionTags = html.match(/<meta[^>]*name="description"[^>]*>/g) || []
  const description = tagAttr(descriptionTags[0] || '', /[\s\S]*/)
  const canonical = tagAttr(html, /<link[^>]*rel="canonical"[^>]*>/i)
  const h1s = html.match(/<h1[\s>]/g) || []
  const errors = []

  if (!title.includes('Board Arabia')) errors.push('title missing Board Arabia')
  if (/nammco/i.test(html)) errors.push('nammco in document')
  if (descriptionTags.length !== 1) errors.push(`description count ${descriptionTags.length}`)
  if (!description || description.length < 80) errors.push('description too short')
  if (!canonical.startsWith('https://boardarabia.com')) errors.push(`canonical ${canonical}`)
  if (h1s.length !== 1) errors.push(`h1 count ${h1s.length}`)
  if (!html.includes('application/ld+json')) errors.push('missing json-ld')
  if (/AggregateRating|Review"/.test(html)) errors.push('fake review schema')
  if (/calendar\.app\.google/i.test(html)) errors.push('public calendar url')
  if (html.includes('127.0.0.1')) errors.push('preview host leaked into html')
  if (route === '/' && !html.includes('FAQPage')) errors.push('home missing FAQPage')
  if (route !== '/' && html.includes('FAQPage')) errors.push('unexpected FAQPage')
  if (!html.includes('"@type":"Organization"') && !html.includes('"@type": "Organization"')) {
    errors.push('missing Organization')
  }
  if (!html.includes('WebSite')) errors.push('missing WebSite')

  if (errors.length) {
    throw new Error(`${route}: ${errors.join('; ')}`)
  }

  return { title, description, canonical }
}

function writeSitemap() {
  const today = new Date().toISOString().slice(0, 10)
  const urls = routes
    .map((route) => {
      const loc = route === '/' ? 'https://boardarabia.com/' : `https://boardarabia.com${route}`
      return `  <url><loc>${loc}</loc><lastmod>${today}</lastmod></url>`
    })
    .join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
  fs.writeFileSync(path.join(dist, 'sitemap.xml'), xml)
}

const server = await startServer()
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
})

const rendered = new Map()
const seenDescriptions = new Set()

try {
  fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, 'shell.html'))
  const shell = fs
    .readFileSync(path.join(dist, 'shell.html'), 'utf8')
    .replace(
      /<meta name="robots" content="[^"]*"\s*\/?>/,
      '<meta name="robots" content="noindex, nofollow" />',
    )
  fs.writeFileSync(path.join(dist, 'shell.html'), shell)

  for (const route of routes) {
    const page = await browser.newPage()
    const url = `http://127.0.0.1:${port}${base}${route === '/' ? '/' : route}`
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForFunction(
      () => {
        const h1s = document.querySelectorAll('h1')
        const canonical = document.querySelector('link[rel="canonical"]')
        const desc = document.querySelector('meta[name="description"]')
        const ld = document.querySelector('script#board-arabia-ld')
        return (
          h1s.length === 1 &&
          canonical &&
          desc &&
          desc.content.length > 50 &&
          ld &&
          ld.textContent.includes('Organization')
        )
      },
      { timeout: 20000 },
    )
    const html = await page.content()
    const meta = assertPage(route, html)
    if (seenDescriptions.has(meta.description)) {
      throw new Error(`${route}: duplicate meta description`)
    }
    seenDescriptions.add(meta.description)
    rendered.set(route, html)
    await page.close()
    console.log(`prerendered ${route} — ${meta.title}`)
  }
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
}

for (const [route, html] of rendered) {
  const file = routeFile(route)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, html)
}

writeSitemap()
console.log(`wrote ${rendered.size} routes + sitemap.xml`)

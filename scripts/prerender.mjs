import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

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
  '/privacy',
  '/terms',
]

function escapeAttr(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
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
  if (/AggregateRating|"@type":"Review"/.test(html)) errors.push('fake review schema')
  if (/calendar\.app\.google/i.test(html)) errors.push('public calendar url')
  const faqRoutes = new Set(['/', '/how-it-works'])
  if (faqRoutes.has(route) && !html.includes('FAQPage')) errors.push('missing FAQPage')
  if (!faqRoutes.has(route) && html.includes('FAQPage')) errors.push('unexpected FAQPage')
  if (/ReserveAction|SearchAction/.test(html)) errors.push('unexpected site action')
  if (!html.includes('"@type":"Organization"')) errors.push('missing Organization')
  if (!html.includes('"@type":"WebSite"')) errors.push('missing WebSite')
  if (route === '/' && !html.includes('Apply for consideration')) {
    errors.push('home missing consideration CTA')
  }
  if (route === '/' && !html.includes('no public booking calendar')) {
    errors.push('home missing answer-first blurb')
  }

  if (errors.length) throw new Error(`${route}: ${errors.join('; ')}`)
  return { title, description }
}

function assertDistClean(distDir) {
  const banned = [/calendar\.app\.google/i, /nammco/i]
  const files = []
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(html|js|css|txt|xml|webmanifest|svg)$/.test(entry.name)) files.push(full)
    }
  }
  walk(distDir)
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    for (const pattern of banned) {
      if (pattern.test(text)) {
        throw new Error(`${path.relative(distDir, file)} contains ${pattern}`)
      }
    }
  }
  const dashboard = fs.readFileSync(path.join(distDir, 'dashboard', 'index.html'), 'utf8')
  if (!dashboard.includes('noindex')) throw new Error('dashboard shell is indexable')
  if (!fs.existsSync(path.join(distDir, 'dashboard', 'profile', 'index.html'))) {
    throw new Error('missing dashboard profile shell')
  }
  if (!fs.existsSync(path.join(distDir, 'auth', 'confirm', 'index.html'))) {
    throw new Error('missing auth confirm shell')
  }
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

function documentFor(shell, rendered) {
  const title = escapeAttr(rendered.title)
  const description = escapeAttr(rendered.description)
  const canonical = escapeAttr(rendered.canonical)
  const image = escapeAttr(rendered.image)
  const seo = [
    `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Board Arabia" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:alt" content="Riyadh skyline at dusk" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<meta name="twitter:image:alt" content="Riyadh skyline at dusk" />`,
    `<script id="board-arabia-ld" type="application/ld+json">${rendered.jsonLd}</script>`,
  ].join('\n    ')

  const html = shell
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(
      /<meta\s+name="description"[\s\S]*?\/>/,
      `<meta name="description" content="${description}" />`,
    )
    .replace(
      /<meta name="robots" content="[^"]*"\s*\/?>/,
      '<meta name="robots" content="index, follow" />',
    )
    .replace('</head>', `    ${seo}\n  </head>`)
    .replace(/<div id="root">\s*<\/div>/, `<div id="root">${rendered.body}</div>`)

  if (!html.includes(rendered.body.slice(0, 40))) {
    throw new Error('Could not inject prerendered body into the built shell')
  }
  return html
}

const shellPath = path.join(dist, 'index.html')
const shell = fs.readFileSync(shellPath, 'utf8')
fs.writeFileSync(
  path.join(dist, 'shell.html'),
  shell.replace(
    /<meta name="robots" content="[^"]*"\s*\/?>/,
    '<meta name="robots" content="noindex, nofollow" />',
  ),
)

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

const seen = new Set()

try {
  const { render } = await vite.ssrLoadModule('/src/entry-ssr.tsx')
  for (const route of routes) {
    const rendered = render(route)
    const html = documentFor(shell, rendered)
    const meta = assertPage(route, html)
    if (seen.has(meta.description)) throw new Error(`${route}: duplicate meta description`)
    seen.add(meta.description)
    const file = routeFile(route)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, html)
    console.log(`prerendered ${route}: ${meta.title}`)
  }
} finally {
  await vite.close()
}

writeSitemap()

const shellHtml = fs.readFileSync(path.join(dist, 'shell.html'))
fs.writeFileSync(path.join(dist, '404.html'), shellHtml)
fs.writeFileSync(path.join(dist, '.nojekyll'), '')

const appShells = [
  'login',
  'admin',
  'ops',
  'dashboard',
  'dashboard/profile',
  'dashboard/directory',
  'dashboard/mandates',
  'dashboard/intros',
  'dashboard/rooms',
  'dashboard/events',
  'auth/confirm',
]
for (const staff of appShells) {
  const dir = path.join(dist, staff)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), shellHtml)
}

const pagesBase = (process.env.VITE_BASE_PATH || '/').replace(/\/?$/, '/')
if (pagesBase !== '/') {
  const prefix = pagesBase.replace(/\/$/, '')
  const robots = [
    'User-agent: *',
    `Allow: ${prefix}/`,
    '',
    `Disallow: ${prefix}/admin`,
    `Disallow: ${prefix}/ops`,
    `Disallow: ${prefix}/login`,
    `Disallow: ${prefix}/dashboard`,
    `Disallow: ${prefix}/auth`,
    `Disallow: ${prefix}/book`,
    `Disallow: ${prefix}/verify`,
    `Disallow: ${prefix}/shell.html`,
    '',
    'Sitemap: https://boardarabia.com/sitemap.xml',
    '',
  ].join('\n')
  fs.writeFileSync(path.join(dist, 'robots.txt'), robots)
}

assertDistClean(dist)

console.log(`wrote ${routes.length} routes + sitemap.xml`)

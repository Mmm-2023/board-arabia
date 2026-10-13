/**
 * Bare /ar stubs. Each file is a noindex meta refresh to the English URL.
 * They are not app shells and they contain no Arabic text.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { appShells } from './shell-manifest.mjs'
import { stampDistCsp } from './stamp-csp.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SITE = 'https://boardarabia.com'

export function publicRoutesFromPrerender(source) {
  const start = source.indexOf('const routes = [')
  if (start < 0) throw new Error('prerender routes were not found')
  const end = source.indexOf(']', start)
  const block = source.slice(start, end)
  const routes = [...block.matchAll(/'([^']+)'/g)].map((match) => match[1])
  if (!routes.includes('/')) throw new Error('prerender routes are missing the home path')
  return routes
}

/** Public pages plus fixed shells. The home path stands for /ar itself. */
export function englishTargets(publicRoutes, shellPaths) {
  const paths = new Set()
  for (const routePath of [...publicRoutes, ...shellPaths]) {
    if (typeof routePath !== 'string' || !routePath.startsWith('/') || routePath.startsWith('/ar')) continue
    if (routePath.includes(':') || routePath.includes('..')) continue
    paths.add(routePath)
  }
  return [...paths].sort((a, b) => a.localeCompare(b))
}

export function englishUrl(routePath) {
  if (routePath === '/') return `${SITE}/`
  return `${SITE}${routePath}`
}

export function stubFile(routePath) {
  if (routePath === '/') return path.join('ar', 'index.html')
  return path.join('ar', routePath.slice(1), 'index.html')
}

/** Same-origin English path. The canonical link stays the absolute English URL. */
export function refreshTarget(routePath) {
  return routePath === '/' ? '/' : routePath
}

export function stubHtml(routePath) {
  const target = englishUrl(routePath)
  const refresh = refreshTarget(routePath)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Board Arabia</title>
<meta name="robots" content="noindex, nofollow">
<link rel="canonical" href="${target}">
<meta http-equiv="refresh" content="0; url=${refresh}">
</head>
<body>
<p><a href="${target}">Continue</a></p>
</body>
</html>
`
}

/** href, refresh url, or sitemap loc that points at /ar. English targets do not match. */
export function arabicLinkHits(text) {
  const hits = []
  for (const match of text.matchAll(/hreflang\s*=\s*["']ar["']/gi)) hits.push(match[0])
  const attr = /(?:href|url)\s*=\s*["']((?:https:\/\/boardarabia\.com)?\/ar(?:\/[^"'#?]*)?)["'?#]/gi
  for (const match of text.matchAll(attr)) hits.push(match[1])
  const bare = /url\s*=\s*((?:https:\/\/boardarabia\.com)?\/ar(?:\/[^"'\s#;]*)?)/gi
  for (const match of text.matchAll(bare)) hits.push(match[1])
  const loc = /<loc>\s*(https:\/\/boardarabia\.com\/ar(?:\/[^<]*)?)\s*<\/loc>/gi
  for (const match of text.matchAll(loc)) hits.push(match[1])
  const absolute = /https:\/\/boardarabia\.com\/ar(?=\/|["'\s<#?]|$)/gi
  for (const match of text.matchAll(absolute)) {
    const rest = text.slice(match.index + match[0].length).match(/^\/[^"'\s<]*/)?.[0] ?? ''
    hits.push(`${match[0]}${rest}`)
  }
  return [...new Set(hits)]
}

function writeStubs() {
  const dist = path.join(root, 'dist')
  if (!fs.existsSync(dist)) {
    console.error('dist is missing; build before the redirect stubs')
    process.exit(1)
  }
  const source = fs.readFileSync(path.join(root, 'scripts/prerender.mjs'), 'utf8')
  const routes = englishTargets(
    publicRoutesFromPrerender(source),
    appShells().map((item) => item.path),
  )
  for (const routePath of routes) {
    const relative = stubFile(routePath)
    const file = path.join(dist, relative)
    const html = stubHtml(routePath)
    if (arabicLinkHits(html).length) throw new Error(`${relative} points at /ar`)
    if (/[\u0600-\u06FF]/.test(html)) throw new Error(`${relative} has Arabic text`)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, html)
  }
  const stamped = stampDistCsp(dist)
  console.log(`wrote ${routes.length} English redirect stubs under /ar`)
  console.log(`stamped CSP on ${stamped.files} HTML files (${stamped.hashes} inline script hashes)`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) writeStubs()

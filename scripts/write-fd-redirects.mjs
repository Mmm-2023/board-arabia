/**
 * GitHub Pages front door stubs.
 * vercel.json is not what the live site serves. Each old path is a real
 * index.html: noindex, canonical, meta refresh, and a script that keeps
 * the query string (including ?invite=) on the way to /apply/.
 * /register/verify is not in this list. It stays an app shell.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const APPLY_PATH = '/apply/'
export const APPLY_CANONICAL = 'https://boardarabia.com/apply/'

/** Old public paths. /register/verify is intentionally absent. */
export const REDIRECT_SOURCES = ['/register', '/apply/verify', '/book', '/verify']

export function stubFile(routePath) {
  return `${routePath.replace(/^\//, '')}/index.html`
}

/** Browser search always starts with ? or is empty. Hash starts with # or is empty. */
export function keptQuery(search, hash) {
  const query = typeof search === 'string' && (search === '' || search.startsWith('?')) ? search : ''
  const fragment = typeof hash === 'string' && (hash === '' || hash.startsWith('#')) ? hash : ''
  return `${APPLY_PATH}${query}${fragment}`
}

export function redirectScript() {
  return `(function () {
  var target = ${JSON.stringify(APPLY_PATH)} + location.search + location.hash
  var meta = document.querySelector('meta[http-equiv="refresh"]')
  if (meta) meta.setAttribute('content', '0; url=' + target)
  var link = document.querySelector('a[data-fd-redirect]')
  if (link) link.setAttribute('href', target)
  location.replace(target)
})()`
}

export function stubHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Board Arabia</title>
<meta name="robots" content="noindex, nofollow">
<link rel="canonical" href="${APPLY_CANONICAL}">
<meta http-equiv="refresh" content="0; url=${APPLY_PATH}">
<script>
${redirectScript()}
</script>
</head>
<body>
<p style="font-size:16px">This page has moved.</p>
<p><a data-fd-redirect href="${APPLY_PATH}" style="font-size:17px;min-height:44px;display:inline-flex;align-items:center">Continue to apply</a></p>
</body>
</html>
`
}

/**
 * Keep /register/verify crawlable. Disallow the old register form and
 * /apply/verify. Inserted after each existing /verify disallow so both
 * robot groups stay in step. A longer Allow wins over Disallow: /register
 * for crawlers that use the longest match.
 */
export function withFrontDoorRobots(text) {
  const lines = String(text).split('\n')
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    out.push(line)
    const match = line.match(/^Disallow: (\S*\/verify)$/)
    if (!match) continue
    // /apply/verify and /register/verify end in /verify. They are not the old /verify path.
    if (match[1].endsWith('/apply/verify') || match[1].endsWith('/register/verify')) continue
    const rootPath = match[1].slice(0, -'/verify'.length)
    const extra = [
      `Allow: ${rootPath}/register/verify`,
      `Disallow: ${rootPath}/register`,
      `Disallow: ${rootPath}/apply/verify`,
    ]
    const upcoming = lines.slice(i + 1, i + 1 + extra.length)
    if (extra.every((item, index) => upcoming[index] === item)) continue
    out.push(...extra)
  }
  return `${out.join('\n').replace(/\n+$/, '')}\n`
}

function writeStubs() {
  const dist = path.join(root, 'dist')
  if (!fs.existsSync(dist)) {
    console.error('dist is missing; build before the front door stubs')
    process.exit(1)
  }
  const html = stubHtml()
  if (html.includes('\u2014') || html.includes('\u2013')) {
    throw new Error('front door stub has a dash')
  }
  if (REDIRECT_SOURCES.includes('/register/verify')) {
    throw new Error('/register/verify must stay a working page')
  }
  for (const routePath of REDIRECT_SOURCES) {
    const relative = stubFile(routePath)
    const file = path.join(dist, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, html)
  }
  const robotsPath = path.join(dist, 'robots.txt')
  if (!fs.existsSync(robotsPath)) throw new Error('dist/robots.txt is missing')
  const robots = fs.readFileSync(robotsPath, 'utf8')
  const next = withFrontDoorRobots(robots)
  if (next !== robots) fs.writeFileSync(robotsPath, next)
  console.log(`wrote ${REDIRECT_SOURCES.length} front door redirect stubs`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) writeStubs()

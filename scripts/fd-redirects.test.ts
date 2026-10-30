import assert from 'node:assert/strict'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { applyRedirectTarget } from '../src/shell/applyRedirectTarget.ts'
import { appShells } from './shell-manifest.mjs'
import { APP_LINK_PATHS } from './write-well-known.mjs'
import {
  APPLY_CANONICAL,
  APPLY_PATH,
  REDIRECT_SOURCES,
  keptQuery,
  redirectScript,
  stubFile,
  stubHtml,
  withFrontDoorRobots,
} from './write-fd-redirects.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

test('the apply redirect keeps the invite query and drops a bad search', () => {
  assert.deepEqual(applyRedirectTarget({ search: '?invite=x', hash: '' }), {
    pathname: '/apply',
    search: '?invite=x',
    hash: '',
  })
  assert.deepEqual(applyRedirectTarget({ search: '?invite=one-time&from=mail', hash: '#form' }), {
    pathname: '/apply',
    search: '?invite=one-time&from=mail',
    hash: '#form',
  })
  assert.deepEqual(applyRedirectTarget({ search: 'invite=x', hash: 'form' }), {
    pathname: '/apply',
    search: '',
    hash: '',
  })
  assert.equal(keptQuery('?invite=x', ''), '/apply/?invite=x')
  assert.equal(keptQuery('', '#form'), '/apply/#form')
  assert.equal(keptQuery('https://example.com', 'form'), '/apply/')
  assert.equal(keptQuery('?invite=x', '#form'), '/apply/?invite=x#form')
  assert.equal(REDIRECT_SOURCES.includes('/register/verify'), false)
  assert.deepEqual(REDIRECT_SOURCES, ['/register', '/apply/verify', '/book', '/verify'])
})

test('the stub is a noindex refresh that keeps the query in script', () => {
  const html = stubHtml()
  assert.match(html, /content="noindex, nofollow"/)
  assert.match(html, new RegExp(`rel="canonical" href="${APPLY_CANONICAL.replaceAll('/', '\\/')}"`))
  assert.match(html, /content="0; url=\/apply\/"/)
  assert.match(html, /location\.search/)
  assert.match(html, /location\.hash/)
  assert.match(html, /location\.replace/)
  assert.match(redirectScript(), /"\/apply\/" \+ location\.search \+ location\.hash/)
  assert.match(html, /data-fd-redirect/)
  assert.match(html, /font-size:16px/)
  assert.match(html, /font-size:17px/)
  assert.match(html, /min-height:44px/)
  assert.match(html, /This page has moved\./)
  assert.match(html, /Continue to apply/)
  assert.equal(html.includes('id="root"'), false)
  assert.equal(html.includes('\u2014'), false)
  assert.equal(html.includes('\u2013'), false)
  assert.equal(/sponsor/i.test(html), false)
  assert.equal(html.includes('@'), false)
  assert.equal(html.includes('/register/verify'), false)
  assert.equal(APPLY_PATH, '/apply/')
})

test('robots keeps verify and disallows the old register and apply verify paths', () => {
  const sample = ['User-agent: *', 'Allow: /', 'Disallow: /verify', 'Disallow: /shell.html', ''].join('\n')
  const once = withFrontDoorRobots(sample)
  assert.match(once, /Disallow: \/verify\nAllow: \/register\/verify\nDisallow: \/register\nDisallow: \/apply\/verify\n/)
  assert.equal(once.includes('/apply/register'), false)
  assert.equal(withFrontDoorRobots(once), once)
  const prefixed = 'Disallow: /preview/verify\n'
  const next = withFrontDoorRobots(prefixed)
  assert.match(next, /Allow: \/preview\/register\/verify/)
  assert.match(next, /Disallow: \/preview\/register\n/)
  assert.match(next, /Disallow: \/preview\/apply\/verify/)

  const robots = read('public/robots.txt')
  const allowAt = robots.indexOf('Allow: /register/verify')
  const denyAt = robots.indexOf('Disallow: /register')
  assert.ok(allowAt > 0 && allowAt < denyAt)
  assert.match(robots, /Disallow: \/apply\/verify/)
  assert.equal(robots.includes('/apply/register'), false)
  assert.equal(withFrontDoorRobots(robots), robots.endsWith('\n') ? robots : `${robots}\n`)
  assert.equal(robots.includes('\u2014'), false)
})

test('vercel.json redirects the four paths with 301 and leaves register verify', () => {
  const config = JSON.parse(read('vercel.json'))
  const redirects = config.redirects as { source: string; destination: string; statusCode: number }[]
  const sources = redirects.map((item) => item.source)
  for (const routePath of ['/register', '/register/', '/apply/verify', '/apply/verify/', '/book', '/book/', '/verify', '/verify/']) {
    const hit = redirects.find((item) => item.source === routePath)
    assert.ok(hit, routePath)
    assert.equal(hit?.destination, '/apply/')
    assert.equal(hit?.statusCode, 301)
  }
  assert.equal(sources.includes('/register/verify'), false)
  assert.equal(sources.includes('/register/verify/'), false)
  const rewrites = config.rewrites as { source: string }[]
  assert.equal(rewrites.some((item) => item.source === '/book' || item.source === '/verify'), false)
  assert.equal(rewrites.some((item) => item.source === '/apply'), true)
})

test('shells and app links drop the old register path and keep register verify', () => {
  const shells = appShells().map((item: { path: string }) => item.path)
  for (const routePath of REDIRECT_SOURCES) assert.equal(shells.includes(routePath), false, routePath)
  assert.equal(shells.includes('/register/verify'), true)
  assert.equal(APP_LINK_PATHS.includes('/register'), false)
  assert.equal(APP_LINK_PATHS.includes('/register/*'), false)
  const app = read('src/App.tsx')
  assert.match(app, /path="\/apply" element=\{<ApplyPage/)
  assert.match(app, /path="\/register" element=\{<ApplyRedirect/)
  assert.match(app, /path="\/register\/verify" element=\{<VerifyPage/)
  assert.match(app, /path="\/apply\/verify" element=\{<ApplyRedirect/)
  assert.match(app, /path="\/book" element=\{<ApplyRedirect/)
  assert.match(app, /path="\/verify" element=\{<ApplyRedirect/)
  assert.equal(app.includes('RegisterPage'), false)
  assert.match(read('package.json'), /prerender\.mjs && node scripts\/write-fd-redirects\.mjs && node scripts\/write-ar-redirects\.mjs/)
  assert.equal(read('scripts/build-app.mjs').includes('write-fd-redirects.mjs'), false)
})

function startPages(rootDir: string) {
  return http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const pathname = decodeURIComponent(url.pathname)
    const rel = pathname.replace(/^\/+/, '')
    if (rel.split('/').includes('..')) {
      res.writeHead(400)
      res.end()
      return
    }
    const full = path.join(rootDir, rel)
    const inside = full === rootDir || full.startsWith(`${rootDir}${path.sep}`)
    const sendFile = (status: number, file: string) => {
      res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
      if (req.method === 'HEAD') {
        res.end()
        return
      }
      createReadStream(file).pipe(res)
    }
    if (inside && rel && existsSync(full) && statSync(full).isDirectory()) {
      if (!pathname.endsWith('/')) {
        res.writeHead(301, { Location: `${pathname}/${url.search}` })
        res.end()
        return
      }
      const index = path.join(full, 'index.html')
      if (existsSync(index)) {
        sendFile(200, index)
        return
      }
    }
    if (inside && rel && existsSync(full) && statSync(full).isFile()) {
      sendFile(200, full)
      return
    }
    sendFile(404, path.join(rootDir, '404.html'))
  })
}

function request(port: number, routePath: string) {
  return new Promise<{ status: number; location: string; body: string }>((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: routePath, agent: false }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          location: String(res.headers.location || ''),
          body: Buffer.concat(chunks).toString('utf8'),
        })
      })
    })
    req.setTimeout(10000, () => {
      req.destroy(new Error(`timed out ${routePath}`))
    })
    req.on('error', reject)
    req.end()
  })
}

test('built stubs answer 200 and keep invite on the refresh script', { timeout: 30_000 }, async () => {
  assert.equal(existsSync(path.join(dist, '404.html')), true, 'dist is missing; build before this test')
  for (const routePath of REDIRECT_SOURCES) {
    const file = path.join(dist, stubFile(routePath))
    assert.equal(existsSync(file), true, routePath)
    const html = readFileSync(file, 'utf8')
    assert.match(html, /data-fd-redirect/, routePath)
    assert.match(html, /http-equiv="Content-Security-Policy"/, routePath)
    assert.match(html, /name="referrer"/, routePath)
    assert.equal(html.includes('id="root"'), false, routePath)
  }
  const verify = readFileSync(path.join(dist, 'register/verify/index.html'), 'utf8')
  assert.equal(verify.includes('data-fd-redirect'), false)
  assert.match(verify, /id="root"/)
  const sitemap = readFileSync(path.join(dist, 'sitemap.xml'), 'utf8')
  for (const routePath of REDIRECT_SOURCES) {
    assert.equal(sitemap.includes(`https://boardarabia.com${routePath}`), false, routePath)
  }
  const robots = readFileSync(path.join(dist, 'robots.txt'), 'utf8')
  assert.match(robots, /Allow: \/register\/verify/)
  assert.match(robots, /Disallow: \/register/)
  assert.match(robots, /Disallow: \/apply\/verify/)

  const server = startPages(dist)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as { port: number }).port
  try {
    const bare = await request(port, '/register?invite=x')
    assert.equal(bare.status, 301)
    assert.equal(bare.location, '/register/?invite=x')
    const page = await request(port, '/register/?invite=x')
    assert.equal(page.status, 200)
    assert.match(page.body, /location\.search/)
    assert.match(page.body, /"\/apply\/" \+ location\.search \+ location\.hash/)
    for (const routePath of ['/book/', '/verify/', '/apply/verify/']) {
      const response = await request(port, routePath)
      assert.equal(response.status, 200, routePath)
      assert.match(response.body, /data-fd-redirect/, routePath)
      assert.match(response.body, /canonical" href="https:\/\/boardarabia\.com\/apply\/"/, routePath)
    }
    const still = await request(port, '/register/verify/')
    assert.equal(still.status, 200)
    assert.equal(still.body.includes('data-fd-redirect'), false)
    assert.match(still.body, /id="root"/)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
})

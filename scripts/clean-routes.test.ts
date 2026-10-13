import assert from 'node:assert/strict'
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { englishPath } from '../src/lib/englishPath.ts'
import { appShells, shellDocument } from './shell-manifest.mjs'
import { arabicLinkHits, englishUrl, stubFile, stubHtml } from './write-ar-redirects.mjs'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

test('/admin/intros stays a noindex admin shell and /ar is not an app shell', () => {
  const shells = appShells()
  const paths = shells.map((item) => item.path)
  assert.equal(paths.includes('/ar'), false)
  assert.equal(paths.includes('/ar/for-members'), false)
  const admin = shells.find((item) => item.path === '/admin/intros')
  assert.equal(admin?.kind, 'admin')
  const html = shellDocument(
    `<!doctype html><html lang="en"><head><meta name="robots" content="noindex, nofollow" /><meta name="description" content="Home share" /><title>Home share</title></head><body></body></html>`,
    admin,
  )
  assert.match(html, /content="noindex, nofollow"/)
  const app = read('src/App.tsx')
  assert.equal(app.includes('path="/ar"'), false)
  assert.equal(app.includes('ArabicPrefixRedirect'), false)
  assert.equal(read('src/components/EnglishOnly.tsx').includes('ArabicPrefixRedirect'), false)
  assert.match(app, /path="\/apply" element=\{<ApplyPage/)
})

test('englishPath still drops a stale /ar prefix and ?lang=ar', () => {
  assert.deepEqual(englishPath('/ar', ''), { pathname: '/', search: '' })
  assert.deepEqual(englishPath('/ar/for-members', ''), { pathname: '/for-members', search: '' })
  assert.deepEqual(englishPath('/ar/for-members', '?lang=ar&from=old'), {
    pathname: '/for-members',
    search: 'from=old',
  })
  assert.deepEqual(englishPath('/for-members', ''), null)
  assert.equal(/[\u0600-\u06FF]/.test(read('src/lib/englishPath.ts')), false)
})

test('/admin/intros renders a Navigate to /admin/people/intros and keeps search and hash', async () => {
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const redirect = await vite.ssrLoadModule('/src/shell/adminIntrosRedirect.tsx')
    assert.deepEqual(redirect.adminIntrosTarget({ search: '?status=open', hash: '#queue' }), {
      pathname: '/admin/people/intros',
      search: '?status=open',
      hash: '#queue',
    })
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/admin/intros?status=open#queue'] },
        createElement(redirect.AdminIntrosRedirect),
      ),
    )
    assert.equal(html, '')
  } finally {
    await vite.close()
  }
  const app = read('src/App.tsx')
  const admin = app.slice(app.indexOf('path="/admin"'), app.indexOf('path="/ops/*"'))
  assert.match(admin, /path="intros" element=\{<AdminIntrosRedirect/)
})

test('an /ar link or hreflang=ar fails, and an English redirect target does not', () => {
  assert.deepEqual(arabicLinkHits('<link rel="alternate" hreflang="ar" href="https://boardarabia.com/">'), [
    'hreflang="ar"',
  ])
  assert.deepEqual(arabicLinkHits('<a href="/ar">Arabic</a>'), ['/ar'])
  assert.deepEqual(arabicLinkHits('<a href="/ar/for-members">Arabic</a>'), ['/ar/for-members'])
  assert.deepEqual(arabicLinkHits('<a href="https://boardarabia.com/ar/about">Arabic</a>'), [
    'https://boardarabia.com/ar/about',
  ])
  assert.deepEqual(arabicLinkHits('<loc>https://boardarabia.com/ar</loc>'), ['https://boardarabia.com/ar'])
  assert.deepEqual(arabicLinkHits(stubHtml('/for-members')), [])
  assert.deepEqual(arabicLinkHits(stubHtml('/')), [])
  assert.match(stubHtml('/for-members'), /rel="canonical" href="https:\/\/boardarabia\.com\/for-members"/)
  assert.match(stubHtml('/for-members'), /content="0; url=\/for-members"/)
  assert.match(stubHtml('/'), /content="0; url=\/"/)
  assert.equal(stubHtml('/for-members').includes('id="root"'), false)
  assert.equal(/[\u0600-\u06FF]/.test(stubHtml('/about')), false)
  assert.equal(englishUrl('/for-members'), 'https://boardarabia.com/for-members')
  assert.equal(stubFile('/for-members'), path.join('ar', 'for-members', 'index.html'))
})

test('built output has English /ar stubs and no /ar link or hreflang=ar', () => {
  const dist = path.join(root, 'dist')
  assert.equal(existsSync(path.join(dist, '404.html')), true, 'dist is missing; build before this test')
  for (const routePath of ['/', '/for-members', '/about', '/admin/intros']) {
    const html = readFileSync(path.join(dist, stubFile(routePath)), 'utf8')
    assert.match(html, /content="noindex, nofollow"/, routePath)
    assert.match(html, /http-equiv="refresh"/, routePath)
    assert.match(html, new RegExp(`rel="canonical" href="${englishUrl(routePath).replaceAll('/', '\\/')}"`), routePath)
    assert.equal(html.includes('id="root"'), false, routePath)
    assert.equal(/[\u0600-\u06FF]/.test(html), false, routePath)
    assert.deepEqual(arabicLinkHits(html), [], routePath)
  }
  const hits: string[] = []
  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.(html|js|css|xml|txt|webmanifest|svg)$/.test(name)) continue
      const text = readFileSync(full, 'utf8')
      for (const hit of arabicLinkHits(text)) hits.push(`${path.relative(dist, full)} ${hit}`)
    }
  }
  walk(dist)
  assert.deepEqual(hits, [])
  const sitemap = readFileSync(path.join(dist, 'sitemap.xml'), 'utf8')
  assert.equal(sitemap.includes('https://boardarabia.com/ar'), false)
  assert.equal(sitemap.includes('https://boardarabia.com/for-members'), true)
})

function startPages(rootDir: string) {
  return http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const pathname = decodeURIComponent(url.pathname)
    const rel = pathname.replace(/^\/+/, '')
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
    if (!rel && existsSync(path.join(rootDir, 'index.html'))) {
      sendFile(200, path.join(rootDir, 'index.html'))
      return
    }
    sendFile(404, path.join(rootDir, '404.html'))
  })
}

test('bare /ar stubs answer 200 and an unknown path stays 404', async () => {
  const dist = path.join(root, 'dist')
  assert.equal(existsSync(path.join(dist, 'ar', 'index.html')), true, 'dist is missing; build before this test')
  const server = startPages(dist)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as { port: number }).port
  const request = (routePath: string) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      http
        .get({ hostname: '127.0.0.1', port, path: routePath }, (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk) => chunks.push(chunk))
          res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }))
        })
        .on('error', reject)
    })
  try {
    const home = await request('/ar/')
    assert.equal(home.status, 200)
    assert.match(home.body, /content="0; url=\/"/)
    assert.match(home.body, /rel="canonical" href="https:\/\/boardarabia\.com\/"/)
    assert.match(home.body, /name="referrer" content="strict-origin-when-cross-origin"/)
    assert.match(home.body, /http-equiv="Content-Security-Policy"/)
    assert.equal(home.body.includes('id="root"'), false)
    const members = await request('/ar/for-members/')
    assert.equal(members.status, 200)
    assert.match(members.body, /content="0; url=\/for-members"/)
    const unknown = await request('/nonexistent-xyz')
    assert.equal(unknown.status, 404)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
})

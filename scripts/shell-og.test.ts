import assert from 'node:assert/strict'
import { createReadStream } from 'node:fs'
import { readFileSync, existsSync, statSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import test from 'node:test'
import { AI_TOOL_SLUGS } from '../supabase/functions/_shared/ai_tools.ts'
import { strayPublicNammco } from './public-nammco.mjs'
import {
  ID_ROUTES_ON_404,
  SHELL_SHARE,
  appShells,
  readAiToolSlugs,
  shellArtifactPath,
  shellDocument,
  shellProblems,
} from './shell-manifest.mjs'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const dist = path.join(root, 'dist')

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

const PREVIOUS_SHELLS = [
  '/login',
  '/login/staff',
  '/admin',
  '/admin/applications',
  '/admin/review',
  '/admin/people',
  '/admin/people/intros',
  '/admin/capacity',
  '/admin/settings',
  '/admin/email',
  '/admin/majlis',
  '/admin/mandates',
  '/admin/rooms',
  '/ops',
  '/dashboard',
  '/dashboard/profile',
  '/dashboard/two-step',
  '/dashboard/directory',
  '/dashboard/mandates',
  '/dashboard/real-estate',
  '/dashboard/network',
  '/dashboard/help',
  '/dashboard/invites',
  '/dashboard/intros',
  '/dashboard/rooms',
  '/dashboard/rooms/new',
  '/dashboard/deals',
  '/dashboard/deals/mandates',
  '/dashboard/deals/real-estate',
  '/dashboard/deals/rooms',
  '/dashboard/deals/rooms/new',
  '/dashboard/people',
  '/dashboard/people/directory',
  '/dashboard/people/intros',
  '/dashboard/people/invites',
  '/dashboard/ai',
  '/dashboard/ai/due-diligence',
  '/dashboard/majlis',
  '/dashboard/due-diligence',
  '/dashboard/events',
  '/auth/confirm',
  '/auth/reset',
]

const ADDED_SHELLS = [
  '/dashboard/ai/cfo-check',
  '/dashboard/ai/market-brief',
  '/dashboard/ai/term-sheet-review',
  '/dashboard/ai/pricing-sense-check',
  '/dashboard/ai/deal-readiness',
  '/dashboard/profile/leave',
  '/dashboard/sponsorship',
  '/dashboard/people/partners',
  '/dashboard/privacy',
  '/admin/ai',
  '/admin/marketing',
  '/admin/access',
  '/register',
  '/register/verify',
  '/book',
  '/verify',
  '/apply/verify',
]

function fixtureShell() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <meta name="robots" content="noindex, nofollow" />
    <meta
      name="description"
      content="A selective founding membership for Chairpersons, Board members, and C-suite executives connecting Saudi Arabia boardrooms with international capital."
    />
    <meta property="og:site_name" content="Board Arabia" />
    <meta property="og:title" content="Board Arabia | Where Saudi boardrooms meet international capital" />
    <meta property="og:description" content="A selective founding membership for Chairpersons, Board members, and C-suite executives." />
    <meta property="og:image" content="https://boardarabia.com/og-board-arabia.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:alt" content="Board Arabia stacked wordmark and Najdi diamond mark on Night Indigo" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Board Arabia | Where Saudi boardrooms meet international capital" />
    <meta name="twitter:description" content="A selective founding membership for Chairpersons, Board members, and C-suite executives." />
    <meta name="twitter:image" content="https://boardarabia.com/og-board-arabia.png" />
    <title>Board Arabia | Where Saudi boardrooms meet international capital</title>
  </head>
  <body><div id="root"></div></body>
</html>`
}

test('AI tool shells are derived from AI_TOOL_SLUGS and old shells stay', () => {
  const fromSource = readAiToolSlugs()
  const fromExport = Object.values(AI_TOOL_SLUGS)
  assert.deepEqual(fromSource, fromExport)
  const shells = appShells()
  const paths = shells.map((item) => item.path)
  for (const routePath of PREVIOUS_SHELLS) assert.equal(paths.includes(routePath), true, routePath)
  for (const slug of fromExport) {
    const routePath = `/dashboard/ai/${slug}`
    const hit = shells.find((item) => item.path === routePath)
    assert.equal(hit?.kind, 'member', routePath)
    assert.equal(hit?.description, SHELL_SHARE.member.description)
  }
  for (const routePath of ADDED_SHELLS) assert.equal(paths.includes(routePath), true, routePath)
  const past = shells.find((item) => item.path === '/dashboard/majlis/past')
  assert.equal(past?.kind, 'member')
  assert.equal(past?.description, SHELL_SHARE.member.description)
  assert.equal(shells.some((item) => item.path.includes(':')), false)
  for (const pattern of ID_ROUTES_ON_404) assert.equal(paths.includes(pattern), false, pattern)
  const prerender = read('scripts/prerender.mjs')
  assert.match(prerender, /shellDocument\(shellHtml, entry\)/)
  assert.match(prerender, /strayPublicNammco\(html, artifactPath\(route\)\)/)
  assert.match(prerender, /strayPublicNammco\(text, relative\)/)
})

test('each shell kind has one generic share card and no banned wording', () => {
  assert.equal(SHELL_SHARE.member.title, 'Board Arabia')
  assert.equal(SHELL_SHARE.admin.title, 'Board Arabia')
  assert.equal(SHELL_SHARE['public-utility'].title, 'Board Arabia')
  assert.equal(SHELL_SHARE.member.description, 'A private Board Arabia members page. Sign in to open it.')
  assert.equal(SHELL_SHARE.admin.description, 'A private Board Arabia page for our admin team.')
  assert.equal(
    SHELL_SHARE['public-utility'].description,
    'Board Arabia founding membership. Apply with your credentials for review.',
  )
  const shells = appShells()
  assert.equal(shells.find((item) => item.path === '/dashboard/privacy')?.kind, 'member')
  assert.equal(shells.find((item) => item.path === '/admin/marketing')?.kind, 'admin')
  assert.equal(shells.find((item) => item.path === '/register')?.kind, 'public-utility')
  assert.equal(shells.find((item) => item.path === '/book')?.kind, 'public-utility')
  assert.equal(shells.find((item) => item.path === '/verify')?.kind, 'public-utility')
  const banned = [/nammco/i, /7043252647/, /\u2014/]
  for (const entry of shells) {
    for (const pattern of banned) {
      assert.equal(pattern.test(entry.title), false, entry.path)
      assert.equal(pattern.test(entry.description), false, entry.path)
    }
  }
  for (const file of ['scripts/shell-manifest.mjs', 'scripts/prerender.mjs', 'scripts/shell-og.test.ts']) {
    assert.equal(read(file).includes('\u2014'), false, file)
  }
})

test('shell documents keep noindex and replace the home share tags', () => {
  const base = fixtureShell()
  for (const entry of appShells()) {
    const html = shellDocument(base, entry)
    const relative = shellArtifactPath(entry)
    assert.deepEqual(shellProblems(html, entry, relative), [], entry.path)
    assert.equal(strayPublicNammco(html, relative), false, entry.path)
    assert.equal(html.includes('Where Saudi boardrooms meet international capital'), false, entry.path)
    assert.equal((html.match(/property="og:image"/g) || []).length, 1, entry.path)
    assert.match(html, /content="noindex, nofollow"/)
  }
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

function request(port: number, routePath: string, method = 'GET') {
  return new Promise<{ status: number; location: string; body: string }>((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: routePath, method, agent: false },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            location: String(res.headers.location || ''),
            body: Buffer.concat(chunks).toString('utf8'),
          })
        })
      },
    )
    req.setTimeout(10000, () => {
      req.destroy(new Error(`timed out ${method} ${routePath}`))
    })
    req.on('error', reject)
    req.end()
  })
}

test('fixed shells answer 200 on a Pages static server and unknown paths stay 404', { timeout: 60_000 }, async () => {
  assert.equal(existsSync(path.join(dist, '404.html')), true, 'dist is missing; build before this test')
  const server = startPages(dist)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as { port: number }).port
  try {
    const shells = appShells()
    for (const entry of shells) {
      const slash = `${entry.path}/`
      const head = await request(port, entry.path, 'HEAD')
      const bare = await request(port, entry.path)
      const followed = await request(port, slash)
      assert.equal(head.status, 301, entry.path)
      assert.equal(bare.status, 301, entry.path)
      assert.equal(bare.location, slash, entry.path)
      assert.equal(followed.status, 200, slash)
      const relative = shellArtifactPath(entry)
      assert.deepEqual(shellProblems(followed.body, entry, relative, { requireCsp: true }), [], entry.path)
      assert.equal(strayPublicNammco(followed.body, relative), false, entry.path)
    }
    const sitemap = readFileSync(path.join(dist, 'sitemap.xml'), 'utf8')
    for (const entry of shells) {
      assert.equal(sitemap.includes(`https://boardarabia.com${entry.path}<`), false, entry.path)
    }
    const past = shells.find((item) => item.path === '/dashboard/majlis/past')
    assert.equal(past?.kind, 'member')
    assert.equal(past?.description, 'A private Board Arabia members page. Sign in to open it.')
    const pastPage = await request(port, '/dashboard/majlis/past/')
    assert.equal(pastPage.status, 200)
    assert.match(pastPage.body, /content="noindex, nofollow"/)
    assert.match(pastPage.body, /A private Board Arabia members page\. Sign in to open it\./)
    assert.equal(sitemap.includes('https://boardarabia.com/dashboard/majlis/past<'), false)
    const missing = await request(port, '/no-such-page')
    assert.equal(missing.status, 404)
    assert.match(missing.body, /data-ba-spa-fallback/)
    const idSamples = [
      '/dashboard/ai/due-diligence/11111111-1111-4111-8111-111111111111',
      '/dashboard/ai/cfo-check/11111111-1111-4111-8111-111111111111',
      '/admin/mandates/11111111-1111-4111-8111-111111111111',
      '/admin/people/member/11111111-1111-4111-8111-111111111111',
      '/dashboard/deals/rooms/11111111-1111-4111-8111-111111111111',
      '/admin/review/11111111-1111-4111-8111-111111111111',
    ]
    for (const routePath of idSamples) {
      const response = await request(port, routePath)
      assert.equal(response.status, 404, routePath)
    }
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
})

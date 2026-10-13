import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { englishPath } from '../src/lib/englishPath.ts'
import { appShells, shellDocument } from './shell-manifest.mjs'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

const REDIRECT_SHELLS = [
  ['/ar', 'public-utility'],
  ['/ar/for-members', 'public-utility'],
  ['/admin/intros', 'admin'],
] as const

function fixtureShell() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta name="robots" content="noindex, nofollow" />
    <meta name="description" content="Home share" />
    <title>Home share</title>
  </head>
  <body><div id="root"></div></body>
</html>`
}

test('redirect shells are noindex utility pages and stay out of the public route list', () => {
  const shells = appShells()
  const prerender = read('scripts/prerender.mjs')
  const routesBlock = prerender.slice(
    prerender.indexOf('const routes = ['),
    prerender.indexOf(']', prerender.indexOf('const routes = [')),
  )
  for (const [routePath, kind] of REDIRECT_SHELLS) {
    const hit = shells.find((item) => item.path === routePath)
    assert.equal(hit?.kind, kind, routePath)
    assert.equal(hit?.title, 'Board Arabia', routePath)
    assert.equal(hit?.description.includes('\u2014'), false, routePath)
    assert.equal(/[\u0600-\u06FF]/.test(`${hit?.title} ${hit?.description}`), false, routePath)
    const html = shellDocument(fixtureShell(), hit)
    assert.match(html, /content="noindex, nofollow"/)
    assert.equal(/[\u0600-\u06FF]/.test(html), false, routePath)
    assert.equal(routesBlock.includes(`'${routePath}'`), false, routePath)
  }
})

test('/ar and /ar/for-members resolve to the English pages', () => {
  assert.deepEqual(englishPath('/ar', ''), { pathname: '/', search: '' })
  assert.deepEqual(englishPath('/ar/', ''), { pathname: '/', search: '' })
  assert.deepEqual(englishPath('/ar/for-members', ''), { pathname: '/for-members', search: '' })
  assert.deepEqual(englishPath('/ar/for-members', '?lang=ar&from=old'), {
    pathname: '/for-members',
    search: 'from=old',
  })
  assert.deepEqual(englishPath('/for-members', ''), null)
  const app = read('src/App.tsx')
  assert.match(app, /path="\/ar" element=\{<ArabicPrefixRedirect/)
  assert.match(app, /path="\/ar\/\*" element=\{<ArabicPrefixRedirect/)
  assert.match(app, /path="\/apply" element=\{<ApplyPage/)
  assert.equal(/[\u0600-\u06FF]/.test(read('src/components/EnglishOnly.tsx')), false)
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
    assert.deepEqual(redirect.adminIntrosTarget({ search: '', hash: '' }), {
      pathname: '/admin/people/intros',
      search: '',
      hash: '',
    })
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
  assert.match(admin, /path="people" element=\{<AdminPeopleLayout/)
  assert.match(read('src/shell/adminIntrosRedirect.tsx'), /<Navigate to=\{adminIntrosTarget\(location\)\} replace \/>/)
  assert.equal(admin.includes('path="/apply"'), false)
})

test('built redirect shells answer as English noindex files outside the sitemap', () => {
  assert.equal(existsSync(path.join(root, 'dist', '404.html')), true, 'dist is missing; build before this test')
  const sitemap = readFileSync(path.join(root, 'dist', 'sitemap.xml'), 'utf8')
  const locs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1])
  for (const [routePath] of REDIRECT_SHELLS) {
    const relative = `${routePath.replace(/^\//, '')}/index.html`
    const html = readFileSync(path.join(root, 'dist', relative), 'utf8')
    assert.match(html, /content="noindex, nofollow"/, routePath)
    assert.equal(/[\u0600-\u06FF]/.test(html), false, routePath)
    assert.equal(locs.includes(`https://boardarabia.com${routePath}`), false, routePath)
    assert.equal(locs.includes(`https://boardarabia.com${routePath}/`), false, routePath)
  }
  assert.equal(locs.includes('https://boardarabia.com/for-members'), true)
})

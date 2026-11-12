import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { MEMBER_DESTINATIONS, MEMBER_SECONDARY, shellSectionTitle } from '../src/shell/destinations.ts'
import { resolveChromePath } from './chrome-path.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function firstControl(html: string) {
  const match = /<(a|button|input|select|textarea|summary)\b[^>]*>/.exec(html)
  assert.ok(match, 'a control')
  assert.equal(match[1], 'a')
  assert.match(match[0], /data-skip-link/)
  assert.match(match[0], /href="#main"/)
  assert.match(match[0], />/)
}

test('skip link is the first control and mains can take focus', async () => {
  process.env.VITE_SUPABASE_URL ||= 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY ||= 'example-anon-key'
  process.env.VITE_ANALYTICS_ENABLED ||= 'false'
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const ssr = (await vite.ssrLoadModule('/src/entry-ssr.tsx')) as {
      render: (url: string) => { body: string }
    }
    const app = (await vite.ssrLoadModule('/src/App.tsx')) as { default: () => unknown }
    const login = renderToStaticMarkup(
      createElement(MemoryRouter, { initialEntries: ['/login'] }, createElement(app.default)),
    )
    for (const [route, html] of [
      ['/', ssr.render('/').body],
      ['/how-it-works', ssr.render('/how-it-works').body],
      ['/about', ssr.render('/about').body],
      ['/apply', ssr.render('/apply').body],
      ['/login', login],
    ] as const) {
      firstControl(html)
      assert.match(html, /<main\b[^>]*\bid="main"/)
      assert.match(html, /<main\b[^>]*\btabindex="-1"/)
      if (route !== '/login') assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, route)
    }
    const home = ssr.render('/').body
    const how = ssr.render('/how-it-works').body
    for (const label of ['Access to capital', 'Business relationships', 'Opening doors', 'Open menu']) {
      assert.match(home, new RegExp(`aria-label="${label}"`))
    }
    assert.match(how, /aria-label="Open menu"/)
    assert.equal(how.includes('aria-label=""'), false)
  } finally {
    await vite.close()
  }
})

test('Majlis, AI tools, and Help headings are sentences of use', () => {
  assert.equal(shellSectionTitle('/dashboard/majlis', MEMBER_DESTINATIONS, MEMBER_SECONDARY), 'Majlis')
  assert.equal(shellSectionTitle('/dashboard/ai', MEMBER_DESTINATIONS, MEMBER_SECONDARY), 'AI tools')
  assert.equal(shellSectionTitle('/dashboard/help', MEMBER_DESTINATIONS, MEMBER_SECONDARY), 'Help')

  const majlis = read('src/pages/dashboard/MajlisPage.tsx')
  const ai = read('src/pages/dashboard/AiToolsHome.tsx')
  const help = read('src/pages/dashboard/HelpPage.tsx')
  assert.match(majlis, />Your majlis</)
  assert.equal(majlis.includes('>Majlis</h1>'), false)
  assert.match(ai, />Checks you can run</)
  assert.equal(ai.includes('{ui.hub}'), false)
  assert.match(help, />Short answers</)
  assert.equal(help.includes('>Help<'), false)
  assert.equal((help.match(/<h1[\s>]/g) || []).length, 1)
  assert.equal((majlis.match(/<h1[\s>]/g) || []).length, 1)
  assert.equal((ai.match(/<h1[\s>]/g) || []).length, 1)
  for (const source of [help, read('src/components/SkipLink.tsx')]) {
    assert.equal(source.includes('\u2014'), false)
    assert.equal(source.includes('\u2013'), false)
  }
  assert.equal(/the desk/i.test(help), false)
  assert.equal(/\bsponsor\b/i.test(help), false)
})

test('keyboard skip link focuses main and the new controls stay tappable', { timeout: 180_000 }, async (t) => {
  if (process.env.GITHUB_ACTIONS === 'true') {
    t.skip('The browser pass is checked locally. Markup checks above still run in CI.')
    return
  }
  const executablePath =
    resolveChromePath() || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : null)
  if (!executablePath) {
    t.skip('Chrome is not installed.')
    return
  }
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
  process.env.VITE_ANALYTICS_ENABLED = 'false'
  const shotDir = process.env.UP3_SHOTS
  if (shotDir) mkdirSync(shotDir, { recursive: true })
  const vite = await createServer({
    server: { host: '127.0.0.1', port: 0, hmr: false },
    logLevel: 'error',
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  const port = address && typeof address === 'object' ? address.port : 0
  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  try {
    const page = await browser.newPage()
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' })
      await page.keyboard.press('Tab')
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-skip-link') !== null)
      assert.equal(focused, true, `first tab at ${width}`)
      const skip = await page.evaluate(() => {
        const node = document.activeElement
        if (!(node instanceof HTMLElement)) return null
        const style = getComputedStyle(node)
        const rect = node.getBoundingClientRect()
        return {
          text: node.textContent?.trim(),
          w: rect.width,
          h: rect.height,
          fs: Number.parseFloat(style.fontSize),
          outline: style.outlineWidth,
          visible: rect.top >= 0 && rect.bottom <= window.innerHeight,
        }
      })
      assert.ok(skip)
      assert.equal(skip.text, 'Skip to content')
      assert.ok(skip.w >= 44 && skip.h >= 44, `skip size ${skip.w}x${skip.h}`)
      assert.ok(skip.fs >= 15)
      assert.equal(skip.outline, '2px')
      assert.equal(skip.visible, true)
      if (shotDir) await page.screenshot({ path: path.join(shotDir, `skip-${width}.png`) })
      await page.keyboard.press('Enter')
      const target = await page.evaluate(() => ({
        id: document.activeElement?.id,
        tab: document.activeElement?.getAttribute('tabindex'),
        tag: document.activeElement?.tagName.toLowerCase(),
      }))
      assert.equal(target.tag, 'main')
      assert.equal(target.id, 'main')
      assert.equal(target.tab, '-1')
      await page.keyboard.press('Escape')
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
      if (shotDir) await page.screenshot({ path: path.join(shotDir, `landing-${width}.png`) })

      await page.goto(`http://127.0.0.1:${port}/how-it-works`, { waitUntil: 'networkidle' })
      const names = await page.evaluate(() => {
        const nodes = [...document.querySelectorAll('a, button, [role="img"]')]
        return nodes
          .filter((node) => {
            const style = getComputedStyle(node)
            const rect = node.getBoundingClientRect()
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 1 && rect.height > 1
          })
          .map((node) => (node.getAttribute('aria-label') || node.textContent || '').replace(/\s+/g, ' ').trim())
          .filter((name) => name.length === 0)
      })
      assert.deepEqual(names, [], `unnamed controls on How it works at ${width}`)
      if (shotDir) await page.screenshot({ path: path.join(shotDir, `how-${width}.png`) })
    }

    const smoke = await createServer({
      configFile: path.join(root, 'scripts/smoke/vite.config.ts'),
      server: { host: '127.0.0.1', port: 0, hmr: false },
      logLevel: 'error',
    })
    await smoke.listen()
    const smokeAddress = smoke.httpServer?.address()
    const smokePort = smokeAddress && typeof smokeAddress === 'object' ? smokeAddress.port : 0
    try {
      for (const screen of ['majlis', 'ai', 'help'] as const) {
        for (const width of [390, 1440]) {
          await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
          await page.goto(`http://127.0.0.1:${smokePort}/up-3.html?screen=${screen}`, { waitUntil: 'networkidle' })
          await page.locator('h1').first().waitFor()
          const heading = (await page.locator('h1').first().innerText()).replace(/\s+/g, ' ').trim()
          const bar = (await page.locator('header p').first().innerText()).replace(/\s+/g, ' ').trim()
          assert.notEqual(heading, bar, `${screen} heading repeats the top bar`)
          assert.equal(await page.locator('h1').count(), 1, screen)
          if (screen === 'help') {
            const mainText = await page.locator('main').innerText()
            assert.equal(mainText.includes('Help'), false, 'Help appears again in the page')
            assert.match(heading, /Short answers/)
          }
          if (screen === 'majlis') assert.equal(heading, 'Your majlis')
          if (screen === 'ai') assert.equal(heading, 'Checks you can run')
          const h1Size = await page.locator('h1').first().evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize))
          assert.ok(h1Size >= 15, `${screen} heading ${h1Size}`)
          if (shotDir) await page.screenshot({ path: path.join(shotDir, `${screen}-${width}.png`) })
        }
      }
    } finally {
      await smoke.close()
    }
  } finally {
    await browser.close()
    await vite.close()
  }
})

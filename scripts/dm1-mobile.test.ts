import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { chromium, type Page } from 'playwright-core'
import { createServer } from 'vite'
import { resolveChromePath } from './chrome-path.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function chromePath() {
  const resolved = resolveChromePath()
  if (resolved) return resolved
  if (existsSync('/usr/bin/google-chrome')) return '/usr/bin/google-chrome'
  if (existsSync('/usr/local/bin/google-chrome')) return '/usr/local/bin/google-chrome'
  return null
}

test('phone tap targets are at least 44px and phone body text is at least 15px', () => {
  const directory = read('src/pages/dashboard/DirectoryBoard.tsx')
  assert.match(directory, /min-h-12 min-w-11 items-center justify-center[\s\S]{0,400}Less' : 'More'/)
  const realEstate = read('src/pages/dashboard/OpportunityCard.tsx')
  assert.match(realEstate, /min-h-11 min-w-11 items-center justify-center[\s\S]{0,400}Less' : 'More'/)
  const benefits = read('src/pages/dashboard/ProfilePage.tsx')
  assert.match(benefits, /data-profile-benefits/)
  assert.match(benefits, /flex min-h-11 w-full items-center justify-between/)
  assert.match(benefits, /data-phone-body/)
  assert.match(read('src/pages/dashboard/MemberFilters.tsx'), /min-h-11 min-w-11/)
  assert.match(read('src/pages/dashboard/IntroSuggestions.tsx'), /min-h-12 min-w-11/)
  const help = read('src/pages/dashboard/HelpPage.tsx')
  assert.equal((help.match(/min-h-11 min-w-11/g) || []).length >= 6, true)
  assert.match(help, /list-none/)
  const home = read('src/pages/dashboard/HomeSnapshotView.tsx')
  assert.match(home, /data-phone-body/)
  assert.match(home, /max-md:order-5" data-home-next/)
  assert.match(home, /max-md:order-7" data-home-needs/)
  assert.match(home, /data-home-example/)
  assert.match(home, /max-md:order-10/)
  assert.match(read('src/pages/dashboard/MandatesPage.tsx'), /data-phone-body/)
  const css = read('src/index.css')
  assert.match(css, /\[data-phone-body\]/)
  assert.match(css, /font-size: 1rem !important/)
  assert.equal(css.includes('\u2014'), false)
  assert.equal(help.includes('\u2014'), false)
  assert.equal(home.includes('\u2014'), false)
})

test('home source order stays needs you, this week, then next action', () => {
  const home = read('src/pages/dashboard/HomeSnapshotView.tsx')
  const needsAt = home.indexOf('data-home-needs')
  const weekAt = home.indexOf('data-home-digest')
  const nextAt = home.indexOf('data-home-next')
  assert.ok(needsAt > 0 && needsAt < weekAt && weekAt < nextAt)
})

type Box = { t: string; tag: string; w: number; h: number; fs: number }

async function measure(page: Page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll('a, button, summary, input')]
    const taps: Box[] = []
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue
      if (node.closest('p')) continue
      if (node.classList.contains('sr-only')) continue
      const rect = node.getBoundingClientRect()
      if (rect.width < 8 || rect.height < 8) continue
      const style = getComputedStyle(node)
      if (style.visibility === 'hidden' || style.display === 'none') continue
      taps.push({
        t: (node.innerText || node.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60),
        tag: node.tagName.toLowerCase(),
        w: rect.width,
        h: rect.height,
        fs: Number.parseFloat(style.fontSize),
      })
    }
    const copy = [...document.querySelectorAll('[data-phone-body] p, [data-phone-body] h2, [data-phone-body] li, [data-phone-body] span, [data-phone-body] a, [data-phone-body] button, [data-phone-body] label, [data-phone-body] dt, [data-phone-body] dd')]
      .filter((node): node is HTMLElement => node instanceof HTMLElement && !node.closest('[data-chip]') && !node.classList.contains('sr-only'))
      .map((node) => ({
        t: node.innerText.replace(/\s+/g, ' ').trim().slice(0, 50),
        fs: Number.parseFloat(getComputedStyle(node).fontSize),
      }))
      .filter((item) => item.t.length > 0)
    const cta = document.querySelector('[data-home-cta]')
    const needs = document.querySelector('[data-home-needs]')
    const example = document.querySelector('[data-home-example]')
    const tab = document.querySelector('.shell-tab-bar')
    const box = (node: Element | null) => {
      if (!(node instanceof HTMLElement)) return null
      const rect = node.getBoundingClientRect()
      return { y: rect.top, bottom: rect.bottom, h: rect.height }
    }
    return {
      taps,
      copy,
      cta: box(cta),
      needs: box(needs),
      example: box(example),
      tab: box(tab),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }
  })
}

test('dashboard phone layout meets the 44px and 15px rules', { timeout: 180_000 }, async (t) => {
  const executablePath = chromePath()
  if (!executablePath) {
    t.skip('Chrome is not installed')
    return
  }
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
  process.env.VITE_ANALYTICS_ENABLED = 'false'
  const shotDir = process.env.DM1_SHOTS
  if (shotDir) mkdirSync(shotDir, { recursive: true })
  const vite = await createServer({
    configFile: path.join(root, 'scripts/smoke/vite.config.ts'),
    server: { host: '127.0.0.1', port: 0, hmr: false },
    logLevel: 'error',
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  const port = address && typeof address === 'object' ? address.port : 0
  const origin = `http://127.0.0.1:${port}`
  const browser = await chromium.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(20_000)
    const views = ['home', 'directory', 'profile', 'intros', 'help', 'mandates'] as const
    for (const view of views) {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(`${origin}/dm1.html?view=${view}`, { waitUntil: 'networkidle' })
      await page.locator('h1').first().waitFor()
      if (shotDir) await page.screenshot({ path: path.join(shotDir, `m_${view}.png`) })
      if (process.env.DM1_CAPTURE_ONLY) continue
      const measured = await measure(page)
      assert.equal(measured.overflow, false, `${view} overflows sideways`)
      const small = measured.taps.filter((item) => item.w < 44 || item.h < 44)
      assert.deepEqual(small, [], `${view} tap targets under 44px`)
      if (view === 'home' || view === 'profile' || view === 'mandates') {
        const tiny = measured.copy.filter((item) => item.fs < 15)
        assert.deepEqual(tiny, [], `${view} phone text under 15px`)
      }
      if (view === 'home') {
        assert.ok(measured.cta && measured.tab && measured.needs && measured.example)
        assert.ok(measured.cta.bottom <= measured.tab.y + 1, 'Invite peer sits under the tab bar')
        assert.ok(measured.cta.y < measured.needs.y, 'Next action is below the nudges')
        assert.ok(measured.cta.y < measured.example.y, 'Next action is below the example note')
        assert.match(await page.locator('[data-home-cta]').innerText(), /Invite peer/)
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${origin}/dm1.html?view=home`, { waitUntil: 'networkidle' })
    await page.locator('[data-home-cta]').waitFor()
    if (shotDir) await page.screenshot({ path: path.join(shotDir, 'd_home.png') })
    if (process.env.DM1_CAPTURE_ONLY) return
    const desktop = await measure(page)
    assert.equal(desktop.overflow, false, 'desktop home overflows')
    assert.ok(desktop.needs && desktop.example && desktop.cta)
    assert.ok(desktop.needs.y < desktop.cta.y, 'desktop moved Next action above Needs you')
    assert.ok(desktop.example.y < desktop.cta.y, 'desktop moved Next action above the example note')
    const note = desktop.copy.find((item) => item.t.startsWith('Cards marked Example'))
    assert.ok(note)
    assert.ok(note.fs < 15, 'desktop example note changed size')
  } finally {
    await browser.close()
    await vite.close()
  }
})

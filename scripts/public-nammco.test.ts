import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { FOOTER_NAMMCO_CREDIT, strayPublicNammco } from './public-nammco.mjs'

function read(rel: string) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
}

test('the exact footer credit is allowed and every other public nammco fails', () => {
  assert.equal(FOOTER_NAMMCO_CREDIT, 'powered by nammco')
  assert.equal(strayPublicNammco('powered by nammco'), false)
  assert.equal(strayPublicNammco('<footer><p>powered by nammco</p></footer>'), false)
  assert.equal(strayPublicNammco('powered by nammco\npowered by nammco'), false)
  assert.equal(strayPublicNammco('Board Arabia. powered by nammco'), false)

  const banned = [
    'nammco',
    'Nammco',
    'NAMMCO',
    'Powered by nammco',
    'powered by Nammco',
    'powered by NAMMCO',
    'powered by nammco.com',
    'https://nammco.com',
    'visit nammco',
    'powered by nammco and NAMMCO',
    'not powered by nammco extra nammco',
    'xpowered by nammco',
  ]
  for (const sample of banned) {
    assert.equal(strayPublicNammco(sample), true, sample)
  }
})

test('prerender and the Pages artifact gate share the narrow allowlist', () => {
  const prerender = read('scripts/prerender.mjs')
  const helper = read('scripts/public-nammco.mjs')
  const pages = read('.github/workflows/pages.yml')
  assert.match(prerender, /strayPublicNammco\(html\)/)
  assert.match(prerender, /strayPublicNammco\(text\)/)
  assert.equal(/\/nammco\/i\.test\(html\)/.test(prerender), false)
  assert.match(helper, /\/nammco\/i\.test\(html\)/)
  assert.match(helper, /powered by nammco/)
  assert.match(pages, /check-pages-artifact\.mjs/)
  assert.equal(/grep[^\n]*nammco/.test(pages), false)
  assert.match(pages, /calendar\\\.app\\\.google/)
})

test('the public footer renders the credit and Who runs the desk does not', async () => {
  const who = read('src/components/WhoRunsTheDesk.tsx')
  assert.match(who, /Michael Mateer, Co-Founder and CEO/)
  assert.equal(/nammco/i.test(who), false)
  assert.equal(who.includes('\u2014'), false)

  const footerSource = read('src/components/Footer.tsx')
  assert.equal(strayPublicNammco(footerSource), false)
  assert.equal((footerSource.match(/nammco/gi) || []).length, 1)
  assert.equal(footerSource.includes('\u2014'), false)

  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
  process.env.VITE_TWO_TIER_REGISTER_ENABLED = 'false'
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const footerMod = await vite.ssrLoadModule('/src/components/Footer.tsx')
    const whoMod = await vite.ssrLoadModule('/src/components/WhoRunsTheDesk.tsx')
    const footerHtml = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(footerMod.Footer)),
    )
    const whoHtml = renderToStaticMarkup(createElement(whoMod.WhoRunsTheDesk))
    assert.match(footerHtml, />powered by nammco</)
    assert.equal(strayPublicNammco(footerHtml), false)
    assert.equal(strayPublicNammco(`${footerHtml}\nNAMMCO`), true)
    assert.match(whoHtml, /Michael Mateer, Co-Founder and CEO/)
    assert.equal(/nammco/i.test(whoHtml), false)
    assert.equal(footerHtml.includes('\u2014') || whoHtml.includes('\u2014'), false)
  } finally {
    await vite.close()
  }
})

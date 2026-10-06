import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import {
  FOOTER_NAMMCO_CREDIT,
  LEGAL_ENTITY_CR,
  LEGAL_ENTITY_LINE,
  allowsLegalEntityLine,
  strayPublicNammco,
} from './public-nammco.mjs'

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
  const checker = read('scripts/check-pages-artifact.mjs')
  assert.match(prerender, /strayPublicNammco\(html, artifactPath\(route\)\)/)
  assert.match(prerender, /strayPublicNammco\(text, relative\)/)
  assert.equal(/\/nammco\/i\.test\(html\)/.test(prerender), false)
  assert.match(helper, /\/nammco\/i\.test\(html\)/)
  assert.match(helper, /powered by nammco/)
  assert.match(checker, /strayPublicNammco\(text, relative\)/)
  assert.match(pages, /check-pages-artifact\.mjs/)
  assert.equal(/grep[^\n]*nammco/.test(pages), false)
  assert.match(pages, /calendar\\\.app\\\.google/)
  assert.match(pages, new RegExp(`VITE_LEGAL_BA_ENTITY: '${LEGAL_ENTITY_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`))
  assert.match(pages, new RegExp(`VITE_LEGAL_CR: '${LEGAL_ENTITY_CR}'`))
})

test('the entity line is allowed only on privacy, terms, and the legal-pages chunk', () => {
  const entity = `${LEGAL_ENTITY_LINE}, commercial registration number ${LEGAL_ENTITY_CR}`
  const footer = `Board Arabia. ${FOOTER_NAMMCO_CREDIT}`
  assert.equal(allowsLegalEntityLine('privacy/index.html'), true)
  assert.equal(allowsLegalEntityLine('dist/privacy/index.html'), true)
  assert.equal(allowsLegalEntityLine('terms/index.html'), true)
  assert.equal(allowsLegalEntityLine('dist/terms/index.html'), true)
  assert.equal(allowsLegalEntityLine('assets/legal-pages-Abc123.js'), true)
  assert.equal(allowsLegalEntityLine('dist/assets/legal-pages-Abc123.js'), true)
  assert.equal(allowsLegalEntityLine('index.html'), false)
  assert.equal(allowsLegalEntityLine('apply/index.html'), false)
  assert.equal(allowsLegalEntityLine('assets/index-Abc123.js'), false)
  assert.equal(allowsLegalEntityLine('assets/legal-pages.js'), false)

  for (const file of ['privacy/index.html', 'terms/index.html', 'assets/legal-pages-Abc123.js']) {
    assert.equal(strayPublicNammco(`${footer}\n${entity}`, file), false, file)
    assert.equal(strayPublicNammco(FOOTER_NAMMCO_CREDIT, file), false, file)
  }

  const blockedFiles = ['index.html', 'apply/index.html', 'for-members/index.html', 'assets/index-Abc123.js', 'assets/Footer-Abc123.js']
  for (const file of blockedFiles) {
    assert.equal(strayPublicNammco(entity, file), true, file)
    assert.equal(strayPublicNammco(LEGAL_ENTITY_LINE, file), true, file)
    assert.equal(strayPublicNammco(LEGAL_ENTITY_CR, file), true, file)
    assert.equal(strayPublicNammco(footer, file), false, file)
  }

  for (const file of ['privacy/index.html', 'terms/index.html']) {
    assert.equal(strayPublicNammco(`${entity}\nvisit nammco`, file), true, file)
    assert.equal(strayPublicNammco(`${entity}\nNAMMCO`, file), true, file)
    assert.equal(strayPublicNammco(`${entity}\nNammco`, file), true, file)
    assert.equal(strayPublicNammco(`${entity}\npowered by NAMMCO`, file), true, file)
    assert.equal(strayPublicNammco(`${entity}\nnammco.com`, file), true, file)
    assert.equal(strayPublicNammco(`X${LEGAL_ENTITY_LINE}`, file), true, file)
  }
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

import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { FAQ, MARKETING_PAGES, pageGraph, publicFaqItems, publicMarketingTitle } from '../src/content/seo.ts'
import {
  CONSIDERATION_NOTE,
  HOW_IT_WORKS_HEADING,
  howItWorksHeading,
  NO_INSTANT_ACCOUNT_LINE,
  PUBLIC_PROCESS_STEPS,
  publicProcessSteps,
} from '../src/content/twoTierCopy.ts'
import {
  isTwoTierRegisterEnabled,
  publicConsiderationCta,
  setTwoTierRegisterForTests,
} from '../src/lib/twoTierRegister.ts'
import { LANDING_PREVIEW_EXAMPLES } from '../src/lib/landingPreview.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

function visibleText(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
}

/** Counsel copy may use ordinary English words that the marketing flag test also watches. */
function withoutLegalDocs(html: string) {
  return html.replace(/<article\b[^>]*data-legal-doc="true"[\s\S]*?<\/article>/g, ' ')
}

function anchors(html: string) {
  return [...html.matchAll(/<a\b[^>]*data-consideration-cta="public"[^>]*>[\s\S]*?<\/a>/g)].map((match) => {
    const tag = match[0]
    const href = tag.match(/href="([^"]*)"/)?.[1] ?? ''
    const text = tag.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    return { href, text }
  })
}

const PUBLIC_PAGES = [
  ['LandingPage', '/src/pages/LandingPage.tsx', 'LandingPage', '/'],
  ['HowItWorksPage', '/src/pages/HowItWorksPage.tsx', 'HowItWorksPage', '/how-it-works'],
  ['ForMembersPage', '/src/pages/ForMembersPage.tsx', 'ForMembersPage', '/for-members'],
  ['ForCapitalPage', '/src/pages/ForCapitalPage.tsx', 'ForCapitalPage', '/for-capital'],
  ['AboutPage', '/src/pages/AboutPage.tsx', 'AboutPage', '/about'],
  ['PartnersPage', '/src/pages/PartnersPage.tsx', 'PartnersPage', '/partners'],
  ['TermsPage', '/src/pages/TermsPage.tsx', 'TermsPage', '/terms'],
  ['PrivacyPage', '/src/pages/PrivacyPage.tsx', 'PrivacyPage', '/privacy'],
] as const

test('the register switch is gone and consideration always opens apply', () => {
  assert.equal(isTwoTierRegisterEnabled(), false)
  setTwoTierRegisterForTests(true)
  try {
    assert.equal(isTwoTierRegisterEnabled(), false)
    assert.deepEqual(publicConsiderationCta(), { to: '/apply', label: 'Apply for consideration' })
  } finally {
    setTwoTierRegisterForTests(null)
  }
  assert.equal(howItWorksHeading(), HOW_IT_WORKS_HEADING)
  assert.equal(HOW_IT_WORKS_HEADING, 'Apply. Review. Create your account.')
  assert.equal(publicProcessSteps().length, 3)
  assert.deepEqual(
    publicProcessSteps().map((step) => step.detail),
    PUBLIC_PROCESS_STEPS.map((step) => step.detail),
  )
  assert.equal(publicProcessSteps()[0]?.detail, 'Apply. Three short steps. Takes only your details and your board record.')
  assert.equal(
    publicProcessSteps()[1]?.detail,
    'Our admin team reviews. A named person reads every application. There is no fixed response time.',
  )
  assert.equal(
    publicProcessSteps()[2]?.detail,
    'Create your account. If you are accepted, we email you a private link. Your account is created then, not before.',
  )
  assert.equal(CONSIDERATION_NOTE, 'Three short steps. No account needed yet.')
  const applyFaq = publicFaqItems(FAQ).find((item) => item.question === 'How do I apply?')
  assert.equal(applyFaq?.to, '/apply')
  assert.equal(applyFaq?.toLabel, 'Apply for consideration')
  assert.match(applyFaq?.answer ?? '', /Three short steps/)
  assert.equal(
    publicMarketingTitle(MARKETING_PAGES['/how-it-works']),
    'How Board Arabia works: apply, review, invite',
  )
  for (const page of Object.values(MARKETING_PAGES)) {
    const title = publicMarketingTitle(page)
    assert.equal(/\bRegister\b/i.test(title), false, title)
    assert.equal(/\bComplete\b/i.test(title), false, title)
    if (page.path !== '/partners') {
      assert.equal(/\bRegister\b/i.test(page.description), false, page.description)
    }
    assert.equal(/\bComplete\b/i.test(page.description), false, page.description)
  }
  const graph = JSON.stringify(pageGraph({ path: '/', title: 'Home', description: 'Home page description for the test graph only.' }))
  assert.equal(graph.includes('An account opens'), false)
  assert.equal(graph.includes('Three short steps'), true)
})

test('the register env switch is not read by application code', () => {
  const hits = walk(path.join(root, 'src'))
    .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
    .filter((file) => readFileSync(file, 'utf8').includes('VITE_TWO_TIER_REGISTER_ENABLED'))
    .map((file) => path.relative(root, file))
  assert.deepEqual(hits, [])
  assert.equal(read('.env.example').includes('VITE_TWO_TIER_REGISTER_ENABLED'), false)
  assert.match(read('.github/workflows/pages.yml'), /VITE_TWO_TIER_REGISTER_ENABLED: 'false'/)
  const added = [
    'src/lib/twoTierRegister.ts',
    'src/content/twoTierCopy.ts',
    'src/pages/HowItWorksPage.tsx',
    'src/pages/LandingPage.tsx',
    'src/components/Nav.tsx',
    'src/components/Footer.tsx',
    'src/components/CtaBand.tsx',
  ]
  for (const file of added) {
    const source = read(file)
    assert.equal(source.includes('\u2014'), false, file)
    assert.equal(source.includes('\u2013'), false, file)
    assert.equal(/\bBasic\b/.test(source), false, file)
  }
})

test('public consideration buttons stay on apply after the register switch is removed', async () => {
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const gate = await vite.ssrLoadModule('/src/lib/twoTierRegister.ts')
    const pages = []
    for (const [name, file, exportName, route] of PUBLIC_PAGES) {
      const mod = await vite.ssrLoadModule(file)
      pages.push({ name, route, View: mod[exportName] })
    }
    const applyMod = await vite.ssrLoadModule('/src/pages/ApplyPage.tsx')
    const previewMod = await vite.ssrLoadModule('/src/components/DashboardPreviewFrame.tsx')
    const stickyMod = await vite.ssrLoadModule('/src/components/landing/StickyApply.tsx')

    const renderSet = () => {
      gate.setTwoTierRegisterForTests(true)
      const html = pages.map(({ route, View }) =>
        renderToStaticMarkup(
          createElement(MemoryRouter, { initialEntries: [route] }, createElement(View)),
        ),
      )
      const preview = renderToStaticMarkup(
        createElement(
          MemoryRouter,
          null,
          createElement(previewMod.DashboardPreviewFrame, {
            deals: LANDING_PREVIEW_EXAMPLES,
            locked: true,
            reduceMotion: true,
            density: 'landing',
          }),
        ),
      )
      const apply = renderToStaticMarkup(
        createElement(MemoryRouter, { initialEntries: ['/apply'] }, createElement(applyMod.ApplyPage)),
      )
      return { html: html.join('\n'), preview, apply, combined: `${html.join('\n')}\n${preview}\n${apply}` }
    }

    const off = renderSet()
    const offCtas = anchors(`${off.combined}\n${stickyHtml(stickyMod)}`)
    assert.equal(offCtas.length > 8, true)
    for (const cta of offCtas) {
      assert.equal(cta.href, '/apply/', cta.text)
      assert.equal(cta.text, 'Apply for consideration', cta.text)
    }
    assert.equal(/pre-vet/i.test(off.combined), false)
    assert.match(off.apply, /The first step is Check/)
    assert.equal(off.combined.includes('href="/register"'), false)
    assert.equal(off.combined.includes('Register for consideration'), false)
    assert.match(off.apply, /Submit for consideration/)
    assert.match(off.apply, /LinkedIn/)
    assert.match(off.apply, /Turnover/)
    assert.equal(off.apply.includes('register-candidate'), false)
    assert.equal(off.apply.includes('Security check'), false)
    const banned = [
      'Start with an account',
      'An account opens',
      'after you confirm your email',
      'inside the account',
      'same sign-in',
      'Register for consideration',
    ]
    for (const line of banned) {
      assert.equal(withoutLegalDocs(off.combined).includes(line), false, line)
    }
    assert.equal(off.html.includes(NO_INSTANT_ACCOUNT_LINE), true)
    assert.equal(off.html.includes(CONSIDERATION_NOTE), true)
    assert.equal(off.html.includes('Apply. Review. Create your account.'), true)
    assert.equal(off.html.includes('Register. Complete. Review.'), false)
    for (const step of PUBLIC_PROCESS_STEPS) {
      assert.equal(off.html.includes(step.detail), true, step.detail)
    }
    const offCopy = visibleText(withoutLegalDocs(off.combined))
    assert.equal(/\bRegister\b/i.test(offCopy), false, offCopy.match(/.{0,40}\bRegister\b.{0,40}/i)?.[0])
    assert.equal(/\bComplete\b/i.test(offCopy), false, offCopy.match(/.{0,40}\bComplete\b.{0,40}/i)?.[0])
    assert.match(read('src/pages/ApplyPage.tsx'), /submitApplication\(/)
    assert.match(read('src/lib/supabase.ts'), /\/submit-application/)
    assert.equal(/registerCandidate\(/.test(read('src/pages/ApplyPage.tsx')), false)
  } finally {
    const gate = await vite.ssrLoadModule('/src/lib/twoTierRegister.ts')
    gate.setTwoTierRegisterForTests(null)
    setTwoTierRegisterForTests(null)
    await vite.close()
  }
})

function stickyHtml(mod: { StickyApply: unknown }) {
  const previous = globalThis.window
  globalThis.window = {
    matchMedia(query: string) {
      return {
        matches: query.includes('767'),
        addEventListener() {},
        removeEventListener() {},
      }
    },
  } as unknown as Window & typeof globalThis
  try {
    return renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(mod.StickyApply as never, { menuOpen: false })),
    )
  } finally {
    if (previous === undefined) delete (globalThis as { window?: unknown }).window
    else globalThis.window = previous
  }
}

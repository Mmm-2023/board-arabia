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
  ACCOUNT_FLOW_PROMISES,
  ACCOUNT_OPENS_LINE,
  HOW_IT_WORKS_HEADING_OFF,
  howItWorksHeading,
  NO_INSTANT_ACCOUNT_LINE,
  publicProcessSteps,
} from '../src/content/twoTierCopy.ts'
import {
  publicConsiderationCta,
  setTwoTierRegisterForTests,
  twoTierRegisterEnabled,
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

test('two tier register flag accepts only the exact string true', () => {
  assert.equal(twoTierRegisterEnabled(undefined), false)
  assert.equal(twoTierRegisterEnabled(''), false)
  assert.equal(twoTierRegisterEnabled('false'), false)
  assert.equal(twoTierRegisterEnabled('TRUE'), false)
  assert.equal(twoTierRegisterEnabled('1'), false)
  assert.equal(twoTierRegisterEnabled('true'), true)
  assert.deepEqual(publicConsiderationCta(false), { to: '/apply', label: 'Apply for consideration' })
  assert.deepEqual(publicConsiderationCta(true), { to: '/register', label: 'Register for consideration' })
})

test('account flow lines and Register or Complete wording stay behind the flag', () => {
  setTwoTierRegisterForTests(false)
  try {
    assert.equal(howItWorksHeading(), HOW_IT_WORKS_HEADING_OFF)
    assert.equal(HOW_IT_WORKS_HEADING_OFF, 'Apply. Review. Invite.')
    assert.equal(publicProcessSteps()[0]?.title, 'Pre-vet')
    assert.equal(publicProcessSteps().some((step) => step.home.includes('An account opens')), false)
    assert.equal(publicFaqItems(FAQ)[2]?.answer.includes('Submit the pre-vet form'), true)
    assert.equal(publicFaqItems(FAQ)[2]?.to, '/apply')
    assert.equal(publicFaqItems(FAQ)[2]?.toLabel, 'Apply for consideration')
    assert.equal(
      publicMarketingTitle(MARKETING_PAGES['/how-it-works']),
      'How Board Arabia works: apply, review, invite',
    )
    for (const page of Object.values(MARKETING_PAGES)) {
      const title = publicMarketingTitle(page)
      assert.equal(/\bRegister\b/i.test(title), false, title)
      assert.equal(/\bComplete\b/i.test(title), false, title)
      assert.equal(/\bRegister\b/i.test(page.description), false, page.description)
      assert.equal(/\bComplete\b/i.test(page.description), false, page.description)
    }
    const graph = JSON.stringify(pageGraph({ path: '/', title: 'Home', description: 'Home page description for the test graph only.' }))
    assert.equal(graph.includes('An account opens'), false)
    assert.equal(graph.includes('Submit the pre-vet form'), true)
  } finally {
    setTwoTierRegisterForTests(null)
  }

  setTwoTierRegisterForTests(true)
  try {
    assert.equal(howItWorksHeading(), 'Register. Complete. Review.')
    assert.equal(
      publicMarketingTitle(MARKETING_PAGES['/how-it-works']),
      'How Board Arabia works: register, complete, review',
    )
    assert.equal(publicProcessSteps()[0]?.home, 'An account opens so you can see how the membership works.')
    assert.equal(publicProcessSteps()[1]?.home, 'Complete your credentials inside the account.')
    assert.equal(publicProcessSteps()[4]?.home, 'On approval, everything opens with the same sign-in.')
    assert.equal(publicFaqItems(FAQ).find((item) => item.question === 'How do I apply?')?.to, '/register')
    assert.match(publicFaqItems(FAQ).find((item) => item.question === 'How do I apply?')?.answer ?? '', /An account opens/)
    const graph = JSON.stringify(pageGraph({ path: '/how-it-works', title: 'How', description: 'How it works description for the test graph only.' }))
    assert.equal(graph.includes('An account opens'), true)
    assert.equal(graph.includes(NO_INSTANT_ACCOUNT_LINE), false)
  } finally {
    setTwoTierRegisterForTests(null)
  }
})

test('the flag env is read in one helper', () => {
  const hits = walk(path.join(root, 'src'))
    .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
    .filter((file) => readFileSync(file, 'utf8').includes('VITE_TWO_TIER_REGISTER_ENABLED'))
    .map((file) => path.relative(root, file))
  assert.deepEqual(hits, ['src/lib/twoTierRegister.ts'])
  assert.match(read('.env.example'), /VITE_TWO_TIER_REGISTER_ENABLED=false/)
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

test('flag off keeps /apply and the legacy form; flag on points CTAs at /register', async () => {
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

    const renderSet = (enabled: boolean) => {
      gate.setTwoTierRegisterForTests(enabled)
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

    gate.setTwoTierRegisterForTests(false)
    const off = renderSet(false)
    const offCtas = anchors(`${off.combined}\n${stickyHtml(stickyMod, false)}`)
    assert.equal(offCtas.length > 8, true)
    for (const cta of offCtas) {
      assert.equal(cta.href, '/apply', cta.text)
      assert.equal(cta.text === 'Apply for consideration' || cta.text === 'the pre-vet', true, cta.text)
    }
    assert.equal(off.combined.includes('href="/register"'), false)
    assert.match(off.apply, /Submit for consideration/)
    assert.match(off.apply, /LinkedIn/)
    assert.match(off.apply, /Turnover/)
    assert.equal(off.apply.includes('register-candidate'), false)
    assert.equal(off.apply.includes('Security check'), false)
    for (const line of ACCOUNT_FLOW_PROMISES) {
      assert.equal(off.combined.includes(line), false, line)
    }
    assert.equal(off.html.includes(NO_INSTANT_ACCOUNT_LINE), true)
    assert.equal(off.html.includes(ACCOUNT_OPENS_LINE), false)
    assert.equal(off.html.includes('Apply. Review. Invite.'), true)
    assert.equal(off.html.includes('Register. Complete. Review.'), false)
    const offCopy = visibleText(off.combined)
    assert.equal(/\bRegister\b/i.test(offCopy), false, offCopy.match(/.{0,40}\bRegister\b.{0,40}/i)?.[0])
    assert.equal(/\bComplete\b/i.test(offCopy), false, offCopy.match(/.{0,40}\bComplete\b.{0,40}/i)?.[0])

    const on = renderSet(true)
    const onCtas = anchors(`${on.combined}\n${stickyHtml(stickyMod, true)}`)
    assert.equal(onCtas.length, offCtas.length)
    for (const cta of onCtas) {
      assert.equal(cta.href, '/register', cta.text)
      assert.equal(cta.text, 'Register for consideration')
    }
    assert.equal(on.combined.includes('href="/apply"'), false)
    assert.match(on.apply, /Submit for consideration/)
    assert.match(on.apply, /LinkedIn/)
    assert.equal(on.apply.includes('register-candidate'), false)
    assert.equal(on.html.includes('Register. Complete. Review.'), true)
    assert.equal(on.html.includes('Apply. Review. Invite.'), false)
    assert.equal(on.html.includes(ACCOUNT_OPENS_LINE), true)
    assert.equal(on.html.includes(NO_INSTANT_ACCOUNT_LINE), false)
    assert.equal(on.html.includes('inside the account'), true)
    assert.equal(on.html.includes('same sign-in'), true)
    assert.equal(on.html.includes('Start with an account'), false)
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

function stickyHtml(mod: { StickyApply: unknown }, enabled: boolean) {
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
    const gateOn = enabled
    void gateOn
    return renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(mod.StickyApply as never, { menuOpen: false })),
    )
  } finally {
    if (previous === undefined) delete (globalThis as { window?: unknown }).window
    else globalThis.window = previous
  }
}

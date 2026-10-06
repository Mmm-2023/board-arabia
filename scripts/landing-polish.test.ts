import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { FAQ, HOME_SHARE_TITLE, MARKETING_PAGES, OG_DESCRIPTION, pageGraph, publicFaqItems } from '../src/content/seo.ts'

const PUBLIC_COPY_SOURCES = [
  'src/pages/LandingPage.tsx',
  'src/pages/ForMembersPage.tsx',
  'src/pages/ForCapitalPage.tsx',
  'src/pages/PartnersPage.tsx',
  'src/pages/AboutPage.tsx',
  'src/pages/HowItWorksPage.tsx',
  'src/pages/ApplyPage.tsx',
  'src/content/seo.ts',
  'src/content/marketing.ts',
  'src/content/landingFeatures.ts',
  'src/content/twoTierCopy.ts',
  'src/components/CtaBand.tsx',
  'src/components/Footer.tsx',
  'src/components/Nav.tsx',
  'index.html',
]

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

test('home title, og title, and twitter title mirror the live H1', () => {
  assert.equal(HOME_SHARE_TITLE, 'Board Arabia | Where Saudi boardrooms meet international capital')
  assert.equal(MARKETING_PAGES['/'].title, HOME_SHARE_TITLE)
  assert.equal(MARKETING_PAGES['/'].description, OG_DESCRIPTION)
  assert.equal(OG_DESCRIPTION.includes('counterparts'), false)
  assert.match(OG_DESCRIPTION, /international capital/)
  assert.equal(OG_DESCRIPTION.includes('\u2014'), false)
  assert.equal(OG_DESCRIPTION.includes('\u2013'), false)
  const html = read('index.html')
  assert.match(html, /<title>Board Arabia \| Where Saudi boardrooms meet international capital<\/title>/)
  assert.match(html, /property="og:title" content="Board Arabia \| Where Saudi boardrooms meet international capital"/)
  assert.match(html, /name="twitter:title" content="Board Arabia \| Where Saudi boardrooms meet international capital"/)
  assert.equal(html.includes('counterparts'), false)
})

test('home FAQ board network sentence matches FAQPage JSON-LD', () => {
  const shown = publicFaqItems(FAQ)
  const item = shown.find((entry) => entry.question === 'What is Board Arabia?')
  assert.ok(item)
  assert.equal((item.answer.match(/board network/g) || []).length, 1)
  assert.equal(shown.reduce((count, entry) => count + (entry.answer.match(/board network/g) || []).length, 0), 1)
  assert.equal(item.answer.includes('\u2014'), false)
  assert.equal(item.answer.includes('\u2013'), false)
  assert.equal(item.answer.toLowerCase().includes('the desk'), false)
  const graph = pageGraph(MARKETING_PAGES['/']) as {
    '@graph': Array<Record<string, unknown>>
  }
  const faq = graph['@graph'].find((node) => node['@type'] === 'FAQPage') as {
    mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }>
  }
  assert.equal(faq.mainEntity.length, shown.length)
  for (const entry of faq.mainEntity) {
    const visible = shown.find((row) => row.question === entry.name)
    assert.equal(entry.acceptedAnswer.text, visible?.answer, entry.name)
  }
})

test('organization logo and image are absolute URLs that exist in dist', () => {
  const graph = pageGraph(MARKETING_PAGES['/']) as {
    '@graph': Array<Record<string, unknown>>
  }
  const org = graph['@graph'].find((node) => node['@type'] === 'Organization') as {
    logo: string
    image: string
  }
  assert.equal(org.logo, 'https://boardarabia.com/favicon.svg')
  assert.equal(org.image, 'https://boardarabia.com/og-board-arabia.png')
  for (const url of [org.logo, org.image]) {
    const rel = url.slice('https://boardarabia.com/'.length)
    assert.equal(existsSync(path.join(root, 'public', rel)), true, `public/${rel}`)
    assert.equal(existsSync(path.join(root, 'dist', rel)), true, `dist/${rel}`)
  }
  const home = readFileSync(path.join(root, 'dist', 'index.html'), 'utf8')
  assert.match(home, /<title>Board Arabia \| Where Saudi boardrooms meet international capital<\/title>/)
  assert.match(home, /property="og:title" content="Board Arabia \| Where Saudi boardrooms meet international capital"/)
  assert.match(home, /name="twitter:title" content="Board Arabia \| Where Saudi boardrooms meet international capital"/)
  assert.match(home, /"logo":"https:\/\/boardarabia\.com\/favicon\.svg"/)
  assert.match(home, /"image":"https:\/\/boardarabia\.com\/og-board-arabia\.png"/)
  const description = home.match(/<meta name="description" content="([^"]*)"/)?.[1] || ''
  const ogDescription = home.match(/property="og:description" content="([^"]*)"/)?.[1] || ''
  const twitterDescription = home.match(/name="twitter:description" content="([^"]*)"/)?.[1] || ''
  assert.equal(description.includes('counterparts'), false)
  assert.equal(ogDescription.includes('counterparts'), false)
  assert.equal(twitterDescription.includes('counterparts'), false)
  assert.match(description, /international capital/)
})

test('hero CTA still points at /apply', async () => {
  const source = read('src/pages/LandingPage.tsx')
  const line = source.split('\n').findIndex((row) => row.includes('id="hero-apply"')) + 1
  assert.equal(line > 1, true, 'hero-apply line')
  const app = read('src/App.tsx').split('\n')
  const gate = app.findIndex((row) => row.includes('path="/apply"')) + 1
  assert.match(app[gate - 1] || '', /element=\{<ApplyPage/)
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const mod = await vite.ssrLoadModule('/src/pages/LandingPage.tsx')
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, { initialEntries: ['/'] }, createElement(mod.LandingPage)),
    )
    const hero = (html.match(/<a\b[^>]*>/g) || []).find((tag) => tag.includes('id="hero-apply"'))
    assert.ok(hero, 'hero anchor')
    assert.match(hero, /href="\/apply"/)
    assert.match(html, /Complimentary founding membership, given in exchange for time, judgment and introductions\./)
    assert.match(html, /It is a board network for Saudi and international rooms/)
    assert.match(html, /Opening doors/)
  } finally {
    await vite.close()
  }
  const lockup = read('src/components/BrandLockup.tsx')
  assert.match(lockup, /alt=\{markOnly \? 'Board Arabia' : ''\}/)
  assert.match(read('src/components/Nav.tsx'), /BrandLockup/)
  assert.match(read('src/components/Footer.tsx'), /BrandLockup/)
  const doors = read('src/components/landing/graphics.tsx')
  const icon = doors.slice(doors.indexOf('export function IconDoors'))
  assert.match(icon, /width="44" height="44"/)
  assert.match(icon, /aria-hidden="true"/)
  assert.match(icon, /strokeWidth="1\.6"/)
  assert.match(icon, /#B8896A/)
  assert.match(icon, /M14 12 H30 V32 H14 Z/)
  assert.match(icon, /M16 14 L25 17\.2 V28\.6 L16 31 Z/)
  assert.equal(source.includes('\u2014'), false)
  assert.equal(source.includes('\u2013'), false)
})

test('public marketing body does not say the desk outside Who runs the desk', async () => {
  for (const file of PUBLIC_COPY_SOURCES) {
    assert.equal(/the desk/i.test(read(file)), false, file)
    assert.equal(read(file).includes('\u2014'), false, file)
    assert.equal(read(file).includes('\u2013'), false, file)
  }
  const who = read('src/components/WhoRunsTheDesk.tsx')
  assert.match(who, /Who runs the desk/)
  assert.equal(who.replace(/Who runs the desk/g, '').toLowerCase().includes('the desk'), false)
  for (const page of Object.values(MARKETING_PAGES)) {
    const graph = JSON.stringify(pageGraph(page))
    assert.equal(/the desk/i.test(graph), false, page.path)
  }
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const pages = [
      ['/src/pages/LandingPage.tsx', 'LandingPage', '/'],
      ['/src/pages/ForMembersPage.tsx', 'ForMembersPage', '/for-members'],
      ['/src/pages/ForCapitalPage.tsx', 'ForCapitalPage', '/for-capital'],
      ['/src/pages/PartnersPage.tsx', 'PartnersPage', '/partners'],
      ['/src/pages/AboutPage.tsx', 'AboutPage', '/about'],
      ['/src/pages/HowItWorksPage.tsx', 'HowItWorksPage', '/how-it-works'],
      ['/src/pages/ApplyPage.tsx', 'ApplyPage', '/apply'],
    ] as const
    for (const [path, name, route] of pages) {
      const mod = await vite.ssrLoadModule(path)
      const html = renderToStaticMarkup(
        createElement(MemoryRouter, { initialEntries: [route] }, createElement(mod[name])),
      )
      const body = html.replace(/Who runs the desk/g, '')
      assert.equal(/the desk/i.test(body), false, route)
      if (route === '/apply') assert.match(html, /Our admin team reviews your credentials/)
      if (route === '/') assert.match(html, /Mandates are capital briefs that admin reviews before members see them/)
    }
    const legalPages = [
      ['/src/pages/PrivacyPage.tsx', 'PrivacyPage', '/privacy'],
      ['/src/pages/TermsPage.tsx', 'TermsPage', '/terms'],
    ] as const
    for (const [path, name, route] of legalPages) {
      const mod = await vite.ssrLoadModule(path)
      const html = renderToStaticMarkup(
        createElement(MemoryRouter, { initialEntries: [route] }, createElement(mod[name])),
      )
      const body = html.replace(/Who runs the desk/g, '')
      assert.equal(/the desk/i.test(body), false, route)
      assert.equal(html.includes('Ask the desk'), false, route)
    }
  } finally {
    await vite.close()
  }
  const label = read('src/pages/dashboard/DirectoryIntroAction.tsx')
  assert.match(label, /Ask admin to introduce us/)
  assert.match(label, /If they accept, admin sends the introduction\./)
  assert.equal(/the desk/i.test(label), false)
  assert.equal(label.includes('Ask the desk'), false)
  for (const file of [
    'src/content/legal/privacy.en.ts',
    'src/content/legal/terms.en.ts',
    'src/pages/apply/RegisterScreen.tsx',
    'src/pages/dashboard/LeaveBoardArabia.tsx',
    'src/lib/memberIntros.ts',
  ]) {
    assert.equal(/the desk/i.test(read(file)), false, file)
    assert.equal(read(file).includes('Ask the desk'), false, file)
    assert.equal(read(file).includes('\u2014'), false, file)
    assert.equal(read(file).includes('\u2013'), false, file)
  }
})

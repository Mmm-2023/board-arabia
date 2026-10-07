import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { PARTNER_CATEGORIES } from '../src/data/partnerCategories.ts'
import { redirectLocation, resolveRedirect } from '../src/shell/redirects.ts'
import { setTwoTierRegisterForTests } from '../src/lib/twoTierRegister.ts'
import { appShells } from './shell-manifest.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)

/** User-facing partner wording. Seat value 'sponsor', routes, and function names stay. */
const BANNED = /\bsponsor(s|ship|ships|ed)?\b/i
const ECOSYSTEM = 'Founding Ecosystem Partner'

const RULE_04 =
  "A partner does not receive the directory. A partner sees a member's directory card only when that member chooses to show it. No partner messages members around our admin team."
const CAPITAL_BODY =
  'Private equity firms and investors with a board seat, a chairman search, or a mandate that should not travel as a cold note.'
const STORED_EQUITY_GLOSS = 'Firms acquiring or governing companies.'

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function stripComments(source: string) {
  let out = ''
  let i = 0
  while (i < source.length) {
    const quote = source[i]
    if (quote === '"' || quote === "'" || quote === '`') {
      const start = i
      i += 1
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2
          continue
        }
        if (quote === '`' && source[i] === '$' && source[i + 1] === '{') {
          i += 2
          let depth = 1
          while (i < source.length && depth > 0) {
            if (source[i] === '{') depth += 1
            else if (source[i] === '}') depth -= 1
            i += 1
          }
          continue
        }
        if (source[i] === quote) {
          i += 1
          break
        }
        i += 1
      }
      out += source.slice(start, i)
      continue
    }
    if (source.startsWith('//', i)) {
      while (i < source.length && source[i] !== '\n') i += 1
      continue
    }
    if (source.startsWith('/*', i)) {
      i += 2
      while (i < source.length && !source.startsWith('*/', i)) i += 1
      i += 2
      out += ' '
      continue
    }
    out += source[i]
    i += 1
  }
  return out
}

function stripImports(source: string) {
  return source
    .replace(/^\s*import[\s\S]*?from\s*['"][^'"]+['"]\s*;?/gm, '')
    .replace(/^\s*import\s*['"][^'"]+['"]\s*;?/gm, '')
    .replace(/^\s*export\s+(?:type\s+)?\{[^}]*\}\s*from\s*['"][^'"]+['"]\s*;?/gm, '')
}

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, out)
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue
    if (/\.test\.(ts|tsx)$/.test(entry)) continue
    const rel = path.relative(root, full).split(path.sep).join('/')
    if (rel.startsWith('src/content/legal/')) continue
    out.push(rel)
  }
}

function codeValue(literal: string) {
  const masked = literal.replace(/\binvite-sponsor\b/g, '').replaceAll('/dashboard/sponsorship', '')
  if (!BANNED.test(masked) && !masked.includes(ECOSYSTEM)) return true
  if (literal === 'sponsor' || literal === 'sponsorship') return true
  if (!/\s/.test(literal) && !literal.includes(ECOSYSTEM)) {
    const matches = masked.match(/\bsponsor(s|ship|ships|ed)?\b/gi) || []
    return matches.length > 0 && matches.every((token) => token === 'sponsor')
  }
  return false
}

function literalHits(literal: string, where: string, hits: string[]) {
  if (codeValue(literal)) return
  const shown = literal.replace(/\s+/g, ' ').trim().slice(0, 160)
  hits.push(`${where}: ${shown}`)
}

function scan(rel: string, hits: string[]) {
  const text = stripImports(stripComments(read(rel)))
  let i = 0
  while (i < text.length) {
    const quote = text[i]
    if (quote !== '"' && quote !== "'" && quote !== '`') {
      i += 1
      continue
    }
    i += 1
    let body = ''
    while (i < text.length) {
      const ch = text[i]
      if (ch === '\\') {
        body += text[i + 1] ?? ''
        i += 2
        continue
      }
      if (quote === '`' && ch === '$' && text[i + 1] === '{') {
        literalHits(body, rel, hits)
        body = ''
        i += 2
        let depth = 1
        while (i < text.length && depth > 0) {
          if (text[i] === '{') depth += 1
          else if (text[i] === '}') depth -= 1
          i += 1
        }
        continue
      }
      if (ch === quote) {
        i += 1
        break
      }
      body += ch
      i += 1
    }
    literalHits(body, rel, hits)
  }
  const jsx = />([^<>{}]+)</g
  let match: RegExpExecArray | null
  while ((match = jsx.exec(text))) {
    const bit = (match[1] || '').replace(/\s+/g, ' ').trim()
    if (!bit || /=>|\bconst\b|\bfunction\b|\breturn\b|=/.test(bit)) continue
    literalHits(bit, rel, hits)
  }
}

test('user-facing copy says partner, and legal files stay out of this gate', () => {
  const files: string[] = []
  walk(path.join(root, 'src'), files)
  walk(path.join(root, 'supabase/functions'), files)
  const hits: string[] = []
  for (const rel of files) scan(rel, hits)
  assert.deepEqual(hits, [])
  assert.match(read('src/content/legal/terms.en.ts'), /Founding, Member and Sponsor/)
  assert.match(read('src/content/legal/privacy.en.ts'), /Sponsors and payments/)
  assert.equal(read('src/lib/sponsorLabel.ts').includes("SPONSOR_LABEL = 'Partner'"), true)
  assert.match(read('src/lib/member.ts'), /seat === 'sponsor'/)
  assert.match(read('src/lib/membershipTiers.ts'), /sponsor: 'Partner'/)
  assert.equal(PARTNER_CATEGORIES.find((item) => item.slug === 'private-equity')?.gloss, STORED_EQUITY_GLOSS)
  assert.equal(/\bsponsor/i.test(STORED_EQUITY_GLOSS), false)
  assert.match(read('src/content/marketing.ts'), /PARTNER_CATEGORIES/)
  assert.match(read('src/pages/ForCapitalPage.tsx'), /Private equity firms and investors with a board seat/)
})

test('sponsorship redirects to partnership and both shells stay prerendered', () => {
  assert.equal(resolveRedirect('/dashboard/sponsorship'), '/dashboard/partnership')
  assert.equal(resolveRedirect('/dashboard/partnership'), null)
  assert.equal(resolveRedirect('/dashboard/sponsors'), null)
  assert.equal(resolveRedirect('/dashboard/people/partners'), null)
  assert.deepEqual(
    redirectLocation({ pathname: '/dashboard/sponsorship/', search: '?from=old', hash: '#package' }),
    { pathname: '/dashboard/partnership', search: '?from=old', hash: '#package' },
  )
  const shells = appShells().map((item) => item.path)
  assert.equal(shells.includes('/dashboard/sponsorship'), true)
  assert.equal(shells.includes('/dashboard/partnership'), true)
  assert.match(read('src/App.tsx'), /path="partnership" element=\{<SponsorshipPage/)
  assert.match(read('src/App.tsx'), /path="sponsorship" element=\{<RedirectKeep/)
  assert.match(read('src/shell/destinations.ts'), /label: 'Partnership', to: '\/dashboard\/partnership'/)
  assert.equal(read('src/App.tsx').includes('path="sponsors"'), false)
})

test('public /partners and /for-capital send Apply to /apply and Log in to /login', async () => {
  setTwoTierRegisterForTests(false)
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
  try {
    const partners = await vite.ssrLoadModule('/src/pages/PartnersPage.tsx')
    const capital = await vite.ssrLoadModule('/src/pages/ForCapitalPage.tsx')
    const partnersHtml = renderToStaticMarkup(
      createElement(MemoryRouter, { initialEntries: ['/partners'] }, createElement(partners.PartnersPage)),
    )
    const capitalHtml = renderToStaticMarkup(
      createElement(MemoryRouter, { initialEntries: ['/for-capital'] }, createElement(capital.ForCapitalPage)),
    )
    for (const html of [partnersHtml, capitalHtml]) {
      assert.match(html, /href="\/apply"/)
      assert.match(html, /href="\/login"/)
      assert.match(html, />\s*Log in\s*</)
      assert.match(html, />\s*Apply for consideration\s*</)
      assert.equal(html.includes(ECOSYSTEM), false)
      assert.equal(/\bsponsor/i.test(html), false)
      assert.equal(html.includes('\u2014') || html.includes('\u2013'), false)
    }
    const partnersText = partnersHtml.replace(/&#x27;|&apos;/g, "'")
    const capitalText = capitalHtml.replace(/&#x27;|&apos;/g, "'")
    assert.match(partnersText, /A partner does not receive the directory/)
    assert.equal(partnersText.includes(RULE_04), true)
    assert.equal(capitalText.includes(CAPITAL_BODY), true)
  } finally {
    setTwoTierRegisterForTests(null)
    await vite.close()
  }
})

function walkDist(dir: string, out: string[]) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      walkDist(full, out)
      continue
    }
    out.push(full)
  }
}

function builtSponsorHits(text: string) {
  let cleaned = text
  cleaned = cleaned.replaceAll('/dashboard/sponsorship', '')
  cleaned = cleaned.replaceAll('invite-sponsor', '')
  cleaned = cleaned.replaceAll('data-sponsorship', '')
  cleaned = cleaned.replaceAll('data-sponsor-card', '')
  cleaned = cleaned.replaceAll('data-seat-badge', '')
  cleaned = cleaned.replace(/sponsor-[a-z0-9-]+/g, '')
  cleaned = cleaned.replace(/['"`]sponsor['"`]/g, '')
  cleaned = cleaned.replace(/['"`]sponsorship['"`]/g, '')
  cleaned = cleaned.replace(/\.sponsors\b/g, '')
  cleaned = cleaned.replace(/\bsponsors\s*:/g, '')
  cleaned = cleaned.replace(/\b[A-Za-z0-9_]*sponsor[A-Za-z0-9_]*\b/gi, (token) => {
    if (token.includes('_')) return ''
    if (/[A-Z]/.test(token.slice(1)) && /[a-z]/.test(token)) return ''
    const lower = token.toLowerCase()
    if (['sponsor', 'sponsors', 'sponsorship', 'sponsorships', 'sponsored'].includes(lower)) return token
    return ''
  })
  cleaned = cleaned.replace(/\b[a-z0-9$.{}=,'`/-]*sponsor\b/g, (token) => {
    if (!/\s/.test(token) && !/sponsors|sponsorship|sponsored/i.test(token)) return ''
    return token
  })
  const hits: string[] = []
  const found = cleaned.match(/\bsponsor(s|ship|ships|ed)?\b/gi) || []
  for (const token of found) hits.push(token)
  if (cleaned.includes(ECOSYSTEM)) hits.push(ECOSYSTEM)
  return hits
}

test('built assets keep sponsor wording inside the legal-pages chunk', () => {
  const assets = path.join(root, 'dist/assets')
  assert.equal(existsSync(assets), true, 'dist/assets is missing; build before this test')
  const files = [] as string[]
  walkDist(assets, files)
  const outside: string[] = []
  let legalHit = false
  for (const file of files) {
    const rel = path.relative(path.join(root, 'dist'), file).split(path.sep).join('/')
    const text = readFileSync(file).toString('latin1')
    const legal = /\/legal-pages-[A-Za-z0-9_-]+\.js$/.test(`/${rel}`) || /^assets\/legal-pages-[A-Za-z0-9_-]+\.js$/.test(rel)
    if (legal) {
      if (/sponsor/i.test(text)) legalHit = true
      continue
    }
    const hits = builtSponsorHits(text)
    if (hits.length) outside.push(`${rel}: ${[...new Set(hits)].join(', ')}`)
  }
  assert.equal(legalHit, true)
  assert.deepEqual(outside, [])
})

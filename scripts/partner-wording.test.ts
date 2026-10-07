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

function hasSponsorWord(value: string) {
  const masked = value.replace(/\binvite-sponsor\b/g, '').replaceAll('/dashboard/sponsorship', '')
  return BANNED.test(masked) || masked.includes(ECOSYSTEM)
}

function isDataSponsor(context: string, literal: string) {
  if (literal !== 'sponsor' && literal !== 'sponsorship') return false
  if (/(?:===|!==|==|!=)\s*$/.test(context)) return true
  if (/(?:seat|role|tier|kind|status|enum)\s*:\s*$/i.test(context)) return true
  if (literal === 'sponsorship' && /path\s*=\s*$/.test(context)) return true
  return false
}

function isRenderedSponsor(context: string, literal: string) {
  if (!/^sponsor$/i.test(literal)) return false
  if (/(?:label|title|children|heading|message)\s*[:=]\s*$/i.test(context)) return true
  if (/\{\s*$/.test(context)) return true
  return false
}

function literalAllowed(literal: string, context: string) {
  if (isRenderedSponsor(context, literal)) return false
  if (!hasSponsorWord(literal)) return true
  if (isDataSponsor(context, literal)) return true
  if ((literal === 'sponsor' || literal === 'sponsorship') && !isRenderedSponsor(context, literal)) return true
  if (!/\s/.test(literal) && !literal.includes(ECOSYSTEM)) {
    const masked = literal.replace(/\binvite-sponsor\b/g, '').replaceAll('/dashboard/sponsorship', '')
    const matches = masked.match(/\bsponsor(s|ship|ships|ed)?\b/gi) || []
    if (matches.length > 0 && matches.every((token) => token === 'sponsor')) return true
    if (!BANNED.test(masked) && !masked.includes(ECOSYSTEM)) return true
  }
  return false
}

function pushHit(hits: string[], where: string, literal: string) {
  const shown = literal.replace(/\s+/g, ' ').trim().slice(0, 160)
  if (shown) hits.push(`${where}: ${shown}`)
}

function jsxTexts(source: string) {
  const texts: string[] = []
  let i = 0
  while (i < source.length) {
    if (source[i] !== '<') {
      i += 1
      continue
    }
    const prev = i === 0 ? '' : source[i - 1] || ''
    if (/[A-Za-z0-9.]/.test(prev)) {
      i += 1
      continue
    }
    const next = source[i + 1]
    if (next !== '/' && !/[A-Za-z]/.test(next || '')) {
      i += 1
      continue
    }
    const closing = next === '/'
    i += 1
    if (closing) i += 1
    while (i < source.length && /[A-Za-z0-9.]/.test(source[i] || '')) i += 1
    let quote: string | null = null
    let ended = false
    while (i < source.length) {
      const ch = source[i]
      if (quote) {
        if (ch === '\\') {
          i += 2
          continue
        }
        if (ch === quote) quote = null
        i += 1
        continue
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch
        i += 1
        continue
      }
      if (ch === '{') {
        i += 1
        let depth = 1
        while (i < source.length && depth > 0) {
          if (source[i] === '{') depth += 1
          else if (source[i] === '}') depth -= 1
          i += 1
        }
        continue
      }
      if (ch === '>') {
        i += 1
        ended = true
        break
      }
      i += 1
    }
    if (!ended || closing || source[i - 2] === '/') continue
    let buf = ''
    while (i < source.length && source[i] !== '<') {
      if (source[i] === '{') {
        if (buf.trim()) texts.push(buf)
        buf = ''
        i += 1
        const exprStart = i
        let depth = 1
        while (i < source.length && depth > 0) {
          if (source[i] === '{') depth += 1
          else if (source[i] === '}') depth -= 1
          if (depth > 0) i += 1
        }
        const expr = source.slice(exprStart, i).trim()
        const rendered = expr.match(/^(['"`])([\s\S]*)\1$/)
        if (rendered?.[2]) texts.push(rendered[2])
        if (source[i] === '}') i += 1
        continue
      }
      buf += source[i]
      i += 1
    }
    if (buf.trim()) texts.push(buf)
  }
  return texts
}

/** Same scan the repo gate uses. Test files and legal files are out of scope. */
export function partnerWordingHits(source: string, rel = 'src/fixture.tsx') {
  if (/\.test\.(ts|tsx)$/.test(rel) || rel.startsWith('src/content/legal/')) return []
  const text = stripImports(stripComments(source))
  const hits: string[] = []
  let i = 0
  while (i < text.length) {
    const quote = text[i]
    if (quote !== '"' && quote !== "'" && quote !== '`') {
      i += 1
      continue
    }
    const context = text.slice(Math.max(0, i - 48), i)
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
        if (!literalAllowed(body, context)) pushHit(hits, rel, body)
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
    if (!literalAllowed(body, context)) pushHit(hits, rel, body)
  }
  if (rel.endsWith('.tsx')) {
    for (const bit of jsxTexts(text)) {
      if (hasSponsorWord(bit)) pushHit(hits, rel, bit)
    }
  }
  return hits
}

function scan(rel: string, hits: string[]) {
  hits.push(...partnerWordingHits(read(rel), rel))
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

test('partner wording gate flags rendered sponsor text', () => {
  const negatives = [
    '<p>Your sponsor {name}</p>',
    '<p>{name} is your sponsor</p>',
    '<p>count = sponsor</p>',
    '<p>please return your sponsor card</p>',
    "<p>{'sponsor'}</p>",
    '<Label title="sponsor" />',
    "const row = { label: 'sponsor', children: 'sponsor' }",
  ]
  for (const sample of negatives) {
    assert.ok(partnerWordingHits(sample, 'src/fixture.tsx').length > 0, sample)
  }
})

test('partner wording gate allows seat values, routes, identifiers, comments, tests, and legal files', () => {
  const positives = [
    "if (seat === 'sponsor') return null",
    "const row = { role: 'sponsor', tier: 'sponsor' }",
    "const STATIC = { '/dashboard/sponsorship': '/dashboard/partnership' }",
    "const fn = 'invite-sponsor'",
    'const sponsorId = 1\nconst isSponsor = true\nconst label = SPONSOR_LABEL',
    "import { SPONSOR_LABEL } from './sponsorLabel'\n// a sponsor note\n/* sponsor */",
  ]
  for (const sample of positives) {
    assert.deepEqual(partnerWordingHits(sample, 'src/fixture.tsx'), [], sample)
  }
  assert.deepEqual(partnerWordingHits("export const line = 'A sponsor sees a card.'", 'src/content/legal/terms.en.ts'), [])
  assert.deepEqual(partnerWordingHits("assert.equal(seat, 'sponsor')", 'scripts/example.test.ts'), [])
})

test('built sentence check catches sponsor wording and allows code tokens', () => {
  for (const sample of [
    'const msg = "Your sponsor brief."',
    'const msg = "a sponsor-backed deal"',
    'const msg = "for sponsors: three"',
  ]) {
    assert.ok(builtSentenceSponsorHits(sample).length > 0, sample)
  }
  assert.ok(builtSentenceSponsorHits('<p>Your sponsor brief.</p>', true).length > 0)
  for (const sample of [
    'if (seat === "sponsor") return null',
    'const row = { role: "sponsor" }',
    'const path = "/dashboard/sponsorship"',
    'const fn = "invite-sponsor"',
    'const sponsorId = 1; const isSponsor = SPONSOR_LABEL',
  ]) {
    assert.deepEqual(builtSentenceSponsorHits(sample), [], sample)
  }
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

function builtSponsorSentence(blob: string, index: number, token: string) {
  const before = index === 0 ? '' : blob[index - 1] || ''
  const after = blob[index + token.length] || ''
  if (/[A-Za-z0-9_./]/.test(before)) return false
  if (before === '-') return false
  if (after === '_' || /[A-Za-z0-9]/.test(after)) return false
  const quotedValue = (before === '"' || before === "'" || before === '`') && before === after
  if (quotedValue && (token.toLowerCase() === 'sponsor' || token.toLowerCase() === 'sponsorship')) return false
  if (after === ':' && blob[index + token.length + 1] !== ' ') return false
  if (after === '-' && (before === ' ' || before === '\n' || before === '\t')) return true
  const spaceBefore = before === ' ' || before === '\n' || before === '\t'
  const spaceAfter = after === ' ' || after === '\n' || after === '\t'
  const sentenceAfter = after === ':' || after === '.' || after === ',' || after === '!' || after === '?'
  return spaceBefore && (spaceAfter || sentenceAfter || after === '-')
}

/** Sentence text in built JS or HTML. Identifiers, enum values, paths, and function names stay. */
export function builtSentenceSponsorHits(blob: string, _html = false) {
  const hits: string[] = []
  const re = /\bsponsor(?:s|ship|ships|ed)?\b|\bsponsor-/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(blob))) {
    const token = match[0]
    if (!builtSponsorSentence(blob, match.index, token)) continue
    const start = Math.max(0, match.index - 24)
    const end = Math.min(blob.length, match.index + token.length + 24)
    hits.push(blob.slice(start, end).replace(/\s+/g, ' ').trim())
  }
  if (blob.includes(ECOSYSTEM)) hits.push(ECOSYSTEM)
  return hits
}

function legalBuiltFile(rel: string) {
  return (
    /^assets\/legal-pages-[A-Za-z0-9_-]+\.js$/.test(rel) ||
    rel === 'privacy/index.html' ||
    rel === 'terms/index.html'
  )
}

test('built assets keep sponsor wording inside the legal-pages chunk', () => {
  const dist = path.join(root, 'dist')
  const assets = path.join(dist, 'assets')
  assert.equal(existsSync(assets), true, 'dist/assets is missing; build before this test')
  const files = [] as string[]
  walkDist(dist, files)
  const outside: string[] = []
  let legalHit = false
  for (const file of files) {
    const rel = path.relative(dist, file).split(path.sep).join('/')
    if (!rel.endsWith('.js') && !rel.endsWith('.html') && !rel.endsWith('.css')) continue
    const text = readFileSync(file).toString('latin1')
    if (legalBuiltFile(rel)) {
      if (/sponsor/i.test(text)) legalHit = true
      continue
    }
    const hits = builtSentenceSponsorHits(text, rel.endsWith('.html'))
    if (hits.length) outside.push(`${rel}: ${[...new Set(hits)].join(' | ')}`)
  }
  assert.equal(legalHit, true)
  assert.deepEqual(outside, [])
})

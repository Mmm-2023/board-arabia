import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import {
  AI_UPLOADS_30_DAY_RETENTION,
  EFFECTIVE_DATE,
  LEGAL_PENDING,
  PARTNERS_EMAIL,
  PRIVACY_LINK,
  SERVICE_EMAIL,
  TERMS_LINK,
  legalField,
  readAiUploads30DayRetention,
  setLegalEnvForTests,
} from '../src/config/legal.ts'
import { englishPath } from '../src/lib/englishPath.ts'
import { PRIVACY_EN } from '../src/content/legal/privacy.en.ts'
import { legalPlainText, resolveLegalDocument } from '../src/content/legal/resolve.ts'
import { TERMS_EN } from '../src/content/legal/terms.en.ts'
import { publicEntityHits } from './no-public-entity.test.ts'
import { FOOTER_NAMMCO_CREDIT, strayPublicNammco } from './public-nammco.mjs'
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

const ALLOWED_BRACKETS = new Set([
  '[ADDRESS]',
  '[CONTACT EMAIL]',
  '[DPO CONTACT]',
  '[AI PROVIDER]',
  '[N]',
])

const DOCS = [
  ['terms', 'en', TERMS_EN],
  ['privacy', 'en', PRIVACY_EN],
] as const

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

function brackets(text: string) {
  // MixedText wraps a Latin run in bdi, so a short token such as [N] is split across tags in the HTML.
  const visible = text.replace(/<[^>]+>/g, '')
  return visible.match(/\[[^[\]]*\]/g) ?? []
}

function legalArticle(html: string) {
  return html.match(/<article\b[^>]*data-legal-doc="true"[\s\S]*?<\/article>/)?.[0] ?? ''
}

function draftingLeft(text: string) {
  return brackets(text).filter((token) => !ALLOWED_BRACKETS.has(token))
}

const DRAFTING_MARKERS = [
  'Saudi lawyer',
  'to confirm',
  'Not legal sign-off',
  'draft replacement',
  'DRAFT',
]

/** An identity check is not a drafting note. */
function draftingMarkerHits(text: string) {
  const rightsConfirm = 'to confirm your identity'
  return DRAFTING_MARKERS.filter((phrase) => {
    const visible = phrase === 'to confirm' ? text.split(rightsConfirm).join('') : text
    return visible.includes(phrase)
  })
}

function pageHtml(View: () => ReturnType<typeof createElement>, route: string) {
  return renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: [route] }, createElement(View)),
  )
}

describe('legal pages', { concurrency: false }, () => {
test('legal config defaults, links, and the 30 day flag', () => {
  assert.equal(AI_UPLOADS_30_DAY_RETENTION, true)
  assert.equal(readAiUploads30DayRetention(undefined), true)
  assert.equal(readAiUploads30DayRetention(null), true)
  assert.equal(readAiUploads30DayRetention(''), true)
  assert.equal(readAiUploads30DayRetention('false'), false)
  assert.equal(readAiUploads30DayRetention(false), false)
  assert.equal(readAiUploads30DayRetention('TRUE'), true)
  assert.equal(readAiUploads30DayRetention('true'), true)
  assert.equal(readAiUploads30DayRetention(true), true)
  assert.equal(PRIVACY_LINK, '/privacy')
  assert.equal(TERMS_LINK, '/terms')
  assert.equal(EFFECTIVE_DATE.en, '7 October 2026')
  assert.equal('ar' in EFFECTIVE_DATE, false)
  assert.equal('ar' in LEGAL_PENDING, false)
  setLegalEnvForTests(null)
  assert.equal(legalField('baEntity', 'en'), LEGAL_PENDING.en)
  assert.equal(legalField('dpoContact', 'en'), LEGAL_PENDING.en)
  assert.equal(PARTNERS_EMAIL('en'), 'To be confirmed')
  assert.equal(SERVICE_EMAIL('en'), 'To be confirmed')
  setLegalEnvForTests({ partnersEmail: 'partners@example.com', serviceEmail: 'service@example.com' })
  try {
    assert.equal(PARTNERS_EMAIL('en'), 'partners@example.com')
    assert.equal(SERVICE_EMAIL('en'), 'service@example.com')
  } finally {
    setLegalEnvForTests(null)
  }
  const hits = walk(path.join(root, 'src'))
    .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
    .filter((file) => readFileSync(file, 'utf8').includes('VITE_LEGAL_'))
    .map((file) => path.relative(root, file))
  assert.deepEqual(hits.sort(), ['src/config/legal.ts'])
  const identity = read('src/config/legalPageIdentity.ts')
  assert.equal(identity.includes('VITE_LEGAL_BA_ENTITY'), false)
  assert.equal(identity.includes('VITE_LEGAL_CR'), false)
  assert.equal(identity.includes('import.meta.env'), false)
  assert.equal(identity.includes('VITE_LEGAL_ADDRESS'), false)
  assert.equal(identity.includes('VITE_LEGAL_CONTACT_EMAIL'), false)
  assert.equal(identity.includes('VITE_LEGAL_DPO_CONTACT'), false)
  assert.equal(identity.includes('VITE_LEGAL_AI_PROVIDER'), false)
  assert.deepEqual(publicEntityHits(identity), [])
  const example = read('.env.example')
  for (const name of [
    'VITE_LEGAL_BA_ENTITY',
    'VITE_LEGAL_CR',
    'VITE_LEGAL_ADDRESS',
    'VITE_LEGAL_CONTACT_EMAIL',
    'VITE_LEGAL_DPO_CONTACT',
    'VITE_LEGAL_AI_PROVIDER',
    'VITE_LEGAL_PARTNERS_EMAIL',
    'VITE_LEGAL_SERVICE_EMAIL',
    'VITE_LEGAL_AI_UPLOADS_30_DAY_RETENTION=true',
  ]) {
    assert.equal(example.includes(name), true, name)
  }
})

test('rendered legal copy has no drafting brackets and both retention states', () => {
  for (const retention30 of [false, true]) {
    for (const [name, lang, doc] of DOCS) {
      const resolved = resolveLegalDocument(doc, lang, retention30)
      const text = legalPlainText(resolved)
      assert.deepEqual(draftingLeft(text), [], `${name} ${lang} ${retention30} text`)
      assert.deepEqual(draftingMarkerHits(text), [], `${name} ${lang} ${retention30}`)
      assert.equal(text.includes('Drafting note'), false, `${name} ${lang}`)
      assert.equal(text.includes('[EFFECTIVE DATE]'), false)
      assert.equal(text.includes(EFFECTIVE_DATE[lang]), true, `${name} ${lang}`)
      assert.equal(text.includes(LEGAL_PENDING[lang]), true, `${name} ${lang}`)
      assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text), false, text)
      if (name === 'terms') {
        assert.equal(/\b7\.7\b/.test(text), false)
        assert.match(text, /\b7\.6\b/)
        assert.match(text, /\b8\.1\b/)
      }
    }
  }

  const termsEnOff = legalPlainText(resolveLegalDocument(TERMS_EN, 'en', false))
  const termsEnOn = legalPlainText(resolveLegalDocument(TERMS_EN, 'en', true))
  assert.match(termsEnOff, /Uploads are kept while your account is active\. You can delete them at any time\./)
  assert.equal(termsEnOff.includes('kept for 30 days'), false)
  assert.match(termsEnOn, /Uploads are kept for 30 days and then deleted automatically\. You can delete them earlier at any time\./)
  assert.match(termsEnOff, /A credit is used as stated in the package\./)
  assert.equal(termsEnOff.includes('intro request is sent'), false)

  const privacyEnOff = legalPlainText(resolveLegalDocument(PRIVACY_EN, 'en', false))
  const privacyEnOn = legalPlainText(resolveLegalDocument(PRIVACY_EN, 'en', true))
  assert.match(privacyEnOff, /We store the name, firm, category and note you send so our admin team can review it/)
  assert.match(privacyEnOff, /We never ask for an email or phone/)
  assert.match(privacyEnOff, /Only admin can read it/)
  assert.equal(privacyEnOff.includes('opens a draft in your own mail app'), false)
  assert.equal(privacyEnOff.includes('is not stored on the website'), false)
  assert.match(privacyEnOff, /We have not appointed a data protection officer\. Questions about your data go to To be confirmed\./)
  assert.match(privacyEnOff, /Kept while your account is active; you can delete them at any time/)
  assert.match(privacyEnOff, /Retained while your account is active; you can delete at any time/)
  assert.equal(privacyEnOff.includes('Final period to confirm'), false)
  assert.equal(privacyEnOff.includes('Deleted after 30 days'), false)
  assert.match(privacyEnOn, /Deleted after 30 days\. You can delete them earlier at any time/)
  assert.match(privacyEnOn, /Retained while your account is active; you can delete at any time/)
  const backupLine =
    'When we delete your records, they are removed from our live systems straight away. Copies may remain in our secure backups for up to [N] days until those backups expire, and we do not use them for any other purpose.'
  assert.equal(privacyEnOff.split(backupLine).length - 1, 2)
  assert.equal(privacyEnOn.split(backupLine).length - 1, 2)

  setLegalEnvForTests({
    partnersEmail: 'partners@example.com',
    serviceEmail: 'service@example.com',
    baEntity: 'Example Entity',
  })
  try {
    const filled = legalPlainText(resolveLegalDocument(PRIVACY_EN, 'en', false))
    assert.equal(filled.includes('partners@example.com'), false)
    assert.match(filled, /service@example\.com/)
    assert.equal(filled.includes('Example Entity'), false)
    assert.match(filled, /Board Arabia is the operator of the Platform/)
    assert.match(filled, /Board Arabia is the controller of the personal data/)
    assert.equal(filled.includes('[PARTNERS EMAIL]'), false)
    assert.equal(filled.includes('[SERVICE EMAIL]'), false)
  } finally {
    setLegalEnvForTests(null)
  }
})

test('terms and privacy pages stay English, including stale Arabic links', async () => {
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const legal = await vite.ssrLoadModule('/src/config/legal.ts')
    const termsMod = await vite.ssrLoadModule('/src/pages/TermsPage.tsx')
    const privacyMod = await vite.ssrLoadModule('/src/pages/PrivacyPage.tsx')
    legal.setAiUploads30DayRetentionForTests(null)
    const privacyDefault = pageHtml(privacyMod.PrivacyPage, '/privacy')
    const termsDefault = pageHtml(termsMod.TermsPage, '/terms')
    assert.match(privacyDefault, /data-ai-retention="30-day"/)
    assert.match(privacyDefault, /Deleted after 30 days/)
    assert.match(termsDefault, /data-ai-retention="30-day"/)
    assert.match(termsDefault, /kept for 30 days/)
    legal.setAiUploads30DayRetentionForTests(false)
    const terms = pageHtml(termsMod.TermsPage, '/terms')
    const termsAr = pageHtml(termsMod.TermsPage, '/terms?lang=ar')
    const privacy = pageHtml(privacyMod.PrivacyPage, '/privacy')
    const privacyAr = pageHtml(privacyMod.PrivacyPage, '/privacy?lang=ar')
    for (const html of [terms, termsAr, privacy, privacyAr]) {
      assert.match(html, /data-legal-doc="true"/)
      assert.match(html, /lang="en"/)
      assert.match(html, /dir="ltr"/)
      assert.equal(html.includes('ba-notice-switch'), false)
      assert.equal(html.includes('dir="rtl"'), false)
      assert.equal(html.includes('lang="ar"'), false)
      assert.equal(/[\u0600-\u06FF]/.test(html), false)
      assert.equal(legalArticle(html).includes('Drafting note'), false)
      assert.deepEqual(draftingLeft(legalArticle(html)), [])
      assert.deepEqual(draftingMarkerHits(legalArticle(html)), [], html.slice(0, 80))
    }
    assert.match(terms, /id="terms"/)
    assert.match(terms, /id="terms-title"/)
    assert.match(terms, /id="c-1-1"/)
    assert.match(termsAr, /id="terms"/)
    assert.match(termsAr, /Board Arabia Terms of Membership/)
    assert.match(privacy, /id="privacy"/)
    assert.match(privacy, /id="retention"/)
    assert.match(privacy, /id="privacy-title"/)
    assert.match(privacy, /data-ai-retention="account"/)
    assert.match(privacyAr, /id="retention"/)
    assert.match(privacyAr, /Board Arabia Privacy Notice/)
    assert.match(terms, /data-ai-retention="account"/)
    assert.equal(terms.includes('href="/register"'), false)
    assert.equal(privacy.includes('href="/register"'), false)
    assert.deepEqual(englishPath('/terms', '?lang=ar'), { pathname: '/terms', search: '' })
    assert.deepEqual(englishPath('/ar/privacy', '?lang=ar'), { pathname: '/privacy', search: '' })
    assert.deepEqual(englishPath('/ar', ''), { pathname: '/', search: '' })
    assert.equal(englishPath('/privacy', ''), null)
    legal.setAiUploads30DayRetentionForTests(true)
    const termsOn = pageHtml(termsMod.TermsPage, '/terms')
    const privacyOn = pageHtml(privacyMod.PrivacyPage, '/privacy')
    assert.match(termsOn, /data-ai-retention="30-day"/)
    assert.match(termsOn, /kept for 30 days/)
    assert.match(privacyOn, /Deleted after 30 days/)
    assert.deepEqual(draftingLeft(legalArticle(termsOn)), [])
    assert.deepEqual(draftingLeft(legalArticle(privacyOn)), [])
    assert.deepEqual(draftingMarkerHits(legalArticle(termsOn)), [])
    assert.deepEqual(draftingMarkerHits(legalArticle(privacyOn)), [])
    assert.equal(legalArticle(termsOn).includes('Drafting note'), false)
    assert.equal(legalArticle(privacyOn).includes('Drafting note'), false)
  } finally {
    const legal = await vite.ssrLoadModule('/src/config/legal.ts')
    legal.setAiUploads30DayRetentionForTests(null)
    legal.setLegalEnvForTests(null)
    await vite.close()
  }
})

test('language clauses are English only', () => {
  const privacy = legalPlainText(resolveLegalDocument(PRIVACY_EN, 'en', false))
  const terms = legalPlainText(resolveLegalDocument(TERMS_EN, 'en', false))
  assert.match(privacy, /16\. Language/)
  assert.match(privacy, /This notice is published in English\. The English version is authoritative\./)
  assert.match(terms, /22\. Language/)
  assert.match(terms, /22\.1 These Terms are published in English\. The English version is authoritative\./)
  assert.equal(terms.includes('22.2'), false)
  for (const text of [privacy, terms]) {
    assert.equal(text.includes('published in Arabic'), false, text)
    assert.equal(text.includes('Arabic and English'), false, text)
    assert.equal(text.includes('Arabic version prevails'), false, text)
  }
})

test('website source has no Arabic script and no rtl locale', () => {
  const files = walk(path.join(root, 'src')).filter((file) => /\.(ts|tsx|css)$/.test(file))
  const hits: string[] = []
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    if (/[\u0600-\u06FF]/.test(source) || source.includes('dir="rtl"') || source.includes("dir='rtl'") || source.includes('lang="ar"')) {
      hits.push(path.relative(root, file))
    }
  }
  assert.deepEqual(hits, [])
  assert.equal(existsSync(path.join(root, 'src/components/SiteLanguage.tsx')), false)
  assert.equal(existsSync(path.join(root, 'src/content/legal/privacy.ar.ts')), false)
  assert.equal(existsSync(path.join(root, 'src/content/legal/terms.ar.ts')), false)
})

test('legal sources have no mailbox literal and no em or en dash', () => {
  const files = [
    'src/config/legal.ts',
    'src/config/legalPageIdentity.ts',
    'src/content/legal/types.ts',
    'src/content/legal/resolve.ts',
    'src/content/legal/terms.en.ts',
    'src/content/legal/privacy.en.ts',
    'src/components/LegalDocumentView.tsx',
    'src/pages/TermsPage.tsx',
    'src/pages/PrivacyPage.tsx',
    '.env.example',
  ]
  const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
  for (const file of files) {
    const source = read(file)
    const found = source.match(email) ?? []
    assert.deepEqual(
      found.filter((item) => !item.endsWith('@example.com')),
      [],
      file,
    )
    assert.equal(source.includes('\u2014'), false, file)
    assert.equal(source.includes('\u2013'), false, file)
    assert.equal(source.includes('Drafting note'), false, file)
  }
})

test('an unset address reads as registered address, and a set address stays of', () => {
  setLegalEnvForTests(null)
  const pendingPrivacy = legalPlainText(resolveLegalDocument(PRIVACY_EN, 'en', false))
  const pendingTerms = legalPlainText(resolveLegalDocument(TERMS_EN, 'en', false))
  assert.match(pendingPrivacy, /registered address: To be confirmed \("we", "us"\)/)
  assert.match(pendingTerms, /registered address: To be confirmed \("Board Arabia", "we", "us"\)/)
  assert.equal(pendingPrivacy.includes('of To be confirmed'), false)
  assert.equal(pendingTerms.includes('of To be confirmed'), false)
  setLegalEnvForTests({ address: '12 Example Road' })
  try {
    const filledPrivacy = legalPlainText(resolveLegalDocument(PRIVACY_EN, 'en', false))
    const filledTerms = legalPlainText(resolveLegalDocument(TERMS_EN, 'en', false))
    assert.match(filledPrivacy, /of 12 Example Road \("we", "us"\)/)
    assert.match(filledTerms, /of 12 Example Road \("Board Arabia", "we", "us"\)/)
    assert.equal(filledPrivacy.includes('registered address:'), false)
    assert.equal(filledTerms.includes('registered address:'), false)
  } finally {
    setLegalEnvForTests(null)
  }
})

const FILLED_LEGAL = {
  address: '1 Example Road, Example City',
  contactEmail: 'privacy@example.com',
  dpoContact: 'No DPO appointed, privacy questions to privacy@example.com',
  aiProvider: 'a third-party AI model provider',
  partnersEmail: 'partners@example.com',
  serviceEmail: 'service@example.com',
}

test('privacy and terms show no To be confirmed and no bracket token once every field is set', () => {
  for (const retention30 of [false, true]) {
    setLegalEnvForTests(FILLED_LEGAL)
    try {
      const privacy = legalPlainText(resolveLegalDocument(PRIVACY_EN, 'en', retention30))
      const terms = legalPlainText(resolveLegalDocument(TERMS_EN, 'en', retention30))
      for (const text of [privacy, terms]) {
        assert.equal(/to be confirmed/i.test(text), false)
        assert.equal(/\[[A-Z][A-Z ]+\]/.test(text), false)
      }
      assert.match(privacy, /of 1 Example Road, Example City \("we", "us"\)/)
      assert.match(privacy, /Data protection officer: No DPO appointed, privacy questions to privacy@example\.com\./)
      assert.match(privacy, /a third-party AI model provider, for AI tools/)
      assert.match(privacy, /sent from service@example\.com/)
      assert.match(privacy, /processed by a third-party AI model provider at its hosting location/)
      assert.equal(privacy.includes('write to privacy@example.com or'), false)
    } finally {
      setLegalEnvForTests(null)
    }
  }
})

test('privacy 11.2 renders the approved sentence with the contact mailbox and no To be confirmed', () => {
  setLegalEnvForTests({ contactEmail: 'privacy@example.com' })
  try {
    const privacy = legalPlainText(resolveLegalDocument(PRIVACY_EN, 'en', true))
    const sentence = 'We have not appointed a data protection officer. Questions about your data go to privacy@example.com.'
    const clause = privacy.split('\n').find((line) => line.startsWith('11.2 '))
    assert.equal(clause, `11.2 ${sentence}`)
    assert.equal(clause.includes('To be confirmed'), false)
    assert.equal(clause.includes('[DPO CONTACT]'), false)
    assert.equal(clause.includes('[CONTACT EMAIL]'), false)
  } finally {
    setLegalEnvForTests(null)
  }
})

test('an unset field keeps To be confirmed only where that field is used', () => {
  const { aiProvider: _unset, ...rest } = FILLED_LEGAL
  setLegalEnvForTests(rest)
  try {
    const privacy = legalPlainText(resolveLegalDocument(PRIVACY_EN, 'en', true))
    assert.equal((privacy.match(/To be confirmed/g) ?? []).length, 2)
    assert.match(privacy, /To be confirmed, for AI tools/)
  } finally {
    setLegalEnvForTests(null)
  }
})

test('both workflows pass every filled legal field from repo variables and none as a literal', () => {
  for (const file of ['.github/workflows/pages.yml', '.github/workflows/pr-checks.yml']) {
    const yml = read(file)
    for (const name of [
      'VITE_LEGAL_CONTACT_EMAIL',
      'VITE_LEGAL_ADDRESS',
      'VITE_LEGAL_DPO_CONTACT',
      'VITE_LEGAL_AI_PROVIDER',
      'VITE_LEGAL_PARTNERS_EMAIL',
      'VITE_LEGAL_SERVICE_EMAIL',
    ]) {
      assert.match(yml, new RegExp(`${name}: \\$\\{\\{ vars\\.${name} \\}\\}`), `${file} ${name}`)
    }
    assert.equal(/VITE_LEGAL_\w+:\s*['"]?[^$\s'"]/.test(yml), false, `${file} has a literal legal value`)
  }
})

test('privacy and terms render the entity line and marketing routes keep only the footer credit', async () => {
  delete process.env.VITE_LEGAL_ADDRESS
  delete process.env.VITE_LEGAL_CONTACT_EMAIL
  delete process.env.VITE_LEGAL_DPO_CONTACT
  delete process.env.VITE_LEGAL_AI_PROVIDER
  process.env.VITE_SUPABASE_URL ||= 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY ||= 'example-anon-key'
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const pages = [
      ['/src/pages/PrivacyPage.tsx', 'PrivacyPage', '/privacy', 'privacy/index.html'],
      ['/src/pages/TermsPage.tsx', 'TermsPage', '/terms', 'terms/index.html'],
      ['/src/pages/LandingPage.tsx', 'LandingPage', '/', 'index.html'],
      ['/src/pages/ApplyPage.tsx', 'ApplyPage', '/apply', 'apply/index.html'],
      ['/src/pages/ForMembersPage.tsx', 'ForMembersPage', '/for-members', 'for-members/index.html'],
      ['/src/pages/ForCapitalPage.tsx', 'ForCapitalPage', '/for-capital', 'for-capital/index.html'],
      ['/src/pages/PartnersPage.tsx', 'PartnersPage', '/partners', 'partners/index.html'],
      ['/src/pages/HowItWorksPage.tsx', 'HowItWorksPage', '/how-it-works', 'how-it-works/index.html'],
      ['/src/pages/AboutPage.tsx', 'AboutPage', '/about', 'about/index.html'],
      ['/src/pages/SecurityPage.tsx', 'SecurityPage', '/security', 'security/index.html'],
    ] as const
    for (const [file, name, route, artifact] of pages) {
      const mod = await vite.ssrLoadModule(file)
      const html = pageHtml(mod[name], route)
      assert.match(html, new RegExp(`>${FOOTER_NAMMCO_CREDIT}<`))
      assert.equal(strayPublicNammco(html, artifact), false, route)
      assert.deepEqual(publicEntityHits(html), [], route)
      assert.equal(/\bCR\s*\d{10}\b/.test(html), false, route)
      assert.equal(/\bsponsor(?:s|ship|ships|ed)?\b/i.test(html), false, route)
      if (route === '/privacy' || route === '/terms') {
        assert.match(html, /Board Arabia is the operator of the Platform/)
        assert.match(html, /To be confirmed/)
        assert.equal(html.includes('Ask the desk'), false)
        assert.equal(/the desk/i.test(html), false)
      }
    }
    const privacy = pageHtml((await vite.ssrLoadModule('/src/pages/PrivacyPage.tsx')).PrivacyPage, '/privacy')
    const terms = pageHtml((await vite.ssrLoadModule('/src/pages/TermsPage.tsx')).TermsPage, '/terms')
    assert.match(privacy, /Privacy contact:[\s\S]{0,80}To be confirmed/)
    assert.match(privacy, /Data protection officer:[\s\S]{0,80}To be confirmed/)
    assert.match(privacy, /To be confirmed[\s\S]{0,80}for AI tools/)
    assert.match(terms, /contact us at[\s\S]{0,80}To be confirmed/)
    assert.match(terms, /AI provider[\s\S]{0,80}To be confirmed/)
    assert.match(privacy, /registered address:[\s\S]{0,40}To be confirmed/)
    assert.match(terms, /registered address:[\s\S]{0,40}To be confirmed/)
    assert.equal(privacy.includes('of To be confirmed'), false)
    assert.equal(terms.includes('of To be confirmed'), false)
    assert.match(privacy, /Introductions and admin/)
    assert.match(privacy, /Ask admin/)
    assert.match(terms, /Ask admin/)
  } finally {
    await vite.close()
  }
})

test('rendered /privacy and /terms show no To be confirmed when the legal env is set', async () => {
  process.env.VITE_LEGAL_ADDRESS = FILLED_LEGAL.address
  process.env.VITE_LEGAL_CONTACT_EMAIL = FILLED_LEGAL.contactEmail
  process.env.VITE_LEGAL_DPO_CONTACT = FILLED_LEGAL.dpoContact
  process.env.VITE_LEGAL_AI_PROVIDER = FILLED_LEGAL.aiProvider
  process.env.VITE_LEGAL_PARTNERS_EMAIL = FILLED_LEGAL.partnersEmail
  process.env.VITE_LEGAL_SERVICE_EMAIL = FILLED_LEGAL.serviceEmail
  process.env.VITE_SUPABASE_URL ||= 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY ||= 'example-anon-key'
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const privacy = pageHtml((await vite.ssrLoadModule('/src/pages/PrivacyPage.tsx')).PrivacyPage, '/privacy')
    const terms = pageHtml((await vite.ssrLoadModule('/src/pages/TermsPage.tsx')).TermsPage, '/terms')
    for (const [html, artifact] of [
      [privacy, 'privacy/index.html'],
      [terms, 'terms/index.html'],
    ] as const) {
      assert.equal(html.includes('To be confirmed'), false, artifact)
      assert.match(html, new RegExp(`>${FOOTER_NAMMCO_CREDIT}<`))
      assert.equal(strayPublicNammco(html, artifact), false, artifact)
      assert.equal(/sponsor/i.test(html), false, artifact)
    }
    const privacyText = privacy.replace(/<[^>]+>/g, '')
    assert.match(privacyText, /We have not appointed a data protection officer\. Questions about your data go to privacy@example\.com\./)
    assert.match(privacyText, /Data protection officer: No DPO appointed, privacy questions to privacy@example\.com\./)
    assert.equal(privacyText.includes('To be confirmed'), false)
  } finally {
    delete process.env.VITE_LEGAL_ADDRESS
    delete process.env.VITE_LEGAL_CONTACT_EMAIL
    delete process.env.VITE_LEGAL_DPO_CONTACT
    delete process.env.VITE_LEGAL_AI_PROVIDER
    delete process.env.VITE_LEGAL_PARTNERS_EMAIL
    delete process.env.VITE_LEGAL_SERVICE_EMAIL
    await vite.close()
  }
})

test('AI provider lines and resolve.ts stay byte-identical to main', () => {
  const terms = read('src/content/legal/terms.en.ts')
  const privacy = read('src/content/legal/privacy.en.ts')
  const resolve = read('src/content/legal/resolve.ts')
  for (const line of [
    'Uploaded files are processed by our AI provider, [AI PROVIDER], as described in the Privacy Notice. Uploads are kept for 30 days and then deleted automatically. You can delete them earlier at any time.',
    'For AI uploads, this includes sending them to our AI provider to produce your output.',
    'We do not use your uploads to train AI models, and we require our AI provider not to do so.',
  ]) {
    assert.equal(terms.includes(line), true, line)
  }
  for (const line of [
    '(c) [AI PROVIDER], for AI tools; and',
    'AI uploads are processed by [AI PROVIDER] at its hosting location.',
  ]) {
    assert.equal(privacy.includes(line), true, line)
  }
  assert.equal(resolve.includes("'[AI PROVIDER]': 'aiProvider',"), true)
  const bytes = readFileSync(path.join(root, 'src/content/legal/resolve.ts'))
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    'f5740b538295e39e5be8344201e2dd6bc90b7c3c3ad7eabf26e6a7e4ed61fe9c',
  )
})
})

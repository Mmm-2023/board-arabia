import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
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
import { PRIVACY_AR } from '../src/content/legal/privacy.ar.ts'
import { PRIVACY_EN } from '../src/content/legal/privacy.en.ts'
import { legalPlainText, resolveLegalDocument } from '../src/content/legal/resolve.ts'
import { TERMS_AR } from '../src/content/legal/terms.ar.ts'
import { TERMS_EN } from '../src/content/legal/terms.en.ts'
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

const ALLOWED_BRACKETS = new Set([
  '[BA ENTITY]',
  '[CR]',
  '[ADDRESS]',
  '[CONTACT EMAIL]',
  '[DPO CONTACT]',
  '[AI PROVIDER]',
])

const DOCS = [
  ['terms', 'en', TERMS_EN],
  ['terms', 'ar', TERMS_AR],
  ['privacy', 'en', PRIVACY_EN],
  ['privacy', 'ar', PRIVACY_AR],
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
  return text.match(/\[[^[\]]*\]/g) ?? []
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
  'محامٍ سعودي',
  'محام سعودي',
  'نص بديل مقترح',
  'DRAFT',
  'مسودة)',
  '(مسودة',
]

/** Privacy 11.2 asks the person to confirm their identity. That is not a drafting note. */
function draftingMarkerHits(text: string) {
  const rightsConfirm = 'to confirm your identity'
  return DRAFTING_MARKERS.filter((phrase) => {
    const visible = phrase === 'to confirm' ? text.split(rightsConfirm).join('') : text
    return visible.includes(phrase)
  })
}

function pageHtml(
  Provider: (props: { children?: ReturnType<typeof createElement> }) => ReturnType<typeof createElement>,
  View: () => ReturnType<typeof createElement>,
  route: string,
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [route] },
      createElement(Provider, null, createElement(View)),
    ),
  )
}

describe('legal pages', { concurrency: false }, () => {
test('legal config defaults, links, and the 30 day flag', () => {
  assert.equal(AI_UPLOADS_30_DAY_RETENTION, false)
  assert.equal(readAiUploads30DayRetention(undefined), false)
  assert.equal(readAiUploads30DayRetention('false'), false)
  assert.equal(readAiUploads30DayRetention('TRUE'), false)
  assert.equal(readAiUploads30DayRetention('true'), true)
  assert.equal(readAiUploads30DayRetention(true), true)
  assert.equal(PRIVACY_LINK, '/privacy')
  assert.equal(TERMS_LINK, '/terms')
  assert.equal(EFFECTIVE_DATE.en, '30 September 2026')
  assert.equal(EFFECTIVE_DATE.ar, '٣٠ سبتمبر ٢٠٢٦')
  setLegalEnvForTests(null)
  assert.equal(legalField('baEntity', 'en'), LEGAL_PENDING.en)
  assert.equal(legalField('dpoContact', 'ar'), LEGAL_PENDING.ar)
  assert.equal(PARTNERS_EMAIL('en'), 'To be confirmed')
  assert.equal(SERVICE_EMAIL('ar'), 'قيد التأكيد')
  setLegalEnvForTests({ partnersEmail: 'partners@example.com', serviceEmail: 'service@example.com' })
  try {
    assert.equal(PARTNERS_EMAIL('en'), 'partners@example.com')
    assert.equal(SERVICE_EMAIL('ar'), 'service@example.com')
  } finally {
    setLegalEnvForTests(null)
  }
  const hits = walk(path.join(root, 'src'))
    .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
    .filter((file) => readFileSync(file, 'utf8').includes('VITE_LEGAL_'))
    .map((file) => path.relative(root, file))
  assert.deepEqual(hits, ['src/config/legal.ts'])
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
    'VITE_LEGAL_AI_UPLOADS_30_DAY_RETENTION=false',
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
      assert.equal(text.includes('ملاحظة صياغة'), false)
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
  const termsArOff = legalPlainText(resolveLegalDocument(TERMS_AR, 'ar', false))
  const termsArOn = legalPlainText(resolveLegalDocument(TERMS_AR, 'ar', true))
  assert.match(termsEnOff, /Uploads are kept while your account is active\. You can delete them at any time\./)
  assert.equal(termsEnOff.includes('kept for 30 days'), false)
  assert.match(termsEnOn, /Uploads are kept for 30 days and then deleted automatically\. You can delete them earlier at any time\./)
  assert.match(termsArOff, /تُحفظ الملفات المرفوعة طوال نشاط حسابك\. ويمكنك حذفها في أي وقت\./)
  assert.equal(termsArOff.includes('30 يوماً ثم تُحذف'), false)
  assert.match(termsArOn, /وتُحفظ الملفات المرفوعة لمدة 30 يوماً ثم تُحذف تلقائياً\. ويمكنك حذفها قبل ذلك في أي وقت\./)
  assert.match(termsEnOff, /A credit is used as stated in the package\./)
  assert.equal(termsEnOff.includes('intro request is sent'), false)
  assert.match(termsArOff, /ويُستخدم الرصيد كما هو مبيّن في الباقة\./)
  assert.equal(termsArOff.includes('إرسال طلب التعارف'), false)

  const privacyEnOff = legalPlainText(resolveLegalDocument(PRIVACY_EN, 'en', false))
  const privacyEnOn = legalPlainText(resolveLegalDocument(PRIVACY_EN, 'en', true))
  const privacyArOff = legalPlainText(resolveLegalDocument(PRIVACY_AR, 'ar', false))
  const privacyArOn = legalPlainText(resolveLegalDocument(PRIVACY_AR, 'ar', true))
  assert.match(privacyEnOff, /opens a draft in your own mail app/)
  assert.match(privacyArOff, /يفتح نموذج الشريك مسودة في تطبيق البريد/)
  assert.match(privacyEnOff, /We may ask you to confirm your identity/)
  assert.match(privacyEnOff, /Kept while your account is active; you can delete them at any time/)
  assert.match(privacyEnOff, /Retained while your account is active; you can delete at any time/)
  assert.equal(privacyEnOff.includes('Final period to confirm'), false)
  assert.equal(privacyEnOff.includes('Deleted after 30 days'), false)
  assert.match(privacyEnOn, /Deleted after 30 days\. You can delete them earlier at any time/)
  assert.match(privacyEnOn, /Retained while your account is active; you can delete at any time/)
  assert.match(privacyArOff, /تُحفظ طوال نشاط حسابك، ويمكنك حذفها في أي وقت\./)
  assert.equal(privacyArOff.includes('تُحذف بعد 30 يوماً'), false)
  assert.match(privacyArOn, /تُحذف بعد 30 يوماً، ويمكنك حذفها قبل ذلك في أي وقت/)
  assert.match(privacyArOn, /تُحفظ طوال نشاط حسابك، ويمكنك حذفها في أي وقت\./)

  setLegalEnvForTests({
    partnersEmail: 'partners@example.com',
    serviceEmail: 'service@example.com',
    baEntity: 'Example Entity',
  })
  try {
    const filled = legalPlainText(resolveLegalDocument(PRIVACY_EN, 'en', false))
    assert.match(filled, /partners@example\.com/)
    assert.match(filled, /service@example\.com/)
    assert.match(filled, /Example Entity/)
    assert.equal(filled.includes('[PARTNERS EMAIL]'), false)
    assert.equal(filled.includes('[SERVICE EMAIL]'), false)
  } finally {
    setLegalEnvForTests(null)
  }
})

test('terms and privacy pages keep routes, anchors, toggle, and RTL', async () => {
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const legal = await vite.ssrLoadModule('/src/config/legal.ts')
    const language = await vite.ssrLoadModule('/src/components/SiteLanguage.tsx')
    const termsMod = await vite.ssrLoadModule('/src/pages/TermsPage.tsx')
    const privacyMod = await vite.ssrLoadModule('/src/pages/PrivacyPage.tsx')
    const Provider = language.SiteLanguageProvider
    legal.setAiUploads30DayRetentionForTests(false)
    const terms = pageHtml(Provider, termsMod.TermsPage, '/terms')
    const termsAr = pageHtml(Provider, termsMod.TermsPage, '/terms?lang=ar')
    const privacy = pageHtml(Provider, privacyMod.PrivacyPage, '/privacy')
    const privacyAr = pageHtml(Provider, privacyMod.PrivacyPage, '/privacy?lang=ar')
    for (const html of [terms, termsAr, privacy, privacyAr]) {
      assert.match(html, /data-legal-doc="true"/)
      assert.match(html, /ba-notice-switch/)
      assert.match(html, /English/)
      assert.match(html, /العربية/)
      assert.equal(legalArticle(html).includes('Drafting note'), false)
      assert.deepEqual(draftingLeft(legalArticle(html)), [])
      assert.deepEqual(draftingMarkerHits(legalArticle(html)), [], html.slice(0, 80))
    }
    assert.match(terms, /id="terms"/)
    assert.match(terms, /id="terms-title"/)
    assert.match(terms, /id="c-1-1"/)
    assert.match(terms, /dir="ltr"/)
    assert.match(termsAr, /id="terms"/)
    assert.match(termsAr, /dir="rtl"/)
    assert.match(termsAr, /lang="ar"/)
    assert.match(privacy, /id="privacy"/)
    assert.match(privacy, /id="retention"/)
    assert.match(privacy, /id="privacy-title"/)
    assert.match(privacy, /data-ai-retention="account"/)
    assert.match(privacyAr, /dir="rtl"/)
    assert.match(privacyAr, /id="retention"/)
    assert.match(terms, /data-ai-retention="account"/)
    assert.equal(terms.includes('href="/register"'), false)
    assert.equal(privacy.includes('href="/register"'), false)
    legal.setAiUploads30DayRetentionForTests(true)
    const termsOn = pageHtml(Provider, termsMod.TermsPage, '/terms')
    const privacyOn = pageHtml(Provider, privacyMod.PrivacyPage, '/privacy')
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

test('legal sources have no mailbox literal and no em or en dash', () => {
  const files = [
    'src/config/legal.ts',
    'src/content/legal/types.ts',
    'src/content/legal/resolve.ts',
    'src/content/legal/terms.en.ts',
    'src/content/legal/terms.ar.ts',
    'src/content/legal/privacy.en.ts',
    'src/content/legal/privacy.ar.ts',
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
})

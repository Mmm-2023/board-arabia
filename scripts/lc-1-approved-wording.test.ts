import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

const APPLY_HINT =
  'Optional. US dollars you can put to work. Used only inside a platform sum, and only after our admin team has looked at it. We do not verify the amount.'

const CAPACITY_WHY =
  'Used only inside a platform sum, and only after our admin team has looked at it. We do not verify the amount.'

const TOTALS_CLAUSE =
  'Our admin team looks at it before it is included. We do not check or verify the amount.'

const TERMS_94 =
  'You must check any output with your own licensed advisers before you act.'

const APPLY_NOTE =
  "If we don't accept your application, we keep it and your contact details for 12 months after our decision, in case you ask about it or apply again, and then delete them. You can ask us to delete them sooner at any time by writing to contact@boardarabia.com."

const RETENTION_WHAT =
  'Applications that are rejected, declined, withdrawn or closed: your application answers, contact details and our decision notes.'

const RETENTION_HOW =
  'Deleted 12 months after the decision. You can ask us to delete them sooner at contact@boardarabia.com. Copies held by our hosting provider follow our deletion section.'

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function visible(html: string) {
  return html.replace(/&#x27;|&#39;|&apos;/g, "'").replace(/<[^>]+>/g, '')
}

test('approved legal strings are in the source files', () => {
  const apply = read('src/pages/ApplyPage.tsx')
  const steps = read('supabase/functions/_shared/membership_steps.ts')
  const privacy = read('src/content/legal/privacy.en.ts')
  const notice = read('src/content/privacyNotice.ts')
  const terms = read('src/content/legal/terms.en.ts')
  assert.equal(apply.includes(APPLY_HINT), true)
  assert.equal(apply.includes(APPLY_NOTE), true)
  assert.equal(apply.includes('checks it looks right for a decision maker'), false)
  assert.equal(steps.includes(CAPACITY_WHY), true)
  assert.equal(steps.includes('checks it looks right for a decision maker'), false)
  assert.equal(privacy.includes(TOTALS_CLAUSE), true)
  assert.equal(notice.includes(TOTALS_CLAUSE), true)
  assert.equal(privacy.includes('checks it looks right for a decision maker'), false)
  assert.equal(notice.includes('checks it looks right for a decision maker'), false)
  assert.equal(terms.includes(TERMS_94), true)
  assert.equal(terms.includes('You must verify any output with licensed advisers before you act.'), false)
  assert.equal(privacy.includes(RETENTION_WHAT), true)
  assert.equal(privacy.includes(RETENTION_HOW), true)
  assert.equal(privacy.includes('Rejected, declined, withdrawn or closed applications, and legacy applications'), false)
})

test('privacy, terms, and apply render the approved strings', async () => {
  process.env.VITE_SUPABASE_URL ||= 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY ||= 'example-anon-key'
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const privacy = visible(renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/privacy'] },
        createElement((await vite.ssrLoadModule('/src/pages/PrivacyPage.tsx')).PrivacyPage),
      ),
    ))
    const terms = visible(renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/terms'] },
        createElement((await vite.ssrLoadModule('/src/pages/TermsPage.tsx')).TermsPage),
      ),
    ))
    const apply = visible(renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/apply'] },
        createElement((await vite.ssrLoadModule('/src/pages/ApplyPage.tsx')).ApplyPage),
      ),
    ))
    assert.equal(privacy.includes(TOTALS_CLAUSE), true)
    assert.equal(privacy.includes(RETENTION_WHAT), true)
    assert.equal(privacy.includes(RETENTION_HOW), true)
    assert.equal(terms.includes(TERMS_94), true)
    assert.equal(apply.includes(APPLY_HINT), true)
    assert.equal(apply.includes(APPLY_NOTE), true)
    assert.equal(apply.includes('NAM' + 'MCO Holdings LLC'), false)
    const submit = apply.indexOf('Submit for consideration')
    const note = apply.indexOf("If we don't accept your application")
    assert.ok(submit > -1 && note > submit)
  } finally {
    await vite.close()
  }
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { presentMandate } from '../src/lib/mandateRedaction.ts'

const SECRET = 'Nahla Industrial Holding'
const AMOUNT = 'SAR 68.5 million'
const MAIL = 'amal.desk@boardarabia.test'
const PHONE = 'Room extension 4101'
const DECK = 'https://files.boardarabia.test/nahla-brief'

test('locked mandate markup contains no sensitive fields', async () => {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const view = await vite.ssrLoadModule('/src/pages/dashboard/MandateCard.tsx')
    const poisoned = {
      id: 'a2000001-0000-4000-8000-000000000001',
      is_demo: true,
      sector: 'Energy transition',
      deal_type: 'Growth equity',
      ticket_band: '$10-25m',
      geography: 'KSA',
      stage: 'Diligence',
      one_liner: 'Growth capital for a Saudi industrial services platform.',
      unlocked: false,
      intro_status: null,
      company_name: SECRET,
      exact_amount: AMOUNT,
      terms: 'One board seat and pro-rata on the next round.',
      contact_name: 'Amal N.',
      contact_email: MAIL,
      contact_phone: PHONE,
      deck_url: DECK,
      narrative: `${SECRET} stays locked until approval.`,
    }
    const model = presentMandate(poisoned)
    assert.ok(model)
    const html = renderToStaticMarkup(
      createElement(view.MandateCard, {
        mandate: model,
        onRequest: () => {},
      }),
    )
    assert.equal(html.includes(SECRET), false)
    assert.equal(html.includes(AMOUNT), false)
    assert.equal(html.includes(MAIL), false)
    assert.equal(html.includes(PHONE), false)
    assert.equal(html.includes('nahla-brief'), false)
    assert.equal(html.includes('pro-rata'), false)
    assert.equal(html.includes('title='), false)
    assert.equal(/aria-label="[^"]*(Nahla|68\.5|amal\.desk)/.test(html), false)
    assert.match(html, /mandate-locked-copy/)
    assert.match(html, /Company name/)
    assert.match(html, /Request intro/)
    assert.match(html, /Energy transition/)
    assert.match(html, /\$10-25m/)
    assert.match(html, /aria-hidden="true"/)
    const blurAt = html.indexOf('mandate-locked-copy')
    const blurred = html.slice(blurAt, blurAt + 500)
    assert.match(blurred, /Company name/)
    assert.equal(blurred.includes(SECRET), false)
  } finally {
    await vite.close()
  }
})

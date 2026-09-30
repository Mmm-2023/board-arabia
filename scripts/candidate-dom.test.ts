import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const SECRET = 'Nahla Industrial Holding'
const MAIL = 'amal.desk@example.com'
const CITY = 'Riyadh private salon'
const WHEN = '30 Sep 2026'

test('locked account pages render no member-private fields', async () => {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const preview = await vite.ssrLoadModule('/src/pages/dashboard/account/ssrPreview.tsx')
    const pages = preview.lockedPages() as Parameters<typeof renderToStaticMarkup>[0][]
    const htmls = pages.map((page) => renderToStaticMarkup(page))
    for (const html of htmls) {
      assert.equal(html.includes(SECRET), false)
      assert.equal(html.includes('68.5'), false)
      assert.equal(html.includes('amal.desk'), false)
      assert.equal(/\bBasic\b/.test(html), false)
      assert.equal(html.includes('\u2014'), false)
      assert.equal(html.includes('\u2013'), false)
      assert.equal(/title="[^"]*(Nahla|Riyadh|amal\.desk)/.test(html), false)
      assert.equal(/aria-label="[^"]*(Nahla|Riyadh|amal\.desk)/.test(html), false)
    }
    const majlis = htmls.find((html) => html.includes('four small salons')) || ''
    assert.match(majlis, /four small salons a year/)
    assert.equal(majlis.includes(CITY), false)
    assert.equal(majlis.includes(WHEN), false)
    assert.equal(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/.test(majlis),
      false,
    )
    const ai = htmls.find((html) => html.includes('Not legal advice')) || ''
    assert.match(ai, /Example/)
    assert.equal(ai.includes('type="file"'), false)
    assert.match(ai, /Request full membership/)
    const home = htmls.find((html) => html.includes('Your account is open')) || ''
    assert.match(home, /Request full membership/)
    const sheet = htmls.find((html) => html.includes('aria-label="Deals, locked"')) || ''
    assert.match(sheet, /Membership/)
    assert.match(sheet, /aria-label="Majlis, locked"/)
    assert.equal(htmls.join('\n').includes(SECRET), false)
    assert.equal(htmls.join('\n').includes(MAIL), false)
  } finally {
    await vite.close()
  }
})

import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { isLinkedInShareUrl } from '../supabase/functions/_shared/linkedin_share_url.ts'
import {
  ATTENDED_POST_LEAD,
  ATTENDING_POST_LEAD,
  MAJLIS_SHARE_CARDS_ENABLED,
  MAJLIS_SHARE_HASHTAGS,
  MAJLIS_SHARE_HOST_LINE,
  MAJLIS_SHARE_LIMIT,
  attendedPostText,
  attendingPostText,
  majlisPublicUrl,
  majlisShareModel,
  majlisShareUrl,
  type MajlisShareEvent,
} from '../src/lib/majlisShare.ts'
import { resolveChromePath } from './chrome-path.ts'

const root = path.resolve(import.meta.dirname, '..')
const NOW = Date.parse('2026-10-30T09:00:00.000Z')
const FUTURE_END = Date.parse('2026-11-20T17:00:00.000Z')
const PAST_END = Date.parse('2026-10-01T17:00:00.000Z')
const ID = '00000000-0000-4000-8000-0000000000a1'
const MEET = 'https://meet.google.com/abc-defg-hij'
const VENUE = '12 Example Lane, Example City'
const MAIL = 'guest@example.com'
const PHONE = '+966500000001'
const HOST = 'Other Member'

function event(over: Partial<MajlisShareEvent> = {}): MajlisShareEvent {
  return {
    id: ID,
    title: `Capital evening Join the room Meet ${MAIL} ${PHONE} ${VENUE} ${HOST}`,
    starts_at: '2026-11-20T15:00:00.000Z',
    ends_at: '2026-11-20T17:00:00.000Z',
    status: 'published',
    format: 'virtual',
    cancelled_at: null,
    my_rsvp_status: 'registered',
    venue_address: VENUE,
    host_full_name: HOST,
    meet_url: MEET,
    ...over,
  }
}

function hashtagCount(value: string): number {
  return (value.match(/#[A-Za-z0-9_]+/g) || []).length
}

function attrHref(html: string): string {
  const raw = html.match(/href="([^"]+)"/)?.[1] || ''
  return raw.replaceAll('&amp;', '&').replaceAll('&#x27;', "'").replaceAll('&#39;', "'").replaceAll('&quot;', '"')
}

function assertDraft(label: string, text: string, url: string | null) {
  assert.ok(text.length <= MAJLIS_SHARE_LIMIT, `${label} length ${text.length}`)
  assert.equal(text.includes('\u2014'), false, label)
  assert.equal(text.includes('\u2013'), false, label)
  assert.equal(text.includes(MEET), false, label)
  assert.equal(text.includes(VENUE), false, label)
  assert.equal(text.includes(MAIL), false, label)
  assert.equal(text.includes(PHONE), false, label)
  assert.equal(text.includes(HOST), false, label)
  assert.equal(/\bmeet\b/i.test(text), false, label)
  assert.equal(/\bjoin\b/i.test(text), false, label)
  assert.equal(/\bsponsor/i.test(text), false, label)
  assert.equal(/\$\d|\bSAR\b|\bUSD\b/.test(text), false, label)
  assert.ok(text.includes(MAJLIS_SHARE_HOST_LINE), label)
  assert.ok(hashtagCount(text) <= 2, label)
  if (url) assert.ok(text.includes(url), label)
  else assert.equal(text.includes('boardarabia.com/majlis'), false, label)
}

test('share cards stay off until the flag is flipped', () => {
  assert.equal(MAJLIS_SHARE_CARDS_ENABLED, false)
  assert.equal(majlisShareModel(event(), NOW), null)
  assert.equal(majlisShareModel(event(), NOW, false), null)
  assert.ok(majlisShareModel(event(), NOW, true))
})

test('draft post text stays under 300 characters and drops private strings', () => {
  const row = event()
  const attending = attendingPostText(row)
  const attended = attendedPostText(row)
  const url = majlisPublicUrl(row)
  assert.ok(url)
  assertDraft('attending', attending, url)
  assertDraft('attended', attended, url)
  assert.match(attending, new RegExp(`^${ATTENDING_POST_LEAD} `))
  assert.match(attended, new RegExp(`^${ATTENDED_POST_LEAD} `))
  assert.match(attending, /20 Nov 2026/)
  assert.match(attended, /20 Nov 2026/)
  assert.equal(attended.includes(ATTENDING_POST_LEAD), false)
  assert.ok(MAJLIS_SHARE_HASHTAGS.length <= 2)
  assert.equal(hashtagCount(attending), MAJLIS_SHARE_HASHTAGS.length)
})

test('a long title is truncated with an ellipsis and the public URL remains', () => {
  const row = event({ title: `${'A'.repeat(400)} ${MAIL} ${PHONE}` })
  for (const text of [attendingPostText(row), attendedPostText(row)]) {
    assert.ok(text.length <= 300, String(text.length))
    assert.match(text, /\.\.\./)
    assert.match(text, new RegExp(ID))
    assert.equal(text.includes(MAIL), false)
    assert.equal(text.includes(PHONE), false)
    assert.equal(text.includes('A'.repeat(200)), false)
  }
})

test('composer URL round trips and matches the admit share shape', () => {
  const text = attendingPostText(event({ title: 'Riyadh & capital' }))
  const url = majlisShareUrl(text)
  assert.equal(isLinkedInShareUrl(url), true)
  assert.equal(new URL(url).hostname, 'www.linkedin.com')
  assert.equal(new URL(url).searchParams.get('text'), text)
  assert.equal(url, `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`)
})

test('public URL is only the virtual majlis page', () => {
  const row = event()
  assert.equal(majlisPublicUrl(row), `https://boardarabia.com/majlis/${ID}`)
  assert.equal(majlisPublicUrl(event({ format: 'in_person' })), null)
  assert.equal(majlisPublicUrl(event({ status: 'hidden' })), null)
  assert.equal(majlisPublicUrl(event({ cancelled_at: '2026-10-02T00:00:00.000Z' })), null)
  assert.equal(majlisPublicUrl(event({ id: 'not-an-id' })), null)
  const inPerson = attendingPostText(event({ format: 'in_person' }))
  assert.equal(inPerson.includes('boardarabia.com'), false)
  assert.equal(inPerson.includes(MEET), false)
})

test('the card is only for an active RSVP, before and after the end', () => {
  assert.equal(majlisShareModel(event(), NOW, true)?.phase, 'attending')
  assert.equal(majlisShareModel(event({ ends_at: '2026-10-01T17:00:00.000Z', starts_at: '2026-10-01T15:00:00.000Z' }), NOW, true)?.phase, 'attended')
  assert.equal(majlisShareModel(event({ ends_at: new Date(NOW).toISOString() }), NOW, true)?.phase, 'attended')
  for (const status of ['waitlist', 'cancelled', 'maybe', 'declined', null]) {
    assert.equal(majlisShareModel(event({ my_rsvp_status: status }), NOW, true), null, String(status))
  }
  assert.equal(majlisShareModel(event({ my_rsvp_status: null, ends_at: '2026-10-01T17:00:00.000Z' }), NOW, true), null)
  assert.equal(majlisShareModel(event({ status: 'cancelled' }), NOW, true), null)
  assert.equal(majlisShareModel(event({ cancelled_at: '2026-10-02T00:00:00.000Z' }), NOW, true), null)
  assert.ok(FUTURE_END > NOW)
  assert.ok(PAST_END < NOW)
})

test('share module makes no network call and names no other LinkedIn host', async () => {
  const calls: string[] = []
  const previous = globalThis.fetch
  globalThis.fetch = (async (input: unknown) => {
    calls.push(String(input))
    throw new Error('network')
  }) as typeof fetch
  try {
    attendingPostText(event())
    attendedPostText(event())
    majlisShareUrl('Hello from Board Arabia')
    majlisPublicUrl(event())
    majlisShareModel(event(), NOW, true)
  } finally {
    globalThis.fetch = previous
  }
  assert.deepEqual(calls, [])
  const files = [
    'src/lib/majlisShare.ts',
    'src/pages/dashboard/MajlisShareCard.tsx',
    'supabase/functions/_shared/linkedin_share_url.ts',
  ]
  for (const file of files) {
    const source = readFileSync(path.join(root, file), 'utf8')
    assert.equal(/\bfetch\s*\(/.test(source), false, file)
    assert.equal(/oauth|access_token|client_secret|cron/i.test(source), false, file)
    assert.equal(source.includes('\u2014') || source.includes('\u2013'), false, file)
    const hosts = source.match(/[a-z0-9.-]*linkedin\.com/gi) || []
    for (const host of hosts) assert.equal(host, 'www.linkedin.com', file)
  }
  const page = readFileSync(path.join(root, 'src/pages/dashboard/MajlisPage.tsx'), 'utf8')
  assert.match(page, /MajlisShareCard/)
  assert.match(page, /shareEnabled=\{preview\?\.shareCards \? true : undefined\}/)
  assert.equal(/\bstaff\b/i.test(page), false)
})

test('share card renders only for an active RSVP and keeps the copied text on the URL', async () => {
  process.env.VITE_SUPABASE_URL ||= 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY ||= 'example-anon-key'
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const view = await vite.ssrLoadModule('/src/pages/dashboard/MajlisShareCard.tsx')
    const share = await vite.ssrLoadModule('/src/lib/majlisShare.ts')
    const row = event({ title: 'Capital evening' })
    const hidden = renderToStaticMarkup(createElement(view.MajlisShareCard, { event: row, nowMs: NOW }))
    assert.equal(hidden, '')
    const off = renderToStaticMarkup(createElement(view.MajlisShareCard, { event: row, nowMs: NOW, enabled: false }))
    assert.equal(off, '')
    const html = renderToStaticMarkup(createElement(view.MajlisShareCard, { event: row, nowMs: NOW, enabled: true }))
    const model = share.majlisShareModel(row, NOW, true)
    const href = attrHref(html)
    assert.equal(href, model.shareUrl)
    assert.equal(new URL(href).searchParams.get('text'), model.text)
    assert.match(html, /data-share-text/)
    assert.match(html, /target="_blank"/)
    assert.match(html, /rel="noopener noreferrer"/)
    assert.match(html, /Open LinkedIn/)
    assert.match(html, /Copy post text/)
    assert.match(html, /Share that you are attending/)
    assert.match(html, /If LinkedIn opens with an empty box, paste the post text\./)
    assert.equal(html.includes('\u2014') || html.includes('\u2013'), false)
    assert.equal(/\bsponsor\b/i.test(html), false)

    const past = event({ title: 'Capital evening', starts_at: '2026-10-01T15:00:00.000Z', ends_at: '2026-10-01T17:00:00.000Z' })
    const attended = renderToStaticMarkup(createElement(view.MajlisShareCard, { event: past, nowMs: NOW, enabled: true }))
    assert.match(attended, /Share that you attended/)
    assert.match(attended, /Saying you joined is your choice/)
    assert.equal(attended.includes('Share that you are attending'), false)

    for (const status of ['waitlist', 'cancelled', null]) {
      const markup = renderToStaticMarkup(
        createElement(view.MajlisShareCard, { event: event({ title: 'Capital evening', my_rsvp_status: status }), nowMs: NOW, enabled: true }),
      )
      assert.equal(markup, '', String(status))
    }
    const pastHidden = renderToStaticMarkup(
      createElement(view.MajlisShareCard, {
        event: event({ title: 'Capital evening', my_rsvp_status: null, ends_at: '2026-10-01T17:00:00.000Z' }),
        nowMs: NOW,
        enabled: true,
      }),
    )
    assert.equal(pastHidden, '')

    const first = event({ id: ID, title: 'Capital evening' })
    const second = event({ id: '00000000-0000-4000-8000-0000000000a2', title: 'Governance salon' })
    const pair = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        createElement(view.MajlisShareCard, { event: first, nowMs: NOW, enabled: true, dismissed: true }),
        createElement(view.MajlisShareCard, { event: second, nowMs: NOW, enabled: true }),
      ),
    )
    assert.equal((pair.match(/data-majlis-share-card/g) || []).length, 1)
    assert.equal(pair.includes('Capital evening'), false)
    assert.match(pair, /Governance salon/)

    const copiedModel = share.majlisShareModel(second, NOW, true)
    const copied = renderToStaticMarkup(
      createElement(view.MajlisShareCardView, {
        model: copiedModel,
        copied: true,
        copyError: false,
        onCopy: () => {},
        onDismiss: () => {},
      }),
    )
    assert.match(copied, /Post text copied\./)
    assert.equal(new URL(attrHref(copied)).searchParams.get('text'), copiedModel.text)

    const failed = renderToStaticMarkup(
      createElement(view.MajlisShareCardView, {
        model: copiedModel,
        copied: false,
        copyError: true,
        onCopy: () => {},
        onDismiss: () => {},
      }),
    )
    assert.match(failed, /role="alert"/)
    assert.match(failed, /Could not copy the post text/)
    assert.match(failed, /Governance salon/)
  } finally {
    await vite.close()
  }
})

const SHOTS = ['attending', 'attended', 'copied', 'dismissed', 'hidden', 'waitlist', 'empty', 'error', 'loading', 'page-error'] as const

test('majlis share shots at 1440 and 390', { timeout: 240_000 }, async (t) => {
  const executablePath = resolveChromePath() || (existsSync('/usr/local/bin/google-chrome') ? '/usr/local/bin/google-chrome' : null)
  if (!executablePath) {
    t.skip('Chrome is not installed')
    return
  }
  const shotDir = path.join(root, 'handoff/ba-p1b-majlis-linkedin')
  mkdirSync(shotDir, { recursive: true })
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
  process.env.VITE_ANALYTICS_ENABLED = 'false'
  const vite = await createServer({
    server: { host: '127.0.0.1', port: 0, hmr: false },
    logLevel: 'error',
  })
  await vite.listen()
  const address = vite.httpServer?.address()
  const port = address && typeof address === 'object' ? address.port : 0
  const origin = `http://127.0.0.1:${port}`
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  try {
    for (const shot of SHOTS) {
      for (const width of [1440, 390] as const) {
        const context = await browser.newContext({
          viewport: { width, height: width === 390 ? 844 : 900 },
          permissions: ['clipboard-read', 'clipboard-write'],
        })
        if (shot === 'error') {
          await context.addInitScript(() => {
            Object.defineProperty(navigator, 'clipboard', {
              configurable: true,
              value: {
                writeText: async () => {
                  throw new Error('denied')
                },
              },
            })
          })
        }
        const page = await context.newPage()
        const requests: string[] = []
        page.on('request', (req) => {
          const url = req.url()
          if (/linkedin\.com|googleapis|supabase\.co|oauth/i.test(url)) requests.push(url)
        })
        await page.goto(`${origin}/scripts/smoke/majlis-share.html?shot=${shot}`, { waitUntil: 'domcontentloaded' })
        await page.locator(`[data-shot="${shot}"]`).waitFor({ timeout: 60_000 })
        if (shot === 'attending' || shot === 'copied' || shot === 'error' || shot === 'dismissed') {
          await page.locator('[data-majlis-share-card]').first().waitFor()
        }
        if (shot === 'attended') {
          await page.getByRole('heading', { name: 'Share that you attended' }).waitFor()
        }
        if (shot === 'hidden' || shot === 'waitlist' || shot === 'empty' || shot === 'loading' || shot === 'page-error') {
          assert.equal(await page.locator('[data-majlis-share-card]').count(), 0, shot)
        }
        if (shot === 'copied') {
          await page.getByRole('button', { name: 'Copy post text' }).click()
          await page.getByText('Post text copied.').waitFor()
          const href = await page.getByRole('link', { name: 'Open LinkedIn' }).getAttribute('href')
          const copied = await page.evaluate(() => navigator.clipboard.readText())
          assert.equal(copied, new URL(href || '').searchParams.get('text'))
        }
        if (shot === 'error') {
          await page.getByRole('button', { name: 'Copy post text' }).click()
          await page.getByRole('alert').waitFor()
          assert.match(await page.locator('[data-share-text]').innerText(), /Capital evening/)
        }
        if (shot === 'dismissed') {
          assert.equal(await page.locator('[data-majlis-share-card]').count(), 2)
          await page.getByRole('button', { name: 'Dismiss' }).first().click()
          await page.waitForFunction(() => document.querySelectorAll('[data-majlis-share-card]').length === 1)
          assert.equal(await page.locator('[data-majlis-share-card]').count(), 1)
          assert.match(await page.locator('[data-share-text]').innerText(), /Governance salon/)
        }
        if (shot === 'loading') assert.equal(await page.locator('[aria-busy="true"]').count() > 0 || (await page.getByText('Loading majlis').count()) > 0, true)
        if (shot === 'empty') await page.getByText('No upcoming majlis.').waitFor()
        if (shot === 'page-error') await page.getByText("Couldn't refresh. Showing last update").first().waitFor()
        const card = page.locator('[data-majlis-share-card]').first()
        if ((await card.count()) > 0) {
          const link = card.getByRole('link', { name: 'Open LinkedIn' })
          const box = await link.boundingBox()
          assert.ok(box && box.height >= 44 && box.width >= 44, shot)
          const size = await card.locator('[data-share-text]').evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))
          assert.ok(size >= 15, `${shot} ${size}`)
          const href = await link.getAttribute('href')
          const shareText = await card.locator('[data-share-text]').innerText()
          assert.equal(shareText.includes('Example Host'), false, shot)
          assert.equal(/meet\.google|Join Google/i.test(shareText), false, shot)
          assert.match(shareText, /hosted by Board Arabia/)
          assert.ok(shareText.length <= 300, shot)
          assert.equal(new URL(href || '').searchParams.get('text'), shareText)
          assert.equal(new URL(href || '').hostname, 'www.linkedin.com')
          assert.equal(await link.getAttribute('target'), '_blank')
          assert.match(await link.getAttribute('rel') || '', /noopener/)
          assert.match(await link.getAttribute('rel') || '', /noreferrer/)
        }
        const text = await page.locator('body').innerText()
        assert.equal(text.includes('\u2014') || text.includes('\u2013'), false, shot)
        assert.equal(/\bsponsor\b/i.test(text), false, shot)
        assert.equal(/\$\d|\bSAR\s?\d/.test(text), false, shot)
        assert.deepEqual(requests, [], shot)
        await page.evaluate(() => {
          for (const el of document.querySelectorAll('body *')) {
            if (!(el instanceof HTMLElement)) continue
            const style = getComputedStyle(el)
            if (style.position === 'fixed' || style.position === 'sticky') el.style.setProperty('visibility', 'hidden')
          }
        })
        const file = path.join(shotDir, `${shot}-${width}.png`)
        const feed = page.locator('#majlis-feed')
        if ((await feed.count()) > 0) await feed.screenshot({ path: file })
        else await page.screenshot({ path: file })
        await context.close()
      }
    }
  } finally {
    await browser.close()
    await vite.close()
  }
})

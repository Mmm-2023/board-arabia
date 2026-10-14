import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildOutbound, resolveNewsCopy } from '../supabase/functions/_shared/bulk_mail.ts'
import { renderBulkLetter } from '../supabase/functions/_shared/bulk_mail_copy.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationName = '20261231120000_newsletter_analytics.sql'

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

test('newsletter analytics migration is named and does not assume it is newest', () => {
  const names = readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql')).sort()
  assert.equal(names.includes(migrationName), true)
  assert.ok(names.indexOf(migrationName) > names.indexOf('20261221120000_newsletter_events.sql'))
  assert.ok(names.indexOf(migrationName) > names.indexOf('20261230120000_staff_aal1_access.sql'))
  assert.equal(names.filter((name) => name.startsWith('20261231120000')).length, 1)
  const sql = read(`supabase/migrations/${migrationName}`)
  assert.equal(sql.includes('\u2014') || sql.includes('\u2013'), false)
  assert.equal(/\bemail_events\b/i.test(sql), false)
  assert.equal(/pg_cron|cron\.schedule|pg_net|net\.http/i.test(sql), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql), false)
  assert.equal(sql.toLowerCase().includes('the desk'), false)
  assert.match(sql, /alter table public\.newsletter_events enable row level security/)
  assert.match(sql, /alter table public\.newsletter_events force row level security/)
  assert.match(sql, /security definer/)
  assert.match(sql, /set search_path = ''/)
  assert.match(sql, /if not private\.is_staff\(\) then/)
  assert.match(sql, /revoke all on function public\.staff_newsletter_stats\(uuid\) from public;/)
  assert.match(sql, /revoke all on function public\.staff_newsletter_stats\(uuid\) from public, anon;/)
  assert.match(sql, /grant execute on function public\.staff_newsletter_stats\(uuid\) to authenticated;/)
  assert.match(sql, /revoke all on function public\.staff_newsletter_trend\(\) from public;/)
  assert.match(sql, /grant execute on function public\.staff_newsletter_trend\(\) to authenticated;/)
  assert.equal(/grant execute on function public\.staff_newsletter_stats\(uuid\) to anon/.test(sql), false)
  assert.match(sql, /p_value < 5 then '<5'/)
  assert.match(sql, /having count\(distinct e\.send_id\) >= 5/)
  assert.match(sql, /split_part\(v, '\?', 1\)/)
  assert.equal(sql.includes("return v || '?'"), false)
  assert.match(sql, /limit 10/)
  assert.match(sql, /'opens', 'approximate'/)
  assert.match(sql, /newsletter_unsub_url/)
  assert.match(sql, /newsletter_events_retention/)
  assert.match(sql, /interval '13 months'/)
  assert.equal(sql.includes('24 months'), false)
  assert.match(sql, /measure_opens/)
  assert.match(sql, /and s\.measure/)
  assert.match(sql, /grant execute on function public\.newsletter_events_retention\(\) to service_role/)
  assert.equal(/grant execute on function public\.newsletter_events_retention\(\) to anon/.test(sql), false)
  assert.equal(/grant\s+(select|insert|update|delete|all)\s+on\s+(table\s+)?public\.newsletter_events/i.test(sql), false)
})

test('unsubscribe clicks stay out of the stats and the header stays a raw url', () => {
  const unsubscribeUrl = 'https://example.com/email/unsubscribe?t=tok'
  const oneClickUrl = 'https://example.com/functions/v1/email-unsubscribe?t=tok'
  const preferencesUrl = 'https://example.com/dashboard/privacy'
  const letter = renderBulkLetter({
    subject: 'A note for members',
    preheader: '',
    bodyText: 'Hello from Board Arabia.',
    bodyHtml: '<p>Hello from Board Arabia.</p><p><a href="https://example.com/briefing">Read</a></p>',
    unsubscribeUrl,
    preferencesUrl,
    test: false,
  })
  const message = buildOutbound({
    fromMailbox: 'news@example.com',
    contactEmail: 'contact@example.com',
    to: 'member.one@example.com',
    subject: 'A note for members',
    preheader: '',
    bodyText: 'Hello from Board Arabia.',
    bodyHtml: '<p>Hello from Board Arabia.</p>',
    unsubscribeUrl,
    preferencesUrl,
    oneClickUrl,
    test: false,
  })
  assert.equal(message.headers['List-Unsubscribe'], `<${oneClickUrl}>`)
  assert.equal(message.headers['List-Unsubscribe'].includes('links.'), false)
  assert.equal(letter.html.includes(`href="${unsubscribeUrl}"`), true)
  assert.equal(letter.html.includes('clicktracking'), false)
  assert.equal(letter.text.includes(`Unsubscribe: ${unsubscribeUrl}`), true)
  assert.equal(letter.html.includes(`<a href="${preferencesUrl}">`), true)
  assert.equal(letter.html.includes(`href="https://links.`), false)
  const sweep = read('supabase/functions/retention-sweep/index.ts')
  const workflow = read('.github/workflows/retention-sweep.yml')
  assert.match(sweep, /newsletter_events_retention/)
  assert.match(sweep, /if \(!dry\)/)
  assert.equal(workflow.includes('schedule:'), false)
  assert.equal(workflow.includes('cron:'), false)
})

test('tracked news sender is used only when measurement is on and the env is set', () => {
  const plain = {
    RESEND_API_KEY: 'plain-key',
    EMAIL_FROM: 'news@news.boardarabia.test',
    RESEND_API_KEY_NEWS_TRACKED: 'tracked-key',
    EMAIL_FROM_NEWS_TRACKED: 'tracked@news.boardarabia.test',
    EMAIL_SENDING_PARENT: 'boardarabia.test',
  }
  const off = resolveNewsCopy(plain, false)
  assert.equal(off.tracked, false)
  assert.equal(off.fromMailbox, 'news@news.boardarabia.test')
  assert.equal(off.apiKey, 'plain-key')
  const on = resolveNewsCopy(plain, true)
  assert.equal(on.tracked, true)
  assert.equal(on.fromMailbox, 'tracked@news.boardarabia.test')
  assert.equal(on.apiKey, 'tracked-key')
  const missing = resolveNewsCopy({
    RESEND_API_KEY: 'plain-key',
    EMAIL_FROM: 'news@news.boardarabia.test',
    EMAIL_SENDING_PARENT: 'boardarabia.test',
  }, true)
  assert.equal(missing.tracked, false)
  assert.equal(missing.fromMailbox, 'news@news.boardarabia.test')
  assert.equal(missing.apiKey, 'plain-key')
  const rootTracked = resolveNewsCopy({
    RESEND_API_KEY: 'plain-key',
    EMAIL_FROM: 'news@news.boardarabia.test',
    RESEND_API_KEY_NEWS_TRACKED: 'tracked-key',
    EMAIL_FROM_NEWS_TRACKED: 'tracked@boardarabia.test',
    EMAIL_SENDING_PARENT: 'boardarabia.test',
  }, true)
  assert.equal(rootTracked.tracked, false)
  assert.equal(rootTracked.fromMailbox, 'news@news.boardarabia.test')
})

test('privacy notice states aggregate newsletter measurement', () => {
  const privacy = read('src/content/legal/privacy.en.ts')
  assert.match(privacy, /only with your consent and only to produce aggregate statistics/)
  assert.match(privacy, /Unsubscribe clicks are not included in these statistics\./)
  assert.equal(privacy.includes('The unsubscribe link is not measured'), false)
  assert.match(privacy, /Newsletter open and click records/)
  assert.match(privacy, /Removed on request to \[CONTACT EMAIL\], and in any case within 13 months/)
  assert.match(privacy, /If you agree to receive our newsletter, we measure whether it is opened and which links are clicked/)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(privacy), false)
  assert.equal(privacy.includes('\u2014') || privacy.includes('\u2013'), false)
  assert.equal(/\bsponsor\b/i.test(privacy), false)
})

test('the email mock is not wired into the live admin page', () => {
  assert.equal(read('src/pages/admin/EmailPage.tsx').includes('emailDeskMock'), false)
  assert.equal(read('src/pages/admin/EmailPage.tsx').includes('EmailDeskMock'), false)
  assert.equal(read('src/App.tsx').includes('emailDeskMock'), false)
  assert.equal(read('src/App.tsx').includes('EmailDeskMock'), false)
  const mock = read('scripts/smoke/emailDeskMock.tsx')
  assert.equal(mock.includes('\u2014') || mock.includes('\u2013'), false)
  assert.equal(/\bsponsor\b/i.test(mock), false)
  assert.equal(mock.toLowerCase().includes('the desk'), false)
  assert.equal(/supabase|fetch\(/.test(mock), false)
  assert.match(mock, /Weekly roundup/)
  assert.match(mock, /Contacts/)
  assert.match(mock, /Opens are approximate/)
  assert.match(mock, /<5/)
  assert.match(mock, /example\.com/)
  assert.equal(/[A-Za-z0-9._%+-]+@(?!example\.com)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(mock), false)
})

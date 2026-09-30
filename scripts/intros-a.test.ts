import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { deskIntroAlert } from '../supabase/functions/_shared/desk_intro_alert.ts'
import {
  bookCallMailto,
  cleanDeskIntroNote,
  deskIntroLine,
  introContactVisible,
  introQuotaHint,
  introRequestError,
  presentIntroContact,
  presentIntroContacts,
  presentIntroQuota,
  riyadhMonthKey,
  type IntroRow,
} from '../src/lib/memberIntros.ts'
import { presentDeskIntros } from '../src/lib/deskIntros.ts'

const migration = readFileSync(
  new URL('../supabase/migrations/20261116120000_intros_a_contact_desk_limit.sql', import.meta.url),
  'utf8',
)

const REQUESTER = '11111111-1111-4111-8111-111111111111'
const TARGET = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'
const INTRO = '44444444-4444-4444-8444-444444444444'

function sliceFn(name: string) {
  const start = migration.indexOf(`function public.${name}`)
  assert.ok(start > 0, name)
  const next = migration.indexOf('create or replace function', start + 10)
  return migration.slice(start, next === -1 ? undefined : next)
}

test('accepted parties see contacts and everyone else sees nothing', () => {
  assert.equal(
    introContactVisible({ viewerId: REQUESTER, requesterId: REQUESTER, targetId: TARGET, status: 'accepted' }),
    true,
  )
  assert.equal(
    introContactVisible({ viewerId: TARGET, requesterId: REQUESTER, targetId: TARGET, status: 'accepted' }),
    true,
  )
  assert.equal(
    introContactVisible({ viewerId: OTHER, requesterId: REQUESTER, targetId: TARGET, status: 'accepted' }),
    false,
  )
  assert.equal(
    introContactVisible({ viewerId: REQUESTER, requesterId: REQUESTER, targetId: TARGET, status: 'pending' }),
    false,
  )
  assert.equal(
    introContactVisible({ viewerId: TARGET, requesterId: REQUESTER, targetId: TARGET, status: 'declined' }),
    false,
  )

  const contacts = sliceFn('list_accepted_intro_contacts')
  const party = contacts.indexOf('i.requester_id = auth.uid() or i.target_id = auth.uid()')
  const accepted = contacts.indexOf("i.status = 'accepted'")
  assert.ok(party > 0 && accepted > 0)
  assert.equal(/status\s*=\s*'pending'|status\s*=\s*'declined'/.test(contacts), false)
  assert.match(contacts, /security definer/)
  assert.match(contacts, /set search_path = public/)
  assert.match(contacts, /nullif\(btrim\(other_profile\.phone\), ''\)/)
  assert.match(migration, /revoke all on function public\.list_accepted_intro_contacts\(\) from public, anon/)
  assert.equal(/grant execute on function public\.list_accepted_intro_contacts\(\) to anon/.test(migration), false)

  const mine = sliceFn('list_my_intros')
  const staff = sliceFn('staff_list_all_intros')
  const desk = sliceFn('staff_list_desk_intros')
  for (const body of [mine, staff, desk]) {
    assert.equal(body.includes('.email'), false)
    assert.equal(body.includes('linkedin_url'), false)
    assert.equal(body.includes('calendar_url'), false)
    assert.equal(body.includes('phone'), false)
  }
})

test('monthly limit is enforced in Riyadh time before insert, with sponsor credits on top', () => {
  const request = sliceFn('request_member_intro')
  const limitAt = request.indexOf('intro_limit')
  const insertAt = request.toLowerCase().indexOf('insert into public.member_intros')
  const sampleAt = request.indexOf('sample_blocked')
  assert.ok(sampleAt > 0 && sampleAt < insertAt)
  assert.ok(limitAt > 0 && limitAt < insertAt)
  assert.match(request, /private\.riyadh_month_start\(now\(\)\)/)
  assert.match(request, /private\.intro_allowance_for\(auth\.uid\(\)\)/)
  assert.match(migration, /timezone\('Asia\/Riyadh', p_at\)/)
  assert.match(migration, /intro_credits/)
  assert.match(migration, /m\.seat = 'sponsor'/)
  assert.match(migration, /monthly_limit integer not null default 5/)
  assert.equal(riyadhMonthKey(new Date('2026-09-30T20:30:00.000Z')), '2026-09')
  assert.equal(riyadhMonthKey(new Date('2026-09-30T21:30:00.000Z')), '2026-10')
  assert.equal(introQuotaHint(3, 5), '3 of 5 left')
  assert.equal(introQuotaHint(0, 7), '0 of 7 left')
  assert.equal(introRequestError('intro_limit'), "You have used this month's introductions.")
  assert.deepEqual(presentIntroQuota({ used: 2, base: 5, allowance: 7, remaining: 5 }), {
    used: 2,
    base: 5,
    allowance: 7,
    remaining: 5,
  })
})

test('desk accept queues an audited intro sent mark and the alert carries no mailbox', () => {
  const respond = sliceFn('respond_member_intro')
  assert.match(respond, /desk_status = case/)
  assert.match(respond, /when next_status = 'accepted' and v_ask then 'queued'/)
  assert.match(respond, /'desk_queued'/)
  const mark = sliceFn('staff_mark_desk_intro_sent')
  const staffAt = mark.indexOf('if not private.is_staff()')
  const auditAt = mark.indexOf('insert into public.member_intro_desk_audits')
  const updateAt = mark.toLowerCase().indexOf('update public.member_intros')
  assert.ok(staffAt > 0 && auditAt > staffAt && updateAt > auditAt)
  assert.match(mark, /'intro_sent'/)
  assert.match(migration, /action = 'intro_sent'/)
  const alert = deskIntroAlert({ requesterName: 'Amina Example', targetName: 'Omar Example' })
  assert.equal(JSON.stringify(alert).includes('@'), false)
  assert.equal(alert.approvePath, '/admin/people/intros')
  const notify = readFileSync(new URL('../supabase/functions/notify-desk-intro/index.ts', import.meta.url), 'utf8')
  assert.match(notify, /notifyAdmin\(/)
  assert.equal(notify.includes('@'), false)
  assert.equal(/cindy/i.test(notify + migration), false)
  const rows = presentDeskIntros([
    {
      id: INTRO,
      requester_name: 'Amina Example',
      target_name: 'Omar Example',
      reason: 'A board question.',
      desk_status: 'queued',
      desk_note: '',
      is_demo: false,
    },
  ])
  assert.equal(rows.length, 1)
  assert.equal(cleanDeskIntroNote('  Sent.  ').ok, true)
  assert.equal(deskIntroLine({ kind: 'member', status: 'pending', direction: 'incoming', ask_desk: true }, 'member'), 'They asked the desk to introduce you.')
  assert.equal(deskIntroLine({ kind: 'member', status: 'declined', direction: 'incoming', ask_desk: true }, 'member'), null)
})

test('contact cards hide phone when unset and stay off pending rows', async () => {
  const contact = presentIntroContact({
    intro_id: INTRO,
    email: 'amina@example.com',
    linkedin_url: 'https://www.linkedin.com/in/example-chair',
    phone: '',
    calendar_url: 'https://calendar.example.com/example-chair',
  })
  assert.ok(contact)
  assert.equal(contact?.phone, '')
  assert.equal(contact?.calendar_url, 'https://calendar.example.com/example-chair')
  assert.equal(bookCallMailto('amina@example.com'), 'mailto:amina@example.com?subject=Board%20Arabia%20introduction')
  assert.equal(presentIntroContacts([{ intro_id: 'not-an-id', email: 'amina@example.com' }]).length, 0)
  assert.equal(
    presentIntroContact({
      intro_id: INTRO,
      email: 'amina@example.com',
      calendar_url: 'javascript:alert(1)',
    })?.calendar_url,
    '',
  )

  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const action = await vite.ssrLoadModule('/src/pages/dashboard/DirectoryIntroAction.tsx')
    const board = await vite.ssrLoadModule('/src/pages/dashboard/IntroBoard.tsx')
    const form = renderToStaticMarkup(
      createElement(action.DirectoryIntroAction, {
        sample: false,
        self: false,
        status: null,
        busy: false,
        error: '',
        startOpen: true,
        quota: { used: 2, base: 5, allowance: 5, remaining: 3 },
        onRequest: () => {},
      }),
    )
    assert.match(form, /Ask the desk to introduce us/)
    assert.match(form, /3 of 5 left/)
    assert.equal(form.includes('\u2014'), false)
    assert.equal(form.includes('\u2013'), false)

    const blocked = renderToStaticMarkup(
      createElement(action.DirectoryIntroAction, {
        sample: false,
        self: false,
        status: null,
        busy: false,
        error: '',
        startOpen: true,
        quota: { used: 5, base: 5, allowance: 5, remaining: 0 },
        onRequest: () => {},
      }),
    )
    assert.match(blocked, /You have used this month/)
    assert.match(blocked, /disabled/)

    const pending: IntroRow = {
      id: INTRO,
      kind: 'member',
      direction: 'incoming',
      status: 'pending',
      title: 'Omar Example',
      detail: 'Chair advisor',
      reason: 'A question on a mining seat.',
      is_demo: false,
      subject_id: TARGET,
      created_at: '2026-09-29T09:15:00.000Z',
      ask_desk: true,
    }
    const accepted: IntroRow = { ...pending, id: REQUESTER, status: 'accepted', direction: 'outgoing', ask_desk: true, desk_status: 'queued' }
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(board.IntroBoard, {
          tone: 'member',
          rows: [pending, accepted],
          busyId: null,
          error: '',
          contacts: {
            [REQUESTER]: {
              intro_id: REQUESTER,
              email: 'omar@example.com',
              linkedin_url: 'https://www.linkedin.com/in/example-chair',
              phone: '',
              calendar_url: 'https://calendar.example.com/example-chair',
            },
            [INTRO]: {
              intro_id: INTRO,
              email: 'hidden@example.com',
              linkedin_url: '',
              phone: '+966500000000',
              calendar_url: '',
            },
          },
        }),
      ),
    )
    assert.match(html, /Book a call/)
    assert.match(html, /omar@example.com/)
    assert.match(html, /Calendar/)
    assert.equal(html.includes('hidden@example.com'), false)
    assert.equal(html.includes('+966500000000'), false)
    assert.match(html, /They asked the desk to introduce you/)
    assert.match(html, /The desk will introduce you/)
    assert.equal(html.includes('\u2014'), false)
    assert.equal(html.includes('\u2013'), false)
  } finally {
    await vite.close()
  }
})

test('intros migration stores no mailbox and no dash punctuation', () => {
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)
  assert.equal(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(migration), false)
  assert.equal(/cindy|sk_live|eyJ|SUPABASE_SERVICE/i.test(migration), false)
  assert.match(migration, /set search_path = public/)
})

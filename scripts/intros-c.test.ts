import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import {
  countIntroFunnel,
  formatDealStartedWhen,
  formatIntroCount,
  introDealAllowed,
  introDealError,
  introFunnelBounds,
  introFunnelDenied,
  presentIntroDeals,
  presentIntroFunnel,
  presentIntroFunnelPayload,
  type IntroFunnelEvent,
} from '../src/lib/introFunnel.ts'

const migration = readFileSync(
  new URL('../supabase/migrations/20261118120000_intros_c_funnel.sql', import.meta.url),
  'utf8',
)

const NOW = new Date('2026-09-30T11:50:00.000Z')
const ACCEPTED = '55555555-5555-4555-8555-555555555555'

function sliceFn(name: string) {
  const start = migration.indexOf(`function public.${name}`)
  assert.ok(start > 0, name)
  const asAt = migration.indexOf('as $$\n', start)
  const end = migration.indexOf('\n$$;', asAt)
  assert.ok(asAt > start && end > asAt, name)
  return migration.slice(asAt, end)
}

test('funnel counts follow the date range and skip samples', () => {
  const month = introFunnelBounds('month', NOW)
  const quarter = introFunnelBounds('quarter', NOW)
  const rolling = introFunnelBounds('30', NOW)
  const custom = introFunnelBounds('custom', NOW, '2026-09-01', '2026-09-10')
  assert.equal(month.ok && quarter.ok && rolling.ok && custom.ok, true)
  if (!month.ok || !quarter.ok || !rolling.ok || !custom.ok) return

  assert.equal(month.from.toISOString(), '2026-08-31T21:00:00.000Z')
  assert.equal(month.to.toISOString(), '2026-09-30T21:00:00.000Z')
  assert.equal(quarter.from.toISOString(), '2026-06-30T21:00:00.000Z')
  assert.equal(quarter.to.toISOString(), '2026-09-30T21:00:00.000Z')
  assert.equal(rolling.from.toISOString(), '2026-08-31T11:50:00.000Z')
  assert.equal(rolling.to.toISOString(), NOW.toISOString())
  assert.equal(custom.from.toISOString(), '2026-08-31T21:00:00.000Z')
  assert.equal(custom.to.toISOString(), '2026-09-10T21:00:00.000Z')
  assert.equal(introFunnelBounds('custom', NOW, '2026-09-12', '2026-09-01').ok, false)
  assert.equal(introFunnelBounds('custom', NOW, '', '').ok, false)

  const rows: IntroFunnelEvent[] = [
    event('2026-09-02T09:00:00.000Z', null, 'pending', null, null, false),
    event('2026-08-01T09:00:00.000Z', '2026-09-10T09:00:00.000Z', 'accepted', null, null, false),
    event('2026-09-05T09:00:00.000Z', '2026-09-06T09:00:00.000Z', 'accepted', '2026-09-20T09:00:00.000Z', '2026-09-21T09:00:00.000Z', false),
    event('2026-09-08T09:00:00.000Z', '2026-09-09T09:00:00.000Z', 'declined', null, null, false),
    event('2026-09-04T09:00:00.000Z', '2026-09-04T10:00:00.000Z', 'accepted', '2026-09-04T11:00:00.000Z', '2026-09-04T12:00:00.000Z', true),
    event(month.from.toISOString(), null, 'pending', null, null, false),
    event(month.to.toISOString(), null, 'pending', null, null, false),
  ]
  assert.deepEqual(countIntroFunnel(rows, month.from, month.to), {
    requested: 4,
    accepted: 2,
    met: 1,
    deal_started: 1,
  })
  assert.deepEqual(countIntroFunnel(rows, custom.from, custom.to), {
    requested: 4,
    accepted: 2,
    met: 0,
    deal_started: 0,
  })
  assert.equal(countIntroFunnel([{ ...rows[2], metAt: null }], month.from, month.to).met, 0)

  const funnel = sliceFn('staff_intro_funnel')
  assert.match(funnel, /i\.requested_at >= p_from/)
  assert.match(funnel, /i\.requested_at < p_to/)
  assert.match(funnel, /i\.status = 'accepted'/)
  assert.match(funnel, /i\.decided_at >= p_from/)
  assert.match(funnel, /i\.decided_at < p_to/)
  assert.match(funnel, /i\.deal_started_at >= p_from/)
  assert.match(funnel, /i\.deal_started_at < p_to/)
  assert.match(funnel, /private\.intro_met_count\(p_from, p_to\)/)
  assert.match(funnel, /not private\.sample_subject\(i\.requester_id\)/)
  const met = migration.slice(migration.indexOf('function private.intro_met_count'), migration.indexOf('revoke all on function private.intro_met_count'))
  assert.match(met, /to_regclass\('public\.member_intro_met'\)/)
  assert.match(met, /requester_met/)
  assert.match(met, /target_met/)
  assert.match(met, /return 0;/)
  assert.equal(/add column[^;]*requester_met/i.test(migration), false)
  assert.equal(/did you meet/i.test(migration), false)
})

test('deal started is staff only and writes who and when', () => {
  const tag = sliceFn('staff_set_intro_deal')
  const staffAt = tag.indexOf('if not private.is_staff()')
  const auditAt = tag.indexOf('insert into public.member_intro_deal_audits')
  const updateAt = tag.toLowerCase().indexOf('update public.member_intros')
  assert.ok(staffAt >= 0 && auditAt > staffAt && updateAt > auditAt)
  assert.match(tag, /auth\.uid\(\)/)
  assert.match(tag, /'deal_started'/)
  assert.match(tag, /'deal_cleared'/)
  assert.match(tag, /sample_blocked/)
  assert.match(tag, /status is distinct from 'accepted'/)
  assert.match(migration, /actor_id uuid not null/)
  assert.match(migration, /created_at timestamptz not null default now\(\)/)
  assert.match(migration, /using \(private\.is_staff\(\)\)/)
  assert.match(migration, /set search_path = public/)
  assert.equal(introDealAllowed({ kind: 'member', status: 'accepted', is_demo: false }), true)
  assert.equal(introDealAllowed({ kind: 'member', status: 'pending', is_demo: false }), false)
  assert.equal(introDealAllowed({ kind: 'member', status: 'accepted', is_demo: true }), false)
  assert.equal(introDealAllowed({ kind: 'mandate', status: 'accepted', is_demo: false }), false)
  assert.equal(introDealError('sample_blocked'), 'Sample requests stay as they are.')
  assert.equal(introDealError('not_allowed'), 'This desk is for staff.')
  assert.match(formatDealStartedWhen('2026-09-21T09:00:00.000Z'), /21 Sept? 2026/)
})

test('public and sponsor counts use Fewer than 5 at 0, 1, 4, and 5', () => {
  assert.equal(formatIntroCount(0, 'public'), '0')
  assert.equal(formatIntroCount(1, 'public'), 'Fewer than 5')
  assert.equal(formatIntroCount(4, 'public'), 'Fewer than 5')
  assert.equal(formatIntroCount(5, 'public'), '5')
  assert.equal(formatIntroCount(0, 'staff'), '0')
  assert.equal(formatIntroCount(1, 'staff'), '1')
  assert.equal(formatIntroCount(4, 'staff'), '4')
  assert.equal(formatIntroCount(5, 'staff'), '5')
  assert.deepEqual(presentIntroFunnel({ requested: 1, accepted: 4, met: 0, deal_started: 5 }, 'public'), {
    requested: 'Fewer than 5',
    accepted: 'Fewer than 5',
    met: '0',
    deal_started: '5',
  })
  assert.equal(presentIntroFunnel({ requested: 1, accepted: 4, met: 0, deal_started: 5 }, 'staff').requested, '1')
  const payload = presentIntroFunnelPayload({
    requested: 2,
    accepted: 1,
    met: 0,
    deal_started: 0,
    updated_at: '2026-09-30T11:50:00.000Z',
  })
  assert.equal(payload?.counts.requested, 2)
  assert.equal(presentIntroFunnelPayload({ requested: 1, accepted: 1, met: 1, deal_started: 1, updated_at: 'ada@example.com' }), null)
  assert.deepEqual(presentIntroDeals([{ id: ACCEPTED, deal_started_at: '2026-09-21T09:00:00.000Z' }]), {
    [ACCEPTED]: '2026-09-21T09:00:00.000Z',
  })
  assert.deepEqual(presentIntroDeals([{ id: 'not-an-id', deal_started_at: '2026-09-21T09:00:00.000Z' }]), {})
})

test('a non-staff member cannot read the funnel', () => {
  for (const name of ['staff_intro_funnel', 'staff_list_intro_deals', 'staff_set_intro_deal']) {
    const body = sliceFn(name)
    const headerStart = migration.indexOf(`function public.${name}`)
    const header = migration.slice(headerStart, migration.indexOf('as $$\n', headerStart))
    const gate = body.indexOf('if not private.is_staff()')
    const readAt = body.search(/count\(\*\)|jsonb_agg|from public\.member_intros/i)
    assert.ok(gate >= 0 && readAt > gate, name)
    assert.match(header, /security definer/)
    assert.match(header, /set search_path = public/)
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\([^;]*\\) from public, anon;`))
    assert.equal(new RegExp(`grant execute on function public\\.${name}\\([^;]*\\) to anon`).test(migration), false)
  }
  assert.match(sliceFn('staff_intro_funnel'), /raise exception 'not_allowed'/)
  assert.equal(introFunnelDenied('not_allowed'), true)
  assert.equal(introFunnelDenied('42501'), true)
  assert.equal(introFunnelDenied('timeout'), false)
  const member = readFileSync(new URL('../src/pages/dashboard/IntrosPage.tsx', import.meta.url), 'utf8')
  const sponsor = readFileSync(new URL('../src/pages/dashboard/SponsorshipView.tsx', import.meta.url), 'utf8')
  const applications = readFileSync(new URL('../src/pages/admin/ApplicationsPage.tsx', import.meta.url), 'utf8')
  assert.equal(member.includes('staff_intro_funnel'), false)
  assert.equal(sponsor.includes('staff_intro_funnel'), false)
  assert.equal(applications.includes('staff_intro_funnel'), false)
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)
  assert.equal(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(migration), false)
})

test('staff funnel shows real numbers and the deal tag stays off member cards', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const funnel = await vite.ssrLoadModule('/src/pages/admin/IntroFunnel.tsx')
    const board = await vite.ssrLoadModule('/src/pages/dashboard/IntroBoard.tsx')
    const counts = { requested: 1, accepted: 4, met: 0, deal_started: 5 }
    const shared = {
      range: 'month' as const,
      customFrom: '',
      customTo: '',
      counts,
      loading: false,
      error: '',
      denied: false,
      updatedAt: NOW,
      onRange: () => {},
      onCustomFrom: () => {},
      onCustomTo: () => {},
      onApplyCustom: () => {},
      onRetry: () => {},
    }
    const staffHtml = renderToStaticMarkup(createElement(funnel.IntroFunnelView, { ...shared, audience: 'staff' }))
    const publicHtml = renderToStaticMarkup(createElement(funnel.IntroFunnelView, { ...shared, audience: 'public' }))
    assert.match(staffHtml, /Introduction funnel/)
    assert.match(staffHtml, />1</)
    assert.match(staffHtml, />4</)
    assert.match(staffHtml, />5</)
    assert.equal(staffHtml.includes('Fewer than 5'), false)
    assert.match(publicHtml, /Fewer than 5/)
    assert.match(publicHtml, />0</)
    assert.match(publicHtml, />5</)
    assert.equal(publicHtml.includes('>1<'), false)
    assert.equal(publicHtml.includes('>4<'), false)
    assert.match(staffHtml, /This month/)
    assert.match(staffHtml, /Last 30 days/)
    assert.match(staffHtml, /Quarter/)
    assert.match(staffHtml, /Custom range/)
    const customHtml = renderToStaticMarkup(
      createElement(funnel.IntroFunnelView, { ...shared, range: 'custom', customFrom: '2026-09-01', customTo: '2026-09-10' }),
    )
    assert.match(customHtml, /Apply range/)
    assert.match(customHtml, /intro-funnel-from/)
    const deniedHtml = renderToStaticMarkup(
      createElement(funnel.IntroFunnelView, { ...shared, counts: null, denied: true }),
    )
    assert.match(deniedHtml, /This desk is for staff/)

    const row = {
      id: ACCEPTED,
      kind: 'member' as const,
      direction: 'outgoing' as const,
      status: 'accepted' as const,
      title: 'Noura Al-Wahat',
      detail: 'Non-executive director',
      reason: 'A board question on health.',
      is_demo: false,
      subject_id: '66666666-6666-4666-8666-666666666666',
      created_at: '2026-09-28T09:15:00.000Z',
    }
    const staffBoard = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(board.IntroBoard, {
          tone: 'staff',
          rows: [row, { ...row, id: '77777777-7777-4777-8777-777777777777', status: 'pending' }],
          busyId: null,
          error: '',
          onDeal: () => {},
          dealStartedAt: { [ACCEPTED]: '2026-09-21T09:00:00.000Z' },
        }),
      ),
    )
    assert.match(staffBoard, /Clear deal started/)
    assert.match(staffBoard, /Deal started 21 Sept? 2026/)
    const memberBoard = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(board.IntroBoard, {
          tone: 'member',
          rows: [row],
          busyId: null,
          error: '',
          onDeal: () => {},
          dealStartedAt: { [ACCEPTED]: '2026-09-21T09:00:00.000Z' },
        }),
      ),
    )
    assert.equal(memberBoard.includes('Clear deal started'), false)
    assert.equal(memberBoard.includes('Deal started'), false)
    assert.equal(staffHtml.includes('\u2014'), false)
    assert.equal(staffHtml.includes('\u2013'), false)
  } finally {
    await vite.close()
  }
})

function event(
  requestedAt: string,
  decidedAt: string | null,
  status: IntroFunnelEvent['status'],
  metAt: string | null,
  dealStartedAt: string | null,
  sample: boolean,
): IntroFunnelEvent {
  return { requestedAt, decidedAt, status, metAt, dealStartedAt, sample }
}

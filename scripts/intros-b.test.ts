import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import {
  isoWeekParts,
  isExampleMemberName,
  meetIntroNudgeMail,
  pendingIntroNudgeMail,
  planIntroWeek,
  runSuggestIntros,
  scheduleAuthorized,
  suggestionReason,
  type PlanIntro,
  type PlanMember,
  type PlannedNudge,
} from '../supabase/functions/_shared/suggest_intros.ts'
import { presentIntroSuggestion, presentIntroSuggestions } from '../src/lib/introSuggestions.ts'
import { presentIntroRow } from '../src/lib/memberIntros.ts'

const migration = readFileSync(
  new URL('../supabase/migrations/20261117120000_intros_b_suggestions_nudges.sql', import.meta.url),
  'utf8',
)
const edge = readFileSync(new URL('../supabase/functions/suggest-intros/index.ts', import.meta.url), 'utf8')
const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8')
const planner = readFileSync(new URL('../supabase/functions/_shared/suggest_intros.ts', import.meta.url), 'utf8')

const NOW = new Date('2026-09-30T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

function member(id: string, patch: Partial<PlanMember> = {}): PlanMember {
  return {
    id,
    email: `${id}@example.com`,
    status: 'active',
    seat: 'ksa',
    isDemo: false,
    fullName: id,
    sectorTags: ['Energy transition'],
    visionThemes: ['Renewable energy'],
    region: 'Riyadh',
    sample: false,
    ...patch,
  }
}

function intro(patch: Partial<PlanIntro> & Pick<PlanIntro, 'id' | 'requesterId' | 'targetId'>): PlanIntro {
  return {
    status: 'pending',
    requestedAt: new Date(NOW.getTime() - 4 * DAY).toISOString(),
    decidedAt: null,
    pendingNudgeSent: false,
    meetRequesterSent: false,
    meetTargetSent: false,
    ...patch,
  }
}

test('ISO week is stable and a second daily call writes no new suggestions', () => {
  assert.deepEqual(isoWeekParts(new Date('2026-01-01T00:00:00.000Z')), { year: 2026, week: 1 })
  assert.deepEqual(isoWeekParts(NOW), { year: 2026, week: 40 })
  assert.deepEqual(isoWeekParts(new Date('2026-12-31T12:00:00.000Z')), { year: 2026, week: 53 })
  assert.equal(suggestionReason({ sectors: ['Energy transition'], themes: [], region: 'Riyadh' }), 'Both work on energy transition in Riyadh.')

  const members = [member('amina'), member('layla')]
  const first = planIntroWeek({ now: NOW, weekAlreadyHasSuggestions: false, members, intros: [] })
  assert.equal(first.noop, false)
  assert.equal(first.suggestions.length, 2)
  assert.equal(first.isoYear, 2026)
  assert.equal(first.isoWeek, 40)

  const second = planIntroWeek({ now: new Date(NOW.getTime() + DAY), weekAlreadyHasSuggestions: true, members, intros: [] })
  assert.equal(second.noop, true)
  assert.deepEqual(second.suggestions, [])
  assert.equal(second.isoWeek, first.isoWeek)
})

test('suggestions skip demo, EXAMPLE, samples, self, sponsors as targets, and any existing pair', () => {
  assert.equal(isExampleMemberName('Example Member'), true)
  assert.equal(isExampleMemberName('Amina Al Harbi'), false)

  const members = [
    member('amina'),
    member('layla'),
    member('noura', { region: 'Jeddah', visionThemes: [] }),
    member('hana', { sectorTags: ['Health'], visionThemes: [], region: 'Riyadh' }),
    member('lina', { sectorTags: [], visionThemes: ['Renewable energy'], region: 'Jeddah' }),
    member('demo', { isDemo: true, fullName: 'Demo Person' }),
    member('sample', { sample: true, fullName: 'Sample Person' }),
    member('example', { fullName: 'Example Member', sample: false, isDemo: false }),
    member('declined'),
    member('asked'),
    member('outbound'),
    member('quiet', { sectorTags: ['Tourism'], visionThemes: ['Tourism'], region: 'Abha' }),
    member('paused', { status: 'suspended' }),
    member('sponsor', { seat: 'sponsor' }),
  ]
  const intros = [
    intro({ id: 'd1', requesterId: 'declined', targetId: 'amina', status: 'declined' }),
    intro({ id: 'p1', requesterId: 'asked', targetId: 'amina', status: 'pending' }),
    intro({ id: 'o1', requesterId: 'amina', targetId: 'outbound', status: 'accepted', decidedAt: NOW.toISOString() }),
  ]
  const plan = planIntroWeek({ now: NOW, weekAlreadyHasSuggestions: false, members, intros })
  const picks = plan.suggestions.filter((row) => row.memberId === 'amina')
  assert.deepEqual(picks.map((row) => row.suggestedId), ['layla', 'noura', 'hana'])
  assert.equal(picks[0]?.reason, 'Both work on energy transition in Riyadh.')
  assert.equal(picks[1]?.reason, 'Both work on energy transition.')
  assert.equal(picks[2]?.reason, 'Both are in Riyadh.')
  for (const blocked of ['amina', 'demo', 'sample', 'example', 'declined', 'asked', 'outbound', 'quiet', 'paused', 'sponsor', 'lina']) {
    assert.equal(picks.some((row) => row.suggestedId === blocked), false, blocked)
  }
  assert.equal(plan.suggestions.some((row) => row.memberId === 'demo' || row.memberId === 'example' || row.memberId === 'paused'), false)
  const sponsorPicks = plan.suggestions.filter((row) => row.memberId === 'sponsor')
  assert.equal(sponsorPicks.length, 3)
  assert.equal(sponsorPicks.some((row) => row.suggestedId === 'layla' || row.suggestedId === 'amina'), true)
  assert.equal(plan.suggestions.some((row) => row.suggestedId === 'sponsor'), false)
  assert.equal(plan.suggestions.some((row) => row.memberId === 'layla' && row.suggestedId === 'amina'), true)
  assert.equal(plan.suggestions.some((row) => row.memberId === 'declined' && row.suggestedId === 'amina'), false)
})

test('pending and meet nudges send once, and a dry run writes nothing', async () => {
  const members = [member('amina'), member('layla')]
  const fresh = intro({ id: 'fresh', requesterId: 'amina', targetId: 'layla', requestedAt: new Date(NOW.getTime() - DAY).toISOString() })
  const due = intro({ id: 'due', requesterId: 'amina', targetId: 'layla' })
  const sent = intro({ id: 'sent', requesterId: 'amina', targetId: 'layla', pendingNudgeSent: true })
  const earlyMeet = intro({
    id: 'early',
    requesterId: 'amina',
    targetId: 'layla',
    status: 'accepted',
    decidedAt: new Date(NOW.getTime() - 2 * DAY).toISOString(),
  })
  const meet = intro({
    id: 'meet',
    requesterId: 'amina',
    targetId: 'layla',
    status: 'accepted',
    decidedAt: new Date(NOW.getTime() - 8 * DAY).toISOString(),
  })
  const meetHalf = intro({
    id: 'half',
    requesterId: 'amina',
    targetId: 'layla',
    status: 'accepted',
    decidedAt: new Date(NOW.getTime() - 8 * DAY).toISOString(),
    meetRequesterSent: true,
  })
  const demoDue = intro({ id: 'demo-due', requesterId: 'demo', targetId: 'layla' })

  const quiet = planIntroWeek({
    now: NOW,
    weekAlreadyHasSuggestions: false,
    members: [...members, member('demo', { isDemo: true })],
    intros: [fresh, sent, earlyMeet, demoDue],
  })
  assert.deepEqual(quiet.pendingNudges.map((row) => row.introId), [])
  assert.deepEqual(quiet.meetNudges, [])

  const pending = planIntroWeek({ now: NOW, weekAlreadyHasSuggestions: true, members, intros: [due] })
  assert.equal(pending.suggestions.length, 0)
  assert.equal(pending.pendingNudges.length, 1)
  assert.equal(pending.pendingNudges[0]?.memberId, 'layla')
  assert.equal(pending.pendingNudges[0]?.party, 'target')

  const both = planIntroWeek({ now: NOW, weekAlreadyHasSuggestions: true, members, intros: [meet] })
  assert.deepEqual(both.meetNudges.map((row) => row.memberId).sort(), ['amina', 'layla'])

  const one = planIntroWeek({ now: NOW, weekAlreadyHasSuggestions: true, members, intros: [meetHalf] })
  assert.deepEqual(one.meetNudges.map((row) => row.memberId), ['layla'])

  const writes: string[] = []
  const sends: string[] = []
  const dry = await runSuggestIntros(runner(pending, true, true, writes, sends, async () => true))
  assert.equal(dry.dry_run, true)
  assert.equal(dry.wrote, false)
  assert.equal(dry.sent, 0)
  assert.deepEqual(writes, [])
  assert.deepEqual(sends, [])
  assert.equal(JSON.stringify(dry).includes('@'), false)

  const open = planIntroWeek({ now: NOW, weekAlreadyHasSuggestions: false, members, intros: [] })
  const unsent = await runSuggestIntros(runner(open, false, false, writes, sends, async () => true))
  assert.equal(unsent.mail_ready, false)
  assert.equal(unsent.sent, 0)
  assert.equal(unsent.wrote, true)
  assert.ok(writes.length > 0)
  assert.deepEqual(sends, [])

  const claimed = new Set<string>()
  const once = await runSuggestIntros(
    runner(pending, false, true, writes, sends, async (introId) => {
      if (claimed.has(introId)) return false
      claimed.add(introId)
      return true
    }),
  )
  assert.equal(once.sent, 1)
  assert.deepEqual(sends, ['due'])
  const again = await runSuggestIntros(
    runner(pending, false, true, writes, sends, async (introId) => !claimed.has(introId)),
  )
  assert.equal(again.sent, 0)
  assert.deepEqual(sends, ['due'])

  const pendingMail = pendingIntroNudgeMail('https://boardarabia.com')
  const meetMail = meetIntroNudgeMail('https://boardarabia.com')
  assert.match(pendingMail.text, /three days/)
  assert.match(meetMail.text, /Did you meet\?|whether you met/)
  assert.match(meetMail.subject, /Did you meet\?/)
  assert.equal(pendingMail.text.includes('@'), false)
  assert.equal(meetMail.html.includes('calendar.app.google'), false)
  assert.match(pendingMail.text, /Board Arabia/)
})

test('RLS lets a member read only their own suggestions and dry_run does not write', () => {
  assert.match(migration, /alter table public\.intro_suggestions force row level security/)
  assert.match(migration, /revoke all on table public\.intro_suggestions from public, anon, authenticated/)
  assert.match(migration, /grant select on table public\.intro_suggestions to authenticated/)
  assert.equal(/grant (insert|update|delete|select) on table public\.intro_suggestions to anon/.test(migration), false)
  assert.equal(/grant insert on table public\.intro_suggestions to authenticated/.test(migration), false)
  const policies = migration.match(/using \(member_id = auth\.uid\(\)\)/g)
  assert.equal(policies?.length, 2)
  assert.match(migration, /intro_suggestions_select_own/)
  assert.match(migration, /s\.member_id = auth\.uid\(\)/)
  assert.equal(/grant execute on function public\.list_my_intro_suggestions\(\) to anon/.test(migration), false)
  assert.equal(/grant execute on function public\.record_intro_meet\(uuid, text\) to anon/.test(migration), false)

  for (const name of ['list_my_intro_suggestions', 'record_intro_meet', 'list_my_intros']) {
    const start = migration.indexOf(`function public.${name}`)
    assert.ok(start > 0, name)
    const header = migration.slice(start, migration.indexOf('as $$', start))
    assert.match(header, /security definer/)
    assert.match(header, /set search_path = public/)
  }

  const dryAt = planner.indexOf('if (input.dryRun) return report')
  const writeAt = planner.indexOf('await input.writeSuggestions')
  const sendAt = planner.indexOf('await input.send')
  assert.ok(dryAt > 0 && dryAt < writeAt && dryAt < sendAt)
  assert.match(edge, /searchParams\.get\('dry_run'\) === '1'/)
  assert.match(edge, /gmailCredentialsPresent\(\)/)
  assert.match(planner, /x-intros-schedule-secret/)
  assert.equal(
    planner.includes("export const INTROS_SCHEDULE_HEADER = 'x-intros-schedule-secret'"),
    true,
  )
  assert.match(edge, /headers\.get\(INTROS_SCHEDULE_HEADER\)/)
  assert.match(edge, /Deno\.env\.get\(INTROS_SCHEDULE_SECRET\)/)
  assert.match(config, /\[functions\.suggest-intros\]\nverify_jwt = false/)
  assert.equal(scheduleAuthorized('', 'secret'), false)
  assert.equal(scheduleAuthorized('secret', 'secret'), true)
  assert.equal(scheduleAuthorized('secret', 'other'), false)

  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)
  assert.equal(edge.includes('\u2014'), false)
  assert.equal(/[A-Z0-9._%+-]+@(?!example\.com\b)[A-Z0-9.-]+\.[A-Z]{2,}/i.test(migration + edge + planner), false)
  assert.equal(/eyJ|sk_live|BEGIN PRIVATE KEY|SUPABASE_SERVICE_ROLE_KEY\s*=/.test(migration + edge), false)

  assert.equal(
    presentIntroSuggestion({
      id: '11111111-1111-4111-8111-111111111111',
      suggested_id: '22222222-2222-4222-8222-222222222222',
      full_name: 'Layla',
      reason: 'Both work on energy transition in Riyadh.',
      email: 'layla@example.com',
    }),
    null,
  )
  const row = presentIntroSuggestions([
    {
      id: '11111111-1111-4111-8111-111111111111',
      suggested_id: '22222222-2222-4222-8222-222222222222',
      full_name: 'Layla Al-Diriyah',
      headline: 'Director',
      company: 'Diriyah Works',
      location: 'Riyadh',
      reason: 'Both work on energy transition in Riyadh.',
    },
  ])
  assert.equal(row.length, 1)
  const meet = presentIntroRow({
    id: '33333333-3333-4333-8333-333333333333',
    kind: 'member',
    direction: 'incoming',
    status: 'accepted',
    title: 'Layla Al-Diriyah',
    detail: 'Director',
    reason: 'A board question.',
    is_demo: false,
    subject_id: '22222222-2222-4222-8222-222222222222',
    created_at: '2026-09-01T12:00:00.000Z',
    meet_due: true,
    meet_outcome: 'not_yet',
  })
  assert.equal(meet?.meet_due, true)
  assert.equal(meet?.meet_outcome, 'not_yet')
})

test('home and intros show the suggestion and the meet prompt', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const suggestions = await vite.ssrLoadModule('/src/pages/dashboard/IntroSuggestions.tsx')
    const board = await vite.ssrLoadModule('/src/pages/dashboard/IntroBoard.tsx')
    const suggestionHtml = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(suggestions.IntroSuggestions, {
          rows: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              suggested_id: '22222222-2222-4222-8222-222222222222',
              full_name: 'Layla Al-Diriyah',
              headline: 'Director',
              company: 'Diriyah Works',
              location: 'Riyadh',
              reason: 'Both work on energy transition in Riyadh.',
              avatar_path: null,
            },
          ],
          quota: { used: 2, base: 5, allowance: 5, remaining: 3 },
          introStatus: () => null,
          busyId: null,
          errorId: null,
          error: '',
          showEmpty: true,
          onRequest: () => {},
        }),
      ),
    )
    assert.match(suggestionHtml, /Suggested introductions/)
    assert.match(suggestionHtml, /Both work on energy transition in Riyadh\./)
    assert.match(suggestionHtml, /Request intro/)
    assert.equal(suggestionHtml.includes('\u2014'), false)

    const meetHtml = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(board.IntroBoard, {
          tone: 'member',
          rows: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              kind: 'member',
              direction: 'incoming',
              status: 'accepted',
              title: 'Layla Al-Diriyah',
              detail: 'Director · Riyadh',
              reason: 'A board question.',
              is_demo: false,
              subject_id: '22222222-2222-4222-8222-222222222222',
              created_at: '2026-09-01T12:00:00.000Z',
              meet_due: true,
            },
          ],
          busyId: null,
          error: '',
          onMeet: () => {},
        }),
      ),
    )
    assert.match(meetHtml, /Did you meet\?/)
    assert.match(meetHtml, /Yes/)
    assert.match(meetHtml, /Not yet/)
    assert.match(meetHtml, />No</)
  } finally {
    await vite.close()
  }
})

function runner(
  plan: ReturnType<typeof planIntroWeek>,
  dryRun: boolean,
  mailReady: boolean,
  writes: string[],
  sends: string[],
  claimPending: (introId: string) => Promise<boolean>,
) {
  return {
    dryRun,
    mailReady,
    plan,
    pendingMail: pendingIntroNudgeMail('https://boardarabia.com'),
    meetMail: meetIntroNudgeMail('https://boardarabia.com'),
    writeSuggestions: async (rows: readonly { memberId: string }[]) => {
      writes.push(...rows.map((row) => row.memberId))
    },
    claimPending,
    releasePending: async () => {},
    claimMeet: async () => true,
    releaseMeet: async () => {},
    send: async (nudge: PlannedNudge) => {
      sends.push(nudge.introId)
      return 'sent' as const
    },
  }
}

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import {
  WEEKLY_INTRO_SUGGESTION_CAP as PLANNER_CAP,
  nextWeeklyIntroSuggestions,
  planIntroWeek,
  previousIsoWeek,
  runSuggestIntros,
  type PlanIntro,
  type PlanMember,
  type PlannedNudge,
  type PriorSuggestion,
} from '../supabase/functions/_shared/suggest_intros.ts'
import { WEEKLY_INTRO_SUGGESTION_CAP as UI_CAP, WEEKLY_INTRO_SUGGESTION_LINE } from '../src/lib/introSuggestions.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationName = '20261201120000_intro_suggestions_directory_hidden.sql'
const NOW = new Date('2026-09-30T12:00:00.000Z')

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

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
    directoryHidden: false,
    ...patch,
  }
}

function intro(patch: Partial<PlanIntro> & Pick<PlanIntro, 'id' | 'requesterId' | 'targetId'>): PlanIntro {
  return {
    status: 'pending',
    requestedAt: NOW.toISOString(),
    decidedAt: null,
    pendingNudgeSent: false,
    meetRequesterSent: false,
    meetTargetSent: false,
    ...patch,
  }
}

function prior(memberId: string, suggestedId: string, rank: number, reason = 'Both work on energy transition in Riyadh.'): PriorSuggestion {
  return { memberId, suggestedId, rank, reason }
}

function weekInput(members: PlanMember[], extra: Partial<Parameters<typeof planIntroWeek>[0]> = {}) {
  return planIntroWeek({
    now: NOW,
    members,
    intros: [],
    priorSuggestions: [],
    membersWithCurrentWeek: [],
    ...extra,
  })
}

const pool = [
  member('amina'),
  member('layla'),
  member('noura', { region: 'Jeddah', visionThemes: [] }),
  member('hana', { sectorTags: ['Health'], visionThemes: [], region: 'Riyadh' }),
  member('lina', { sectorTags: [], visionThemes: ['Renewable energy'], region: 'Jeddah' }),
]

test('weekly suggestion cap is one constant and the planner never emits a third row', () => {
  assert.equal(PLANNER_CAP, UI_CAP)
  assert.equal(PLANNER_CAP, 2)
  assert.equal(WEEKLY_INTRO_SUGGESTION_LINE, `Up to ${PLANNER_CAP} suggestions each week.`)
  assert.match(WEEKLY_INTRO_SUGGESTION_LINE, /suggestions/)
  assert.equal(/request/i.test(WEEKLY_INTRO_SUGGESTION_LINE), false)

  const planner = read('supabase/functions/_shared/suggest_intros.ts')
  const ui = read('src/lib/introSuggestions.ts')
  assert.equal(planner.includes('SUGGESTIONS_PER_MEMBER'), false)
  assert.equal(planner.match(/WEEKLY_INTRO_SUGGESTION_CAP = 2/g)?.length, 1)
  assert.equal(ui.match(/WEEKLY_INTRO_SUGGESTION_CAP = 2/g)?.length, 1)
  assert.equal(planner.includes('slice(0, 2)'), false)
  assert.equal(planner.includes('slice(0, 3)'), false)
  assert.match(planner, /Admin will own this later via settings/)

  const plan = weekInput(pool)
  const picks = plan.suggestions.filter((row) => row.memberId === 'amina')
  assert.equal(picks.length, PLANNER_CAP)
  assert.deepEqual(picks.map((row) => row.rank), [1, 2])
  assert.equal(picks.some((row) => row.suggestedId === 'hana'), false)
  assert.equal(plan.suggestions.some((row) => row.rank > PLANNER_CAP), false)
  for (const row of plan.suggestions) assert.equal(row.reason.includes('@'), false)
})

test('refill restores to the cap and never above when one suggestion is carried', () => {
  const plan = weekInput(pool, {
    priorSuggestions: [prior('amina', 'hana', 2, 'Both are in Riyadh.')],
  })
  const picks = plan.suggestions.filter((row) => row.memberId === 'amina')
  assert.equal(picks.length, PLANNER_CAP)
  assert.equal(plan.carried, 1)
  assert.deepEqual(
    picks.map((row) => row.suggestedId),
    ['hana', 'layla'],
  )
  assert.equal(picks[0]?.reason, 'Both are in Riyadh.')
  assert.equal(picks[0]?.rank, 1)
  assert.equal(picks[0]?.isoWeek, 40)
  assert.equal(picks[1]?.rank, 2)

  const full = weekInput(pool, {
    priorSuggestions: [prior('amina', 'layla', 1), prior('amina', 'noura', 2, 'Both work on energy transition.')],
  })
  const held = full.suggestions.filter((row) => row.memberId === 'amina')
  assert.equal(held.length, PLANNER_CAP)
  assert.deepEqual(
    held.map((row) => row.suggestedId),
    ['layla', 'noura'],
  )
  assert.equal(full.added >= 1, true)
  const aminaAdded = held.filter((row) => row.reason !== 'Both work on energy transition in Riyadh.' && row.suggestedId !== 'noura')
  assert.equal(aminaAdded.length, 0)
})

test('zero carried suggestions gives a full set of new rows', () => {
  const refill = nextWeeklyIntroSuggestions({
    member: pool[0],
    members: pool,
    prior: [],
    alreadyThisWeek: false,
    blocked: new Set(),
    week: { year: 2026, week: 40 },
  })
  assert.equal(refill.carried, 0)
  assert.equal(refill.added, PLANNER_CAP)
  assert.equal(refill.rows.length, PLANNER_CAP)
  assert.deepEqual(
    refill.rows.map((row) => row.suggestedId),
    ['layla', 'noura'],
  )
})

test('carried suggestions that became requested, blocked, demo, sample, or hidden are dropped', () => {
  const members = [
    ...pool,
    member('demo', { isDemo: true, fullName: 'Demo Person' }),
    member('sample', { sample: true, fullName: 'Sample Person' }),
    member('hidden', { directoryHidden: true, fullName: 'Hidden Person' }),
    member('paused', { status: 'suspended' }),
  ]
  const intros = [
    intro({ id: 'asked', requesterId: 'layla', targetId: 'amina', status: 'pending' }),
    intro({ id: 'declined', requesterId: 'amina', targetId: 'noura', status: 'declined' }),
  ]
  const plan = weekInput(members, {
    intros,
    priorSuggestions: [
      prior('amina', 'layla', 1),
      prior('amina', 'noura', 2, 'Both work on energy transition.'),
      prior('amina', 'demo', 3, 'Both are in Riyadh.'),
      prior('amina', 'sample', 4, 'Both are in Riyadh.'),
      prior('amina', 'hidden', 5, 'Both are in Riyadh.'),
      prior('amina', 'paused', 6, 'Both are in Riyadh.'),
    ],
  })
  const picks = plan.suggestions.filter((row) => row.memberId === 'amina')
  assert.equal(picks.length, PLANNER_CAP)
  for (const dropped of ['layla', 'noura', 'demo', 'sample', 'hidden', 'paused']) {
    assert.equal(picks.some((row) => row.suggestedId === dropped), false, dropped)
  }
  assert.equal(plan.suggestions.some((row) => row.suggestedId === 'hidden'), false)
  assert.equal(plan.suggestions.some((row) => row.reason.includes('@')), false)
})

test('a member admitted mid-week gets a set while members who already have rows are untouched', () => {
  const late = member('late')
  const members = [...pool, late]
  const plan = weekInput(members, { membersWithCurrentWeek: pool.map((row) => row.id) })
  const owners = new Set(plan.suggestions.map((row) => row.memberId))
  assert.deepEqual([...owners], ['late'])
  assert.equal(plan.suggestions.filter((row) => row.memberId === 'late').length, PLANNER_CAP)
  assert.equal(plan.carried, 0)
  assert.equal(plan.added, PLANNER_CAP)
  for (const existing of pool) {
    assert.equal(plan.suggestions.some((row) => row.memberId === existing.id), false, existing.id)
  }
})

test('a second run in the same week writes nothing', async () => {
  const members = [member('amina'), member('layla'), member('noura', { region: 'Jeddah', visionThemes: [] })]
  const first = weekInput(members)
  assert.equal(first.membersRefilled, 3)
  const writes: string[] = []
  const sent = await runSuggestIntros(runner(first, false, writes))
  assert.equal(sent.wrote, true)
  assert.equal(sent.dry_run, false)
  assert.ok(writes.length > 0)

  const second = weekInput(members, { membersWithCurrentWeek: members.map((row) => row.id) })
  assert.deepEqual(second.suggestions, [])
  assert.equal(second.membersRefilled, 0)
  const again = await runSuggestIntros(runner(second, false, writes))
  assert.equal(again.wrote, false)
  assert.equal(writes.length, sent.suggestions.length)
})

test('a hidden member never appears as a suggestion', () => {
  const hidden = member('hidden', { directoryHidden: true })
  const plan = weekInput([...pool, hidden])
  assert.equal(plan.suggestions.some((row) => row.suggestedId === 'hidden'), false)
  const received = plan.suggestions.filter((row) => row.memberId === 'hidden')
  assert.equal(received.length, PLANNER_CAP)
  assert.equal(received.some((row) => row.suggestedId === 'hidden'), false)
})

test('dry_run=1 writes no rows and a plain run writes the week rows', async () => {
  const planner = read('supabase/functions/_shared/suggest_intros.ts')
  const edge = read('supabase/functions/suggest-intros/index.ts')
  const dryAt = planner.indexOf('if (input.dryRun) return report')
  const writeAt = planner.indexOf('await input.writeSuggestions')
  const sendAt = planner.indexOf('await input.send')
  assert.ok(dryAt > 0 && dryAt < writeAt && dryAt < sendAt)
  assert.match(edge, /searchParams\.get\('dry_run'\) === '1'/)
  assert.match(edge, /directory_hidden/)
  assert.match(edge, /previousIsoWeek/)
  assert.equal(edge.includes('weekAlreadyHasSuggestions'), false)
  assert.equal(edge.includes('weekCount'), false)
  assert.equal(new URL('https://example.com/suggest-intros').searchParams.get('dry_run') === '1', false)
  assert.equal(new URL('https://example.com/suggest-intros?dry_run=1').searchParams.get('dry_run') === '1', true)

  const plan = weekInput([member('amina'), member('layla'), member('noura', { region: 'Jeddah', visionThemes: [] })])
  assert.ok(plan.suggestions.length > 0)
  const dryWrites: string[] = []
  const dry = await runSuggestIntros({
    ...runner(plan, true, dryWrites),
    writeSuggestions: async () => {
      dryWrites.push('wrote')
      throw new Error('dry_run wrote a row')
    },
  })
  assert.equal(dry.dry_run, true)
  assert.equal(dry.wrote, false)
  assert.equal(dry.sent, 0)
  assert.deepEqual(dryWrites, [])
  assert.equal(dry.members_refilled, plan.membersRefilled)
  assert.equal(dry.carried, plan.carried)
  assert.equal(dry.new, plan.added)
  assert.equal(JSON.stringify({ members_refilled: dry.members_refilled, carried: dry.carried, new: dry.new }).includes('@'), false)

  const liveWrites: string[] = []
  const live = await runSuggestIntros(runner(plan, false, liveWrites))
  assert.equal(live.dry_run, false)
  assert.equal(live.wrote, true)
  assert.equal(liveWrites.length, plan.suggestions.length)
})

test('suggestion reasons never contain @', () => {
  const tagged = member('tagged', { sectorTags: ['mail@example.com'], visionThemes: [], region: '' })
  const plan = weekInput([member('amina', { sectorTags: ['mail@example.com'], visionThemes: [], region: '' }), tagged])
  assert.equal(plan.suggestions.some((row) => row.memberId === 'amina' && row.suggestedId === 'tagged'), false)
  const migration = read(`supabase/migrations/${migrationName}`)
  assert.match(migration, /position\('@' in reason\) = 0|intro_suggestions_reason_private|suggested\.directory_hidden = false/)
  assert.match(read('supabase/migrations/20261119120000_intros_b_suggestions_nudges.sql'), /position\('@' in reason\) = 0/)
})

test('list_my_intro_suggestions migration hides directory members and keeps grants', () => {
  const names = readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql')).sort()
  assert.ok(names.includes(migrationName))
  assert.ok(names.indexOf(migrationName) > names.indexOf('20261130120000_definer_audit.sql'))
  assert.ok(names.indexOf('20261202120000_majlis_rsvp_calendar.sql') > names.indexOf(migrationName))
  const migration = read(`supabase/migrations/${migrationName}`)
  const original = read('supabase/migrations/20261119120000_intros_b_suggestions_nudges.sql')
  assert.match(migration, /suggested\.directory_hidden = false/)
  assert.match(migration, /s\.iso_year = extract\(isoyear from timezone\('UTC', now\(\)\)\)::integer/)
  assert.match(migration, /s\.iso_week = extract\(week from timezone\('UTC', now\(\)\)\)::integer/)
  assert.match(migration, /revoke all on function public\.list_my_intro_suggestions\(\) from public, anon/)
  assert.match(migration, /grant execute on function public\.list_my_intro_suggestions\(\) to authenticated/)
  assert.equal(/to anon/.test(migration), false)
  assert.equal(/grant execute on function public\.list_my_intro_suggestions\(\) to anon/.test(migration), false)
  assert.match(original, /constraint intro_suggestions_rank check \(rank between 1 and 3\)/)
  assert.equal(migration.includes('create table'), false)
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)
  assert.equal(migration.includes('the desk'), false)
  assert.equal(/nammco/i.test(migration), false)
  assert.equal(previousIsoWeek(new Date('2026-01-01T00:00:00.000Z')).year, 2025)
  const bundled = read('supabase/functions/_shared/suggest_intros.ts') + read('supabase/functions/suggest-intros/index.ts') + read('src/pages/dashboard/IntroSuggestions.tsx')
  assert.equal(bundled.includes('\u2014'), false)
  assert.equal(bundled.includes('\u2013'), false)
  assert.equal(bundled.includes('the desk'), false)
})

test('the empty Intros page has exactly one Directory link', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const suggestions = await vite.ssrLoadModule('/src/pages/dashboard/IntroSuggestions.tsx')
    const board = await vite.ssrLoadModule('/src/pages/dashboard/IntroBoard.tsx')
    const emptySuggestions = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(suggestions.IntroSuggestions, {
          rows: [],
          quota: null,
          introStatus: () => null,
          busyId: null,
          errorId: null,
          error: '',
          showEmpty: true,
          onRequest: () => {},
        }),
      ),
    )
    assert.match(emptySuggestions, /No suggested introductions this week\./)
    assert.match(emptySuggestions, /Up to 2 suggestions each week\./)
    assert.equal(directoryLinks(emptySuggestions), 0)

    const page = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(
          'div',
          null,
          createElement(suggestions.IntroSuggestions, {
            rows: [],
            quota: { used: 0, base: 5, allowance: 5, remaining: 5 },
            introStatus: () => null,
            busyId: null,
            errorId: null,
            error: '',
            showEmpty: true,
            onRequest: () => {},
          }),
          createElement(board.IntroBoard, {
            tone: 'member',
            rows: [],
            busyId: null,
            error: '',
          }),
        ),
      ),
    )
    assert.match(page, /No intro requests yet\./)
    assert.equal(directoryLinks(page), 1)
    assert.equal((page.match(/\/dashboard\/people\/directory/g) || []).length, 1)
  } finally {
    await vite.close()
  }
})

test('anon cannot execute list_my_intro_suggestions and a hidden member is omitted', { timeout: 180_000 }, () => {
  const migrationsDir = path.join(root, 'supabase/migrations')
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-weekly-intros-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_weekly_intros_${process.pid}`
  writeFileSync(script, [stubSql, ...names.map(include), include(migrationName), assertSql].join('\n'))
  try {
    execFileSync('dropdb', ['--if-exists', db], { stdio: 'ignore' })
    execFileSync('createdb', [db], { stdio: 'ignore' })
    try {
      execFileSync('psql', ['-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-f', script], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      const failed = error as { stdout?: Buffer; stderr?: Buffer }
      throw new Error(`${failed.stdout?.toString() ?? ''}\n${failed.stderr?.toString() ?? ''}`)
    }
  } finally {
    execFileSync('dropdb', ['--if-exists', db], { stdio: 'ignore' })
    rmSync(dir, { recursive: true, force: true })
  }
})

function directoryLinks(html: string) {
  return [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)]
    .map((match) => match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
    .filter((text) => text === 'Directory').length
}

function runner(plan: ReturnType<typeof planIntroWeek>, dryRun: boolean, writes: string[]) {
  return {
    dryRun,
    mailReady: false,
    plan,
    pendingMail: { subject: 'Waiting', text: 'Open Intros', html: '<p>Open Intros</p>' },
    meetMail: { subject: 'Did you meet?', text: 'Open Intros', html: '<p>Open Intros</p>' },
    writeSuggestions: async (rows: readonly { memberId: string }[]) => {
      writes.push(...rows.map((row) => row.memberId))
    },
    claimPending: async () => false,
    releasePending: async () => {},
    claimMeet: async () => false,
    releaseMeet: async () => {},
    send: async (_nudge: PlannedNudge) => 'skipped' as const,
  }
}

const stubSql = `
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end
$roles$;
alter role service_role bypassrls;
grant anon, authenticated, service_role to current_user;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists private;
grant usage on schema public, auth, storage, private, extensions to anon, authenticated, service_role;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''),
    current_user
  )
$$;

create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb
);

create table storage.buckets (
  id text primary key,
  name text,
  public boolean,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text
);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  full_name text,
  email text,
  phone text,
  turnover text,
  fo_aum text,
  companies text,
  job_titles text,
  linkedin_url text,
  calendar_slot text,
  status text,
  notes text
);
alter table public.applications enable row level security;

create table public.staff_users (
  user_id uuid primary key,
  email text not null,
  created_at timestamptz not null default now()
);
alter table public.staff_users enable row level security;

alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema private grant execute on functions to anon, authenticated, service_role;
`

const assertSql = `
do $checks$
declare
  viewer uuid := gen_random_uuid();
  visible uuid := gen_random_uuid();
  hidden uuid := gen_random_uuid();
  earlier uuid := gen_random_uuid();
  other uuid := gen_random_uuid();
  v_year int;
  v_week int;
  rows jsonb;
  rank_def text;
begin
  select extract(isoyear from timezone('UTC', now()))::int, extract(week from timezone('UTC', now()))::int
    into v_year, v_week;

  insert into auth.users (id, email) values
    (viewer, 'viewer.weekly@example.com'),
    (visible, 'visible.weekly@example.com'),
    (hidden, 'hidden.weekly@example.com'),
    (earlier, 'earlier.weekly@example.com'),
    (other, 'other.weekly@example.com');
  insert into public.members (user_id, email, seat, status, directory_hidden) values
    (viewer, 'viewer.weekly@example.com', 'ksa', 'active', false),
    (visible, 'visible.weekly@example.com', 'ksa', 'active', false),
    (hidden, 'hidden.weekly@example.com', 'ksa', 'active', true),
    (earlier, 'earlier.weekly@example.com', 'ksa', 'active', false),
    (other, 'other.weekly@example.com', 'ksa', 'active', false);
  insert into public.profiles (user_id, full_name) values
    (viewer, 'Viewer Member'),
    (visible, 'Visible Member'),
    (hidden, 'Hidden Member'),
    (earlier, 'Earlier Member'),
    (other, 'Other Member');

  insert into public.intro_suggestions (member_id, suggested_id, iso_year, iso_week, rank, reason) values
    (viewer, visible, v_year, v_week, 1, 'Both work on energy transition in Riyadh.'),
    (viewer, hidden, v_year, v_week, 2, 'Both are in Riyadh.'),
    (viewer, earlier, 2020, 1, 1, 'Both are in Riyadh.'),
    (other, visible, v_year, v_week, 1, 'Both are in Riyadh.');

  insert into public.intro_suggestions (member_id, suggested_id, iso_year, iso_week, rank, reason)
  values (viewer, other, 2020, 2, 3, 'Both are in Riyadh.');
  delete from public.intro_suggestions
  where member_id = viewer and suggested_id = other and iso_year = 2020 and iso_week = 2;

  begin
    insert into public.intro_suggestions (member_id, suggested_id, iso_year, iso_week, rank, reason)
    values (viewer, other, 2020, 3, 4, 'Both are in Riyadh.');
    raise exception 'rank above 3 was stored';
  exception
    when check_violation then
      null;
  end;

  begin
    insert into public.intro_suggestions (member_id, suggested_id, iso_year, iso_week, rank, reason)
    values (viewer, other, 2020, 4, 1, 'note with an @ sign');
    raise exception 'reason with @ was stored';
  exception
    when check_violation then
      null;
  end;

  select pg_get_constraintdef(oid) into rank_def
  from pg_constraint
  where conname = 'intro_suggestions_rank';
  if rank_def not like '%1%' or rank_def not like '%3%' then
    raise exception 'rank check changed: %', rank_def;
  end if;

  if has_function_privilege('anon', 'public.list_my_intro_suggestions()', 'execute') then
    raise exception 'anon can execute list_my_intro_suggestions';
  end if;
  if not has_function_privilege('authenticated', 'public.list_my_intro_suggestions()', 'execute') then
    raise exception 'authenticated cannot execute list_my_intro_suggestions';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', viewer, 'role', 'authenticated')::text, false);
  set role authenticated;
  rows := public.list_my_intro_suggestions();
  if jsonb_array_length(rows) is distinct from 1 then
    raise exception 'expected one suggestion, got %', rows;
  end if;
  if rows->0->>'full_name' is distinct from 'Visible Member' then
    raise exception 'wrong suggestion %', rows;
  end if;
  if rows::text ilike '%Hidden%' or rows::text ilike '%Earlier%' or rows::text ilike '%Other Member%' then
    raise exception 'filtered suggestion leaked %', rows;
  end if;
  if position('@' in rows::text) <> 0 then
    raise exception 'suggestion payload contains @';
  end if;
  set role postgres;

  set role anon;
  begin
    perform public.list_my_intro_suggestions();
    raise exception 'anon executed list_my_intro_suggestions';
  exception
    when insufficient_privilege then
      if sqlerrm ilike '%not_allowed%' then
        raise exception 'anon reached the function body';
      end if;
      if sqlerrm not ilike '%permission denied%' then
        raise exception 'anon error: %', sqlerrm;
      end if;
  end;
  set role postgres;
end
$checks$;
`

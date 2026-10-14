import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'
import { emptyMemberSeatDraft, memberSeatProblem, presentShortlist } from '../src/lib/memberBoardSeats.ts'
import { MEMBER_VIEWS } from '../src/shell/viewCopy.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261227120000_board_seats_member.sql'
const earlierName = '20261226120000_home_partner_examples.sql'
const sm1Name = '20261224120000_board_seats_notifications.sql'
const migrationPath = path.join(migrationsDir, migrationName)
const sm1Path = path.join(migrationsDir, sm1Name)
const migration = readFileSync(migrationPath, 'utf8')

const STAFF = '11111111-1111-4111-8111-111111111111'
const POSTER = '22222222-2222-4222-8222-222222222222'
const PARTNER = '33333333-3333-4333-8333-333333333333'
const APPLICANT = '44444444-4444-4444-8444-444444444444'
const OPTED = '55555555-5555-4555-8555-555555555555'
const HIDDEN_IN = '66666666-6666-4666-8666-666666666666'
const HIDDEN_OUT = '77777777-7777-4777-8777-777777777777'
const STRANGER = '88888888-8888-4888-8888-888888888888'

function source(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function slice(start: string, end: string) {
  const from = migration.indexOf(start)
  const to = migration.indexOf(end, from + start.length)
  assert.ok(from >= 0, start)
  assert.ok(to > from, end)
  return migration.slice(from, to)
}

test('the member seat migration sorts after the named earlier file', () => {
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()
  assert.ok(files.includes(migrationName))
  assert.ok(files.includes(earlierName))
  assert.ok(files.includes(sm1Name))
  assert.ok(migrationName > earlierName)
  assert.ok(migrationName > sm1Name)
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)
  assert.equal(/\bcron\b|pg_cron|net\.http|send_email/i.test(migration), false)
  assert.equal(/\b(price|fee|usd|sar)\b/i.test(migration), false)
  assert.equal(/\bto anon\b/i.test(migration), false)
  assert.equal(/grant\s+(all|execute)\s+on\s+[^;]*\bto\s+public\b/i.test(migration), false)
  const emails = migration.match(/[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []
  assert.deepEqual(emails, [])
  assert.match(migration, /re_board_roles_posted_by_member_id_idx/)
  assert.match(migration, /on public\.re_board_roles \(posted_by_member_id\)/)
  const headers = migration.split(/create or replace function /i).slice(1)
  assert.ok(headers.length >= 8)
  for (const header of headers) {
    assert.match(header.slice(0, header.indexOf('as $$')), /set search_path = ''/)
  }
  const shortlist = slice(
    'function public.list_my_board_seat_shortlist',
    'revoke all on function public.list_my_board_seat_shortlist',
  )
  assert.match(shortlist, /private\.caller_sees_member_card/)
  assert.match(shortlist, /private\.is_sponsor/)
  assert.match(shortlist, /posted_by_member_id = auth\.uid\(\)/)
  assert.equal(shortlist.includes('contact_email'), false)
  assert.equal(shortlist.includes('turnover'), false)
  assert.equal(shortlist.includes('.email'), false)
  assert.equal(shortlist.includes('.phone'), false)
  assert.equal(shortlist.includes('is_staff()'), false)
  const opener = slice(
    'function public.open_board_seat_introduction',
    'revoke all on function public.open_board_seat_introduction',
  )
  assert.match(opener, /'accepted'/)
  assert.match(opener, /'poster'/)
  assert.equal(opener.includes('contact_email'), false)
  assert.equal(opener.includes('.email'), false)
  const submit = slice(
    'function public.submit_member_board_seat',
    'revoke all on function public.submit_member_board_seat',
  )
  assert.match(submit, /'pending_review'/)
  assert.match(submit, /posted_by_member_id/)
  assert.match(submit, /auth\.uid\(\)/)
})

test('member seat copy keeps contacts off the shortlist card', () => {
  const draft = {
    ...emptyMemberSeatDraft(),
    title: 'Independent director',
    sector: 'Health',
    capacity: 'Four meetings a year.',
    sectorTags: ['Health'],
    regions: ['Riyadh'],
    organisationName: 'North Court',
    terms: 'Independent seat.',
    narrative: 'A fictional seat.',
  }
  assert.equal(memberSeatProblem(draft), '')
  assert.match(memberSeatProblem({ ...draft, sectorTags: [], regions: [] }), /sector or region/)
  assert.match(memberSeatProblem({ ...draft, title: 'Write name@example.com' }), /email/)
  const people = presentShortlist([
    {
      id: 'c3000001-0000-4000-8000-0000000000cc',
      member_name: 'Example Applicant',
      headline: 'Board director',
      company: 'Example Holdings',
      note: 'Happy to be considered.',
      status: 'pending',
      contact_email: 'hidden.person@example.com',
      phone: '555-0100',
    },
    {
      id: 'drop',
      member_name: 'Mail Person',
      headline: 'hidden.person@example.com',
      company: 'Example Holdings',
      note: 'Hello',
      status: 'pending',
    },
  ])
  assert.equal(people.length, 1)
  assert.equal(JSON.stringify(people).includes('@'), false)
  assert.equal(JSON.stringify(people).includes('555'), false)
  assert.equal(people[0]?.memberName, 'Example Applicant')
  const copy = JSON.stringify(MEMBER_VIEWS.boardSeats)
  assert.equal(copy.includes('\u2014'), false)
  assert.equal(/\bsponsor/i.test(copy), false)
  assert.equal(/\bthe desk\b/i.test(copy), false)
  assert.equal(/\b(price|fee)\b/i.test(copy), false)
  for (const rel of [
    'src/pages/dashboard/MemberBoardSeatsView.tsx',
    'src/pages/dashboard/BoardSeatsPage.tsx',
    'src/lib/memberBoardSeats.ts',
    'src/lib/memberBoardSeatApi.ts',
  ]) {
    const text = source(rel)
    assert.equal(text.includes('\u2014'), false, rel)
    assert.equal(text.includes('\u2013'), false, rel)
    assert.equal(/\bthe desk\b/i.test(text), false, rel)
    assert.equal(/\bsponsor/i.test(text), false, rel)
    assert.equal(/\b(price|fee)\b/i.test(text), false, rel)
  }
  assert.equal(source('src/App.tsx').includes('path="board-seats"'), true)
  assert.equal(source('src/pages/dashboard/MemberBoardSeatsView.tsx').includes('type="email"'), false)
})

test('board seat list, disclosure, and shortlist render', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const view = await vite.ssrLoadModule('/src/pages/dashboard/MemberBoardSeatsView.tsx')
    const seat = {
      id: 'b3000001-0000-4000-8000-0000000000aa',
      seatKind: 'ned' as const,
      status: 'published' as const,
      title: 'Independent director',
      sector: 'Health',
      capacity: 'Four meetings a year.',
      sectorTags: ['Health'],
      regions: ['Riyadh'],
      organisationName: 'North Court',
      terms: 'Independent seat.',
      narrative: 'A fictional seat.',
      isDemo: false,
      posterIsPartner: true,
      mine: false,
      applicationStatus: null,
      showCardToPartners: false,
    }
    const list = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(view.MemberBoardSeatList, {
          status: 'ready',
          seats: [seat],
          applications: [],
          posted: [
            {
              id: seat.id,
              title: 'Audit chair',
              organisationName: 'Example Holdings',
              seatKind: 'company_board',
              status: 'pending_review',
              sector: 'Health',
              capacity: 'Four meetings a year.',
              applicantCount: 0,
            },
          ],
          onRetry: () => {},
        }),
      ),
    )
    assert.match(list, /Board seats/)
    assert.match(list, /Real estate board roles/)
    assert.match(list, /href="\/dashboard\/deals\/real-estate\?view=roles"/)
    assert.match(list, /Waiting for approval/)
    assert.match(list, /Post a seat/)
    assert.equal(list.includes('@'), false)
    const detail = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(view.MemberBoardSeatDetail, {
          status: 'ready',
          seat,
          shortlist: null,
          note: '',
          message: '',
          notice: '',
          busy: false,
          onNote: () => {},
          onApply: () => {},
          onOpen: () => {},
          onRetry: () => {},
        }),
      ),
    )
    assert.match(detail, /data-board-seat-disclosure/)
    assert.match(detail, /They will not see your email or phone/)
    assert.match(detail, /posted by a partner/)
    assert.match(detail, /Show my card to partners is off/)
    assert.match(detail, /Put yourself forward/)
    assert.equal(/\bsponsor/i.test(detail), false)
    const posterSeat = { ...seat, posterIsPartner: false, mine: true, showCardToPartners: false }
    const shortlist = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(view.MemberBoardSeatDetail, {
          status: 'ready',
          seat: posterSeat,
          shortlist: [
            {
              id: 'c3000001-0000-4000-8000-0000000000cc',
              memberName: 'Example Applicant',
              headline: 'Board director',
              company: 'Example Holdings',
              note: 'Happy to be considered.',
              status: 'pending',
            },
          ],
          note: '',
          message: '',
          notice: '',
          busy: false,
          onNote: () => {},
          onApply: () => {},
          onOpen: () => {},
          onRetry: () => {},
        }),
      ),
    )
    assert.match(shortlist, /data-board-seat-shortlist/)
    assert.match(shortlist, /Open introduction/)
    assert.match(shortlist, /Example Applicant/)
    assert.equal(shortlist.includes('@'), false)
    assert.equal(shortlist.includes('555'), false)
  } finally {
    await vite.close()
  }
})

const fixtureSql = `
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
exception
  when unique_violation then
    null;
end
$roles$;

create schema if not exists auth;
create schema if not exists private;
grant usage on schema public, private, auth to anon, authenticated, service_role;

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
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
$$;

grant execute on function auth.uid() to public;
grant execute on function auth.jwt() to public;
grant execute on function auth.role() to public;

create table public.members (
  user_id uuid primary key,
  seat text,
  status text,
  is_demo boolean not null default false,
  show_card_to_sponsors boolean not null default false,
  directory_hidden boolean not null default false,
  email text,
  tiers text[] not null default '{}'::text[]
);

create table public.profiles (
  user_id uuid primary key,
  full_name text,
  headline text,
  company text,
  phone text
);

create table public.staff_users (
  user_id uuid primary key,
  role text not null
);

create table public.staff_access_log (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid,
  member_id uuid,
  object_type text,
  object_id uuid,
  action text
);

create table public.re_board_roles (
  id uuid primary key default gen_random_uuid(),
  is_demo boolean not null default false,
  published boolean not null default false,
  seat_kind text not null,
  title text not null,
  sector text not null,
  capacity text not null,
  city text,
  asset_class text,
  organisation_name text not null,
  terms text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  narrative text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint re_board_roles_seat_kind check (seat_kind in ('developer', 'propco')),
  constraint re_board_roles_city check (
    city is null or city in ('Riyadh', 'Makkah', 'Eastern Province')
  ),
  constraint re_board_roles_asset_class check (
    asset_class is null or asset_class in ('residential', 'hospitality')
  )
);

create table public.re_board_role_intros (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.re_board_roles (id) on delete cascade,
  member_id uuid not null references public.members (user_id) on delete cascade,
  status text not null,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  constraint re_board_role_intros_unique unique (role_id, member_id)
);

create table public.member_intros (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.members (user_id) on delete cascade,
  target_id uuid not null references public.members (user_id) on delete cascade,
  reason text not null,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  ask_desk boolean not null default false,
  desk_status text,
  constraint member_intros_status check (status in ('pending', 'accepted', 'declined')),
  constraint member_intros_distinct check (requester_id <> target_id),
  constraint member_intros_reason_len check (char_length(btrim(reason)) between 1 and 280),
  constraint member_intros_reason_private check (position('@' in reason) = 0),
  constraint member_intros_pair unique (requester_id, target_id),
  constraint member_intros_desk_pair check (
    (ask_desk = false and desk_status is null) or ask_desk = true
  )
);

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_users s
    where s.user_id = auth.uid()
      and s.role in ('staff', 'master')
  )
  and (auth.jwt() ->> 'aal') = 'aal2';
$$;

create or replace function private.is_sponsor(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members m
    where m.user_id = p_uid
      and (
        m.seat = 'sponsor'
        or 'sponsor' = any (coalesce(m.tiers, '{}'::text[]))
      )
  );
$$;

create or replace function private.caller_sees_member_card(p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and p_member is not null
    and (
      private.is_staff()
      or not private.is_sponsor(auth.uid())
      or p_member = auth.uid()
      or exists (
        select 1
        from public.members m
        where m.user_id = p_member
          and m.show_card_to_sponsors
          and coalesce(m.directory_hidden, false) = false
      )
    );
$$;

create or replace function private.sample_subject(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m where m.user_id = p_id and m.is_demo
  );
$$;

create or replace function private.log_staff_access(
  p_staff uuid,
  p_member uuid,
  p_object_type text,
  p_object_id uuid,
  p_action text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_action is distinct from 'read' then
    return;
  end if;
  insert into public.staff_access_log (staff_user_id, member_id, object_type, object_id, action)
  values (p_staff, p_member, p_object_type, p_object_id, 'read');
end;
$$;

create or replace function private.profile_sector_tags()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'Energy transition', 'Health', 'Tourism', 'Financial services', 'Logistics', 'Mining',
    'Digital infrastructure', 'Food security', 'Real estate', 'Industrials and manufacturing',
    'Technology and telecom', 'Consumer and retail', 'Construction and infrastructure',
    'Education', 'Media and entertainment', 'Utilities and water'
  ]::text[];
$$;

create or replace function public.list_accepted_intro_contacts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'intro_id', i.id,
      'email', nullif(btrim(other_member.email), ''),
      'phone', nullif(btrim(other_profile.phone), '')
    ))
    from public.member_intros i
    join public.members other_member
      on other_member.user_id = case
        when i.requester_id = auth.uid() then i.target_id
        else i.requester_id
      end
    left join public.profiles other_profile
      on other_profile.user_id = other_member.user_id
    where i.status = 'accepted'
      and (i.requester_id = auth.uid() or i.target_id = auth.uid())
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_accepted_intro_contacts() from public, anon;
grant execute on function public.list_accepted_intro_contacts() to authenticated;

insert into public.members (user_id, seat, status, is_demo, show_card_to_sponsors, directory_hidden, email) values
  ('${POSTER}', 'ksa', 'active', false, false, false, 'poster.seat@example.com'),
  ('${PARTNER}', 'sponsor', 'active', false, false, false, 'partner.seat@example.com'),
  ('${APPLICANT}', 'ksa', 'active', false, false, false, 'applicant.seat@example.com'),
  ('${OPTED}', 'intl', 'active', false, true, false, 'opted.seat@example.com'),
  ('${HIDDEN_IN}', 'ksa', 'active', false, true, true, 'hidden.in@example.com'),
  ('${HIDDEN_OUT}', 'ksa', 'active', false, true, true, 'hidden.out@example.com'),
  ('${STRANGER}', 'ksa', 'active', false, false, false, 'stranger.seat@example.com');

insert into public.staff_users (user_id, role) values ('${STAFF}', 'staff');

insert into public.profiles (user_id, full_name, headline, company, phone) values
  ('${POSTER}', 'Example Poster', 'Chair', 'North Court', null),
  ('${PARTNER}', 'Example Partner', 'Partner seat', 'Partner Court', null),
  ('${APPLICANT}', 'Example Applicant', 'Board director', 'Example Holdings', '5550100199'),
  ('${OPTED}', 'Opted Member', 'Director', 'Opted Court', null),
  ('${HIDDEN_IN}', 'Hidden Applicant', 'Director', 'Quiet Court', null),
  ('${HIDDEN_OUT}', 'Hidden Outsider', 'Director', 'Outside Court', null),
  ('${STRANGER}', 'Stranger Match', 'Director', 'Stranger Court', null);
`

const assertSql = `
create or replace function pg_temp.fail(msg text) returns void
language plpgsql as $$
begin
  raise exception '%', msg;
end;
$$;

create or replace function pg_temp.assume(p_sub uuid, p_aal text, p_role text) returns void
language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_sub, 'aal', p_aal, 'role', p_role)::text,
    false
  );
  execute format('set role %I', p_role);
end;
$$;

do $checks$
declare
  v_pending uuid;
  v_member uuid;
  v_partner uuid;
  v_payload jsonb;
  v_intro uuid;
  v_status text;
  v_email text;
  v_count int;
  v_role text;
begin
  if not exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 're_board_roles_posted_by_member_id_idx'
      and indexdef like '%posted_by_member_id%'
  ) then
    perform pg_temp.fail('posted_by index missing');
  end if;

  if has_function_privilege('anon', 'public.list_published_board_seats()', 'execute') then
    perform pg_temp.fail('anon can list');
  end if;
  if has_function_privilege('anon', 'public.submit_member_board_seat(text, text, text, text, text[], text[], text, text, text)', 'execute') then
    perform pg_temp.fail('anon can post');
  end if;
  if has_function_privilege('anon', 'public.list_my_board_seat_shortlist(uuid)', 'execute') then
    perform pg_temp.fail('anon can shortlist');
  end if;
  if has_function_privilege('anon', 'public.open_board_seat_introduction(uuid)', 'execute') then
    perform pg_temp.fail('anon can open');
  end if;

  perform pg_temp.assume('${POSTER}', 'aal1', 'authenticated');
  v_payload := public.submit_member_board_seat(
    'company_board', 'Audit chair', 'Health', 'Four meetings a year.',
    array['Health'], array['Riyadh'], 'Example Holdings', 'Independent seat.',
    'A fictional company seat.'
  );
  v_pending := (v_payload->>'id')::uuid;
  if v_payload->>'status' is distinct from 'pending_review' then
    perform pg_temp.fail('member post status');
  end if;
  v_payload := public.submit_member_board_seat(
    'ned', 'Independent director', 'Health', 'Four meetings a year.',
    array['Health'], array['Riyadh'], 'North Court', 'Independent seat.',
    'A fictional seat.'
  );
  v_member := (v_payload->>'id')::uuid;

  perform pg_temp.assume('${PARTNER}', 'aal1', 'authenticated');
  v_payload := public.submit_member_board_seat(
    'adviser', 'Advisory seat', 'Tourism', 'Two meetings a year.',
    array['Tourism'], array['Makkah'], 'Partner Court', 'Advisory terms.',
    'A fictional partner seat.'
  );
  v_partner := (v_payload->>'id')::uuid;

  execute 'reset role';
  if exists (
    select 1 from public.re_board_roles
    where id = v_pending and (contact_email is not null or contact_phone is not null or status <> 'pending_review')
  ) then
    perform pg_temp.fail('member company seat stored a contact or went live');
  end if;

  perform pg_temp.assume('${APPLICANT}', 'aal1', 'authenticated');
  v_payload := public.list_published_board_seats();
  if v_payload::text like '%' || v_pending::text || '%'
     or v_payload::text like '%' || v_member::text || '%'
     or v_payload::text like '%' || v_partner::text || '%'
  then
    perform pg_temp.fail('unpublished seat was visible');
  end if;
  begin
    perform public.get_board_seat(v_member);
    perform pg_temp.fail('applicant read a pending seat');
  exception
    when sqlstate 'P0002' then
      null;
  end;

  perform pg_temp.assume('${STAFF}', 'aal2', 'authenticated');
  perform public.staff_publish_board_seat(v_member);
  perform public.staff_publish_board_seat(v_partner);

  perform pg_temp.assume('${APPLICANT}', 'aal1', 'authenticated');
  v_payload := public.list_published_board_seats();
  if jsonb_array_length(v_payload) <> 2 then
    perform pg_temp.fail('published count');
  end if;
  if v_payload::text like '%' || v_pending::text || '%' then
    perform pg_temp.fail('pending still listed');
  end if;
  if position('@' in v_payload::text) > 0 or position('555' in v_payload::text) > 0 then
    perform pg_temp.fail('list payload has a contact');
  end if;
  if v_payload::text like '%turnover%' or v_payload::text like '%contact_email%' or v_payload::text like '%phone%' then
    perform pg_temp.fail('list payload key');
  end if;

  begin
    perform public.apply_to_board_seat(v_member, 'Write name@example.com');
    perform pg_temp.fail('note with address');
  exception
    when sqlstate '22023' then
      null;
  end;
  perform public.apply_to_board_seat(v_member, 'Happy to be considered.');
  perform public.apply_to_board_seat(v_partner, 'Happy to be considered.');

  perform pg_temp.assume('${OPTED}', 'aal1', 'authenticated');
  perform public.apply_to_board_seat(v_partner, 'Happy to be considered.');

  perform pg_temp.assume('${HIDDEN_IN}', 'aal1', 'authenticated');
  perform public.apply_to_board_seat(v_member, 'Happy to be considered.');
  perform public.apply_to_board_seat(v_partner, 'Happy to be considered.');

  perform pg_temp.assume('${POSTER}', 'aal1', 'authenticated');
  v_payload := public.list_my_board_seat_shortlist(v_member);
  if jsonb_array_length(v_payload) <> 2 then
    perform pg_temp.fail('member shortlist count');
  end if;
  if v_payload::text not like '%Example Applicant%' or v_payload::text not like '%Hidden Applicant%' then
    perform pg_temp.fail('member shortlist names');
  end if;
  if v_payload::text like '%Hidden Outsider%' or v_payload::text like '%Stranger Match%' or v_payload::text like '%Opted Member%' then
    perform pg_temp.fail('non applicant on member shortlist');
  end if;
  if position('@' in v_payload::text) > 0
     or position('5550100199' in v_payload::text) > 0
     or v_payload::text like '%contact_email%'
     or v_payload::text like '%phone%'
     or v_payload::text like '%turnover%'
  then
    perform pg_temp.fail('member shortlist contact');
  end if;

  perform pg_temp.assume('${PARTNER}', 'aal1', 'authenticated');
  v_payload := public.list_my_board_seat_shortlist(v_partner);
  if jsonb_array_length(v_payload) <> 1 or v_payload->0->>'member_name' is distinct from 'Opted Member' then
    perform pg_temp.fail('partner shortlist');
  end if;
  if v_payload::text like '%Example Applicant%'
     or v_payload::text like '%Hidden Applicant%'
     or v_payload::text like '%Hidden Outsider%'
     or v_payload::text like '%Stranger Match%'
  then
    perform pg_temp.fail('partner saw someone who is not opted in');
  end if;
  if position('@' in v_payload::text) > 0 or v_payload::text like '%phone%' or v_payload::text like '%turnover%' then
    perform pg_temp.fail('partner shortlist contact');
  end if;

  execute 'reset role';
  select i.id into v_intro
  from public.re_board_role_intros i
  where i.role_id = v_partner
    and i.member_id = '${APPLICANT}';
  perform pg_temp.assume('${PARTNER}', 'aal1', 'authenticated');
  begin
    perform public.open_board_seat_introduction(v_intro);
    perform pg_temp.fail('partner opened a hidden card');
  exception
    when sqlstate 'P0002' then
      null;
  end;

  execute 'reset role';
  select i.id into v_intro
  from public.re_board_role_intros i
  where i.role_id = v_member
    and i.member_id = '${APPLICANT}';
  perform pg_temp.assume('${POSTER}', 'aal1', 'authenticated');
  v_payload := public.open_board_seat_introduction(v_intro);
  if v_payload->>'status' is distinct from 'accepted' then
    perform pg_temp.fail('open status');
  end if;
  v_payload := public.list_accepted_intro_contacts();
  select item->>'email' into v_email
  from jsonb_array_elements(v_payload) item
  where item->>'email' = 'applicant.seat@example.com';
  if v_email is distinct from 'applicant.seat@example.com' then
    perform pg_temp.fail('poster contact exchange');
  end if;

  perform pg_temp.assume('${APPLICANT}', 'aal1', 'authenticated');
  v_payload := public.list_accepted_intro_contacts();
  select item->>'email' into v_email
  from jsonb_array_elements(v_payload) item
  where item->>'email' = 'poster.seat@example.com';
  if v_email is distinct from 'poster.seat@example.com' then
    perform pg_temp.fail('applicant contact exchange');
  end if;

  execute 'reset role';
  select i.status, i.decided_by_role into v_status, v_role
  from public.re_board_role_intros i
  where i.id = v_intro;
  if v_status is distinct from 'approved' or v_role is distinct from 'poster' then
    perform pg_temp.fail('application was not marked by the poster');
  end if;
  select count(*) into v_count
  from public.member_intros
  where status = 'accepted'
    and (
      (requester_id = '${POSTER}' and target_id = '${APPLICANT}')
      or (requester_id = '${APPLICANT}' and target_id = '${POSTER}')
    );
  if v_count <> 1 then
    perform pg_temp.fail('accepted intro row');
  end if;

  perform pg_temp.assume('${STRANGER}', 'aal1', 'authenticated');
  begin
    perform public.list_my_board_seat_shortlist(v_member);
    perform pg_temp.fail('stranger read a shortlist');
  exception
    when sqlstate 'P0002' then
      null;
  end;
end
$checks$;
`

test('member seats stay hidden until published, and the shortlist is applicants only', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-sm2-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_sm2_${process.pid}`
  writeFileSync(script, `${fixtureSql}\n\\i ${sm1Path}\n\\i ${migrationPath}\n${assertSql}\n`)
  try {
    execFileSync('dropdb', ['--if-exists', db], { stdio: 'ignore' })
    execFileSync('createdb', [db], { stdio: 'ignore' })
    try {
      execFileSync('psql', ['-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-f', script], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      const failed = error as { stdout?: Buffer; stderr?: Buffer; message?: string }
      throw new Error(`${failed.stdout?.toString() ?? ''}\n${failed.stderr?.toString() ?? ''}\n${failed.message ?? ''}`)
    }
  } finally {
    execFileSync('dropdb', ['--if-exists', db], { stdio: 'ignore' })
    rmSync(dir, { recursive: true, force: true })
  }
})

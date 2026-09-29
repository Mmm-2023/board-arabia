import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20260930120000_lock_majlis_views_and_scratch.sql'
const migrationPath = path.join(migrationsDir, migrationName)
const previousViewPath = path.join(migrationsDir, '20260926103000_majlis_rsvp.sql')

const hiddenFromSponsor = [
  'venue_address',
  'host_member_id',
  'email',
  'full_name',
  'admin_note',
  'rejection_feedback',
  'cancel_reason',
  'approved_at',
]

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function viewBody(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace view public.${name}`)
  const asAt = sql.indexOf('\nas\n', start)
  const end = sql.indexOf(`\nrevoke all on table public.${name}`, asAt)
  assert.ok(start >= 0 && asAt > start && end > asAt, `view ${name} not found`)
  return sql.slice(asAt + 4, end).replace(/;\s*$/, '').trim()
}

function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`function private.${name}`)
  const asAt = sql.indexOf('as $fn$\n', start)
  const end = sql.indexOf('\n$fn$;', asAt)
  assert.ok(start >= 0 && asAt > start && end > asAt, `function ${name} not found`)
  return sql.slice(asAt + 'as $fn$\n'.length, end).trim()
}

function latestFunction(name: string): { file: string; body: string; line: number } {
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()
  let found: { file: string; body: string; line: number } | null = null
  const header = `create or replace function public.${name}`
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8')
    const at = sql.indexOf(header)
    if (at < 0) continue
    const asAt = sql.indexOf('as $$\n', at)
    const end = sql.indexOf('\n$$;', asAt)
    assert.ok(asAt > at && end > asAt, `${name} body missing in ${file}`)
    const body = sql.slice(asAt + 'as $$\n'.length, end)
    const checkAt = body.indexOf('if not private.is_staff()')
    const prefix = sql.slice(0, asAt + 'as $$\n'.length + Math.max(checkAt, 0))
    found = {
      file,
      body,
      line: prefix.split('\n').length,
    }
  }
  assert.ok(found, `${name} is not defined`)
  return found
}

test('majlis read models keep the previous rows and columns without a definer view', () => {
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()
  assert.ok(files.includes(migrationName))
  const later = files.filter((file) => file > migrationName)
  assert.ok(later.length > 0)
  for (const file of later) {
    const text = readFileSync(path.join(migrationsDir, file), 'utf8')
    assert.equal(/create\s+(or\s+replace\s+)?(materialized\s+)?view\s+public\.majlis_/i.test(text), false, file)
    assert.equal(/_edge_boot_staging|_edge_boot_upload|_hex_scratch/.test(text), false, file)
    assert.equal(/security_invoker\s*=\s*false/.test(text), false, file)
  }

  const sql = readFileSync(migrationPath, 'utf8')
  const previous = readFileSync(previousViewPath, 'utf8')
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(/[A-Z0-9._%+-]+@(?!example\.com\b)[A-Z0-9.-]+\.[A-Z]{2,}/i.test(sql), false)
  assert.equal(/eyJ|sk_live|service_role_key|SUPABASE_SERVICE_ROLE|BEGIN PRIVATE KEY/i.test(sql), false)
  assert.equal(/https?:\/\//i.test(sql), false)
  assert.equal(sql.includes('security_invoker = false'), false)

  for (const table of ['_edge_boot_staging', '_edge_boot_upload', '_hex_scratch']) {
    assert.match(sql, new RegExp(`drop table if exists public\\.${table};`))
  }

  const pairs = [
    ['majlis_events_member', 'majlis_events_member_rows'],
    ['majlis_events_sponsor', 'majlis_events_sponsor_rows'],
    ['majlis_roster', 'majlis_roster_rows'],
  ] as const
  for (const [view, fn] of pairs) {
    assert.equal(normalizeSql(functionBody(sql, fn)), normalizeSql(viewBody(previous, view)))
    assert.match(sql, new RegExp(`create view public\\.${view}\\s+with \\(security_barrier = true, security_invoker = true\\)`))
    assert.match(sql, new RegExp(`revoke all on function private\\.${fn}\\(\\) from public, anon;`))
    assert.match(sql, new RegExp(`grant execute on function private\\.${fn}\\(\\) to authenticated, service_role;`))
    assert.match(sql, new RegExp(`revoke all on table public\\.${view} from public, anon, authenticated;`))
    assert.match(sql, new RegExp(`grant select on table public\\.${view} to authenticated;`))
    assert.equal(new RegExp(`grant select on table public\\.${view} to anon`).test(sql), false)
  }

  const sponsor = functionBody(sql, 'majlis_events_sponsor_rows')
  const sponsorColumns = sql.slice(
    sql.indexOf('create view public.majlis_events_sponsor'),
    sql.indexOf('from private.majlis_events_sponsor_rows()'),
  )
  for (const column of hiddenFromSponsor) {
    assert.equal(new RegExp(`\\b${column}\\b`, 'i').test(sponsorColumns), false, column)
  }
  assert.match(sponsor, /seat = 'sponsor'/)
  assert.match(sponsor, /e\.status = 'published'/)
  assert.match(sponsor, /e\.approved_at/)

  const member = functionBody(sql, 'majlis_events_member_rows')
  for (const column of ['venue_address', 'host_member_id', 'admin_note', 'rejection_feedback', 'cancel_reason', 'approved_at']) {
    assert.match(member, new RegExp(`\\b${column}\\b`))
  }
  assert.match(member, /m\.seat <> 'sponsor'/)
  assert.equal(/\bemail\b/i.test(member), false)

  const roster = functionBody(sql, 'majlis_roster_rows')
  assert.match(roster, /m\.email/)
  assert.match(roster, /p\.full_name/)
  assert.match(roster, /viewer\.seat = 'sponsor'/)
  assert.match(roster, /not exists/)
  assert.equal(/\bvenue_address\b/i.test(roster), false)

  for (const fn of [
    'private.majlis_events_member_rows()',
    'private.majlis_events_sponsor_rows()',
    'private.majlis_roster_rows()',
  ]) {
    const chunk = sql.split(`function ${fn.replace('()', '')}`)[1]?.split('$fn$;')[0] ?? ''
    assert.match(chunk, /security definer/)
    assert.match(chunk, /set search_path = ''/)
  }

  const hits = sourceHits(/_edge_boot_staging|_edge_boot_upload|_hex_scratch/, new Set([
    migrationPath,
    path.join(root, 'scripts/security-view-access.test.ts'),
  ]))
  assert.deepEqual(hits, [])
})

test('every staff_* function checks staff and is not executable by anon', () => {
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()
  const sql = files.map((file) => readFileSync(path.join(migrationsDir, file), 'utf8')).join('\n')
  const names = [
    'staff_set_member_capacity',
    'staff_list_mandate_intros',
    'staff_list_mandates',
    'staff_list_mandate_matches',
    'staff_decide_mandate_intro',
    'staff_list_re_opportunity_intros',
    'staff_decide_re_opportunity_intro',
    'staff_save_re_opportunity',
    'staff_save_re_partner',
    'staff_assign_sponsor_category',
    'staff_set_re_opportunity_readiness',
    'staff_list_re_partner_intros',
    'staff_decide_re_partner_intro',
  ]
  for (const name of names) {
    const fn = latestFunction(name)
    assert.match(fn.body, /if not private\.is_staff\(\) then/)
    const updateAt = fn.body.search(/\bupdate\b/i)
    const checkAt = fn.body.indexOf('if not private.is_staff()')
    if (updateAt >= 0) assert.ok(checkAt >= 0 && checkAt < updateAt, `${name} updates before the staff check`)
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\s*\\([^;]*\\)\\s*from public, anon;`))
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\s*\\([^;]*\\)\\s*to authenticated;`))
    assert.equal(new RegExp(`grant execute on function public\\.${name}\\s*\\([^;]*\\)\\s*to anon`).test(sql), false)
    assert.ok(fn.line > 0)
  }

  const defined = new Set<string>()
  for (const file of readdirSync(migrationsDir)) {
    const text = readFileSync(path.join(migrationsDir, file), 'utf8')
    for (const match of text.matchAll(/create(?: or replace)? function public\.(staff_[a-z0-9_]+)/gi)) {
      defined.add(match[1])
    }
  }
  assert.deepEqual([...defined].sort(), [...names].sort())
})

test('real estate migration adds no definer view and pins search_path', () => {
  const sql = readFileSync(path.join(migrationsDir, '20260929230000_real_estate_inventory.sql'), 'utf8')
  assert.equal(/create\s+(or\s+replace\s+)?(materialized\s+)?view\b/i.test(sql), false)
  const blocks = sql.split(/create or replace function /i).slice(1)
  assert.ok(blocks.length > 0)
  for (const block of blocks) {
    const header = block.split(/\$\$/)[0] ?? ''
    if (!/security definer/i.test(header)) continue
    assert.match(header, /set search_path = public/)
  }
})

test('edge functions do not read the majlis views', () => {
  const hits = sourceHits(
    /majlis_events_member|majlis_events_sponsor|majlis_roster/,
    new Set(),
    path.join(root, 'supabase/functions'),
  )
  assert.deepEqual(hits, [])
})

function sourceHits(pattern: RegExp, allow: Set<string>, dir = root): string[] {
  const hits: string[] = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.(sql|ts|tsx|js|mjs|toml)$/.test(entry.name)) continue
      if (allow.has(full)) continue
      const text = readFileSync(full, 'utf8')
      if (pattern.test(text)) hits.push(path.relative(root, full))
    }
  }
  walk(dir)
  return hits
}

function psqlReady(): boolean {
  try {
    execFileSync('psql', ['-d', 'postgres', '-c', 'select 1'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

test('postgres role matrix matches the previous views', (t) => {
  if (!psqlReady()) {
    t.skip('local psql is not available')
    return
  }

  const previous = readFileSync(previousViewPath, 'utf8')
  const legacy = ['majlis_events_member', 'majlis_events_sponsor', 'majlis_roster'].map((name) => {
    const start = previous.indexOf(`create or replace view public.${name}`)
    const end = previous.indexOf(`revoke all on table public.${name}`, start)
    const statement = previous
      .slice(start, end)
      .trim()
      .replace(`create or replace view public.${name}`, `create view public.${name}_legacy`)
    return `${statement}\ngrant select on table public.${name}_legacy to authenticated;\n`
  }).join('\n')

  const dir = mkdtempSync(path.join(tmpdir(), 'ba-view-'))
  const combined = path.join(dir, 'combined.sql')
  const db = `ba_view_${process.pid}`
  writeFileSync(combined, `${setupSql}\n${legacy}\n\\i ${migrationPath}\n${fixtureSql}\n\\i ${migrationPath}\n${assertSql}\n`)
  try {
    execFileSync('dropdb', ['--if-exists', db], { stdio: 'ignore' })
    execFileSync('createdb', [db], { stdio: 'ignore' })
    try {
      execFileSync('psql', ['-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-f', combined], {
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

const setupSql = `
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
grant anon, authenticated, service_role to current_user;

create schema if not exists auth;
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table public.staff_users (
  user_id uuid primary key,
  role text not null,
  email text not null
);
create table public.members (
  user_id uuid primary key,
  email text not null,
  status text not null,
  seat text not null
);
create table public.profiles (
  user_id uuid primary key,
  full_name text
);
create table public.majlis_region_geotag (
  region text primary key,
  map_lat numeric(8, 4) not null,
  map_lng numeric(8, 4) not null
);
create table public.majlis_events (
  id uuid primary key,
  host_member_id uuid not null,
  title text not null,
  description text not null,
  region text not null,
  focus_tags text[] not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null,
  capacity integer not null,
  venue_name text not null,
  venue_address text not null,
  venue_visibility text not null,
  status text not null,
  rejection_feedback text,
  admin_note text,
  approved_at timestamptz,
  created_at timestamptz not null,
  map_lat numeric(8, 4),
  map_lng numeric(8, 4),
  rsvp_opens_at timestamptz,
  founding_priority_ends_at timestamptz,
  featured boolean not null default false,
  sponsor_label text,
  cancelled_at timestamptz,
  cancel_reason text
);
create table public.majlis_rsvps (
  id uuid primary key,
  event_id uuid not null,
  member_id uuid not null,
  status text not null,
  waitlist_position integer,
  registered_at timestamptz not null,
  cancelled_at timestamptz
);

alter table public.staff_users enable row level security;
alter table public.staff_users force row level security;
alter table public.members enable row level security;
alter table public.members force row level security;
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.majlis_region_geotag enable row level security;
alter table public.majlis_region_geotag force row level security;
alter table public.majlis_events enable row level security;
alter table public.majlis_events force row level security;
alter table public.majlis_rsvps enable row level security;
alter table public.majlis_rsvps force row level security;

revoke all on table public.staff_users from public, anon, authenticated;
revoke all on table public.members from public, anon, authenticated;
revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.majlis_region_geotag from public, anon, authenticated;
revoke all on table public.majlis_events from public, anon, authenticated;
revoke all on table public.majlis_rsvps from public, anon, authenticated;

create table public._edge_boot_staging (id int);
create table public._edge_boot_upload (id int);
create table public._hex_scratch (id int);
insert into public._edge_boot_staging values (1);
insert into public._edge_boot_upload values (1);
insert into public._hex_scratch values (1);

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_users s
    where s.user_id = auth.uid() and s.role in ('staff', 'master')
  );
$$;

create or replace function public.staff_set_member_capacity(
  p_user_id uuid,
  p_investable_capacity_usd numeric,
  p_fo_aum_usd numeric,
  p_turnover_usd numeric,
  p_include_in_public_aggregates boolean,
  p_capacity_verified boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.staff_list_mandate_intros()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return '[]'::jsonb;
end;
$$;

create or replace function public.staff_decide_mandate_intro(p_intro_id uuid, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.staff_set_member_capacity(uuid, numeric, numeric, numeric, boolean, boolean) to public, anon, authenticated;
grant execute on function public.staff_list_mandate_intros() to public, anon, authenticated;
grant execute on function public.staff_decide_mandate_intro(uuid, text) to public, anon, authenticated;

create or replace function public.staff_list_re_opportunity_intros()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return '[]'::jsonb;
end;
$$;

create or replace function public.staff_decide_re_opportunity_intro(p_intro_id uuid, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.staff_save_re_opportunity(
  p_id uuid,
  p_published boolean,
  p_sector text,
  p_city text,
  p_asset_class text,
  p_capital_role text,
  p_ticket_band text,
  p_one_liner text,
  p_sponsor_member_id uuid,
  p_counterparty_name text,
  p_terms text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_narrative text,
  p_foreign_ownership_path text,
  p_escrow_off_plan text,
  p_title_clarity text,
  p_white_land_exposure text,
  p_sort_order integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.staff_save_re_partner(
  p_id uuid,
  p_published boolean,
  p_name text,
  p_kind text,
  p_blurb text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_sort_order integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.staff_assign_sponsor_category(p_member_id uuid, p_category_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.staff_list_re_opportunity_intros() to public, anon, authenticated;
grant execute on function public.staff_decide_re_opportunity_intro(uuid, text) to public, anon, authenticated;
grant execute on function public.staff_save_re_opportunity(
  uuid, boolean, text, text, text, text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, integer
) to public, anon, authenticated;
grant execute on function public.staff_save_re_partner(
  uuid, boolean, text, text, text, text, text, text, integer
) to public, anon, authenticated;
grant execute on function public.staff_assign_sponsor_category(uuid, text) to public, anon, authenticated;
`

const fixtureSql = `
insert into public.majlis_region_geotag (region, map_lat, map_lng)
values ('Riyadh', 24.7136, 46.6753);

insert into public.staff_users (user_id, role, email) values
  ('00000000-0000-4000-8000-000000000001', 'staff', 'staff@example.com');

insert into public.members (user_id, email, status, seat) values
  ('00000000-0000-4000-8000-000000000002', 'host@example.com', 'active', 'ksa'),
  ('00000000-0000-4000-8000-000000000003', 'guest@example.com', 'active', 'intl'),
  ('00000000-0000-4000-8000-000000000004', 'sponsor@example.com', 'active', 'sponsor');

insert into public.profiles (user_id, full_name) values
  ('00000000-0000-4000-8000-000000000002', 'Host Person'),
  ('00000000-0000-4000-8000-000000000003', 'Guest Person'),
  ('00000000-0000-4000-8000-000000000004', 'Sponsor Person');

insert into public.majlis_events (
  id, host_member_id, title, description, region, focus_tags, starts_at, ends_at, timezone,
  capacity, venue_name, venue_address, venue_visibility, status, rejection_feedback, admin_note,
  approved_at, created_at, featured, sponsor_label, cancelled_at, cancel_reason
) values
  (
    '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
    'Published salon', 'A private salon.', 'Riyadh', '{Governance}',
    '2026-10-02 15:30:00+00', '2026-10-02 17:00:00+00', 'Asia/Riyadh',
    12, 'House', 'host street', 'members_on_rsvp', 'published', null, 'staff only note',
    '2026-09-01 00:00:00+00', '2026-09-01 00:00:00+00', true, 'Regional circle', null, null
  ),
  (
    '10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002',
    'Pending salon', 'Still pending.', 'Riyadh', '{Governance}',
    '2026-11-02 15:30:00+00', '2026-11-02 17:00:00+00', 'Asia/Riyadh',
    12, 'House', 'pending street', 'members_on_rsvp', 'pending_approval', null, null,
    null, '2026-09-02 00:00:00+00', false, null, null, null
  ),
  (
    '10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003',
    'Always salon', 'Address stays visible.', 'Riyadh', '{Governance}',
    '2026-12-02 15:30:00+00', '2026-12-02 17:00:00+00', 'Asia/Riyadh',
    12, 'House', 'always street', 'members_always', 'published', null, 'other note',
    '2026-09-03 00:00:00+00', '2026-09-03 00:00:00+00', false, null, null, null
  ),
  (
    '10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002',
    'Rejected salon', 'Needs a rewrite.', 'Riyadh', '{Governance}',
    '2027-01-02 15:30:00+00', '2027-01-02 17:00:00+00', 'Asia/Riyadh',
    12, 'House', 'reject street', 'members_on_rsvp', 'rejected', 'revise the brief', 'reject note',
    '2026-09-04 00:00:00+00', '2026-09-04 00:00:00+00', false, null, null, null
  ),
  (
    '10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002',
    'Cancelled salon', 'No longer meeting.', 'Riyadh', '{Governance}',
    '2027-02-02 15:30:00+00', '2027-02-02 17:00:00+00', 'Asia/Riyadh',
    12, 'House', 'cancel street', 'members_on_rsvp', 'cancelled', null, 'cancel note',
    '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00', false, null, '2026-09-06 00:00:00+00', 'schedule clash'
  ),
  (
    '10000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000002',
    'Closed salon', 'Address after registration.', 'Riyadh', '{Governance}',
    '2027-03-02 15:30:00+00', '2027-03-02 17:00:00+00', 'Asia/Riyadh',
    12, 'House', 'rsvp gate', 'members_on_rsvp', 'published', null, 'hidden note',
    '2026-09-07 00:00:00+00', '2026-09-07 00:00:00+00', false, null, null, null
  );

insert into public.majlis_rsvps (id, event_id, member_id, status, waitlist_position, registered_at, cancelled_at) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'registered', null, '2026-09-10 00:00:00+00', null),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'registered', null, '2026-09-11 00:00:00+00', null),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004', 'registered', null, '2026-09-12 00:00:00+00', null),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', 'waitlist', 1, '2026-09-13 00:00:00+00', null);
`

const assertSql = `
do $check$
declare
  n int;
  diff text;
  addr text;
  note text;
  feedback text;
  reason text;
  opens timestamptz;
  emails text;
begin
  if to_regclass('public._edge_boot_staging') is not null
     or to_regclass('public._edge_boot_upload') is not null
     or to_regclass('public._hex_scratch') is not null then
    raise exception 'scratch tables still exist';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public'
      and c.relname in ('majlis_events_member', 'majlis_events_sponsor', 'majlis_roster')
      and not exists (
        select 1
        from pg_options_to_table(c.reloptions) opt
        where opt.option_name = 'security_invoker'
          and opt.option_value in ('true', 'on')
      )
  ) then
    raise exception 'a majlis view is still security definer';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'private'
      and p.proname in ('majlis_events_member_rows', 'majlis_events_sponsor_rows', 'majlis_roster_rows')
      and (
        p.prosecdef is not true
        or not exists (
          select 1 from unnest(coalesce(p.proconfig, array[]::text[])) cfg
          where cfg like 'search_path=%'
            and btrim(split_part(cfg, '=', 2), '"') = ''
        )
      )
  ) then
    raise exception 'private read function is missing security definer or an empty search_path';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'majlis_events_sponsor'
      and column_name in (
        'venue_address', 'host_member_id', 'email', 'full_name',
        'admin_note', 'rejection_feedback', 'cancel_reason', 'approved_at'
      )
  ) then
    raise exception 'sponsor view exposes a hidden column';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'majlis_events_member'
      and column_name in ('email', 'full_name')
  ) then
    raise exception 'member view exposes roster identity';
  end if;

  foreach diff in array array[
    'staff_set_member_capacity(uuid,numeric,numeric,numeric,boolean,boolean)',
    'staff_list_mandate_intros()',
    'staff_decide_mandate_intro(uuid,text)',
    'staff_list_re_opportunity_intros()',
    'staff_decide_re_opportunity_intro(uuid,text)',
    'staff_save_re_opportunity(uuid,boolean,text,text,text,text,text,text,uuid,text,text,text,text,text,text,text,text,text,text,integer)',
    'staff_save_re_partner(uuid,boolean,text,text,text,text,text,text,integer)',
    'staff_assign_sponsor_category(uuid,text)'
  ]
  loop
    if has_function_privilege('anon', 'public.' || diff, 'execute') then
      raise exception 'anon can execute %', diff;
    end if;
    if exists (
      select 1
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
      cross join lateral aclexplode(p.proacl) x
      where ns.nspname = 'public'
        and p.proname = split_part(diff, '(', 1)
        and x.grantee = 0
        and x.privilege_type = 'EXECUTE'
    ) then
      raise exception 'public can execute %', diff;
    end if;
    if not has_function_privilege('authenticated', 'public.' || diff, 'execute') then
      raise exception 'authenticated lost execute on %', diff;
    end if;
  end loop;

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  perform set_config('role', 'authenticated', true);

  select count(*) into n from public.majlis_events_member;
  if n <> 6 then
    raise exception 'host member count %', n;
  end if;
  select count(*) into n from public.majlis_events_sponsor;
  if n <> 0 then
    raise exception 'host saw sponsor rows %', n;
  end if;
  select venue_address, admin_note, rejection_feedback, cancel_reason
    into addr, note, feedback, reason
  from public.majlis_events_member
  where id = '10000000-0000-4000-8000-000000000006';
  if addr is distinct from 'rsvp gate' or note is not null or feedback is not null or reason is not null then
    raise exception 'host closed salon redaction % % % %', addr, note, feedback, reason;
  end if;
  select admin_note, approved_at into note, opens
  from public.majlis_events_member
  where id = '10000000-0000-4000-8000-000000000001';
  if note is not null or opens is not null then
    raise exception 'host saw staff columns on the published salon';
  end if;
  select rejection_feedback into feedback
  from public.majlis_events_member
  where id = '10000000-0000-4000-8000-000000000004';
  if feedback is distinct from 'revise the brief' then
    raise exception 'host lost rejection feedback';
  end if;
  select cancel_reason into reason
  from public.majlis_events_member
  where id = '10000000-0000-4000-8000-000000000005';
  if reason is distinct from 'schedule clash' then
    raise exception 'host lost cancel reason';
  end if;
  select registered_count into n
  from public.majlis_events_member
  where id = '10000000-0000-4000-8000-000000000001';
  if n <> 3 then
    raise exception 'host registered count %', n;
  end if;
  select string_agg(distinct email, ',' order by email) into emails from public.majlis_roster;
  if emails is distinct from 'guest@example.com,host@example.com,sponsor@example.com' then
    raise exception 'host roster %', emails;
  end if;

  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
  perform set_config('role', 'authenticated', true);

  select count(*) into n from public.majlis_events_member;
  if n <> 3 then
    raise exception 'guest member count %', n;
  end if;
  select count(*) into n from public.majlis_events_sponsor;
  if n <> 0 then
    raise exception 'guest saw sponsor rows %', n;
  end if;
  if exists (
    select 1 from public.majlis_events_member
    where id in (
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000005'
    )
  ) then
    raise exception 'guest saw a non-published foreign event';
  end if;
  select venue_address, admin_note into addr, note
  from public.majlis_events_member
  where id = '10000000-0000-4000-8000-000000000001';
  if addr is distinct from 'host street' or note is not null then
    raise exception 'guest published salon % %', addr, note;
  end if;
  select venue_address, admin_note, approved_at into addr, note, opens
  from public.majlis_events_member
  where id = '10000000-0000-4000-8000-000000000003';
  if addr is distinct from 'always street' or note is not null or opens is not null then
    raise exception 'guest host salon leaked staff fields % %', addr, note;
  end if;
  select venue_address into addr
  from public.majlis_events_member
  where id = '10000000-0000-4000-8000-000000000006';
  if addr is not null then
    raise exception 'guest saw a closed address %', addr;
  end if;
  select registered_count, my_rsvp_status into n, feedback
  from public.majlis_events_member
  where id = '10000000-0000-4000-8000-000000000001';
  if n <> 3 or feedback is distinct from 'registered' then
    raise exception 'guest count or rsvp % %', n, feedback;
  end if;
  select string_agg(distinct email, ',' order by email) into emails from public.majlis_roster;
  if emails is distinct from 'guest@example.com' then
    raise exception 'guest roster %', emails;
  end if;
  select count(*) into n from public.majlis_roster;
  if n <> 2 then
    raise exception 'guest roster count %', n;
  end if;

  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
  perform set_config('role', 'authenticated', true);

  select count(*) into n from public.majlis_events_member;
  if n <> 0 then
    raise exception 'sponsor saw member rows %', n;
  end if;
  select count(*) into n from public.majlis_roster;
  if n <> 0 then
    raise exception 'sponsor saw roster rows %', n;
  end if;
  select count(*) into n from public.majlis_events_sponsor;
  if n <> 3 then
    raise exception 'sponsor event count %', n;
  end if;
  if exists (
    select 1 from public.majlis_events_sponsor
    where id not in (
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000006'
    )
  ) then
    raise exception 'sponsor saw an unpublished event';
  end if;
  select registered_count, sponsor_label into n, addr
  from public.majlis_events_sponsor
  where id = '10000000-0000-4000-8000-000000000001';
  if n <> 3 or addr is distinct from 'Regional circle' then
    raise exception 'sponsor published row % %', n, addr;
  end if;

  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
  perform set_config('role', 'authenticated', true);

  select count(*) into n from public.majlis_events_member;
  if n <> 6 then
    raise exception 'staff member count %', n;
  end if;
  select count(*) into n from public.majlis_events_sponsor;
  if n <> 0 then
    raise exception 'staff saw sponsor rows %', n;
  end if;
  select admin_note, approved_at, venue_address into note, opens, addr
  from public.majlis_events_member
  where id = '10000000-0000-4000-8000-000000000001';
  if note is distinct from 'staff only note' or opens is null or addr is distinct from 'host street' then
    raise exception 'staff lost admin fields % % %', note, opens, addr;
  end if;
  select admin_note into note
  from public.majlis_events_member
  where id = '10000000-0000-4000-8000-000000000006';
  if note is distinct from 'hidden note' then
    raise exception 'staff lost hidden note';
  end if;
  select count(*) into n from public.majlis_roster;
  if n <> 4 then
    raise exception 'staff roster count %', n;
  end if;
  select map_lat::text into addr
  from public.majlis_events_member
  where id = '10000000-0000-4000-8000-000000000001';
  if addr::numeric <> 24.7136 then
    raise exception 'staff map %', addr;
  end if;

  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.majlis_events_member;
  if n <> 0 then
    raise exception 'outsider member rows %', n;
  end if;
  select count(*) into n from public.majlis_events_sponsor;
  if n <> 0 then
    raise exception 'outsider sponsor rows %', n;
  end if;
  select count(*) into n from public.majlis_roster;
  if n <> 0 then
    raise exception 'outsider roster rows %', n;
  end if;

  perform set_config('role', 'none', true);

  foreach diff in array array['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000005']
  loop
    perform set_config('request.jwt.claim.sub', diff, true);
    perform set_config('role', 'authenticated', true);
    select count(*) into n from (
      (select to_jsonb(v.*) j from public.majlis_events_member_legacy v
       except
       select to_jsonb(v.*) j from public.majlis_events_member v)
      union all
      (select to_jsonb(v.*) j from public.majlis_events_member v
       except
       select to_jsonb(v.*) j from public.majlis_events_member_legacy v)
      union all
      (select to_jsonb(v.*) j from public.majlis_events_sponsor_legacy v
       except
       select to_jsonb(v.*) j from public.majlis_events_sponsor v)
      union all
      (select to_jsonb(v.*) j from public.majlis_events_sponsor v
       except
       select to_jsonb(v.*) j from public.majlis_events_sponsor_legacy v)
      union all
      (select to_jsonb(v.*) j from public.majlis_roster_legacy v
       except
       select to_jsonb(v.*) j from public.majlis_roster v)
      union all
      (select to_jsonb(v.*) j from public.majlis_roster v
       except
       select to_jsonb(v.*) j from public.majlis_roster_legacy v)
    ) mismatches;
    if n <> 0 then
      raise exception 'view mismatch for % (%)', diff, n;
    end if;
    perform set_config('role', 'none', true);
  end loop;

  foreach diff in array array['public.majlis_events_member', 'public.majlis_events_sponsor', 'public.majlis_roster']
  loop
    begin
      perform set_config('role', 'anon', true);
      execute 'select count(*) from ' || diff;
      raise exception 'anon read %', diff;
    exception
      when insufficient_privilege then
        perform set_config('role', 'none', true);
    end;
    if has_table_privilege('anon', diff, 'select') then
      raise exception 'anon still has select on %', diff;
    end if;
  end loop;

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
  begin
    perform set_config('role', 'authenticated', true);
    perform count(*) from public.majlis_events;
    raise exception 'member read base events';
  exception
    when insufficient_privilege then
      perform set_config('role', 'none', true);
  end;
end
$check$;
`

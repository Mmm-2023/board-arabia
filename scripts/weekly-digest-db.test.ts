import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')

test('weekly digest hides private rows and refuses an unapproved send', { timeout: 300_000 }, () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.ok(names.includes('20261212120000_weekly_digest.sql'))
  assert.ok(names.indexOf('20261212120000_weekly_digest.sql') > names.indexOf('20261210120000_sectors_city_about.sql'))
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-digest-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_digest_${process.pid}`
  const stub = readFileSync(path.join(root, 'scripts/definer-audit.test.ts'), 'utf8')
  const stubStart = stub.indexOf('const stubSql = `') + 'const stubSql = `'.length
  const stubEnd = stub.indexOf('`\n\nconst assertSql')
  assert.ok(stubStart > 0 && stubEnd > stubStart)
  writeFileSync(script, [stub.slice(stubStart, stubEnd), ...names.map(include), assertSql].join('\n'))

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

const assertSql = `
do $checks$
declare
  a_id uuid := gen_random_uuid();
  b_id uuid := gen_random_uuid();
  c_id uuid := gen_random_uuid();
  h_id uuid := gen_random_uuid();
  d_id uuid := gen_random_uuid();
  s_id uuid := gen_random_uuid();
  p_id uuid := gen_random_uuid();
  staff_id uuid := gen_random_uuid();
  y integer;
  w integer;
  digest jsonb;
  other jsonb;
  sponsor_digest jsonb;
  issue jsonb;
  issue_id uuid;
  plan jsonb;
  notices jsonb;
  token text;
  other_token text;
  sendable boolean;
  names jsonb;
  suggestions jsonb;
begin
  insert into auth.users (id, email) values
    (a_id, 'amina@example.com'),
    (b_id, 'layla@example.com'),
    (c_id, 'noura@example.com'),
    (h_id, 'hidden@example.com'),
    (d_id, 'demo@example.com'),
    (s_id, 'sample@example.com'),
    (p_id, 'partner@example.com'),
    (staff_id, 'admin@example.com');

  insert into public.members (user_id, email, seat, status, directory_hidden, is_demo, created_at) values
    (a_id, 'amina@example.com', 'ksa', 'active', false, false, now()),
    (b_id, 'layla@example.com', 'ksa', 'active', false, false, now()),
    (c_id, 'noura@example.com', 'ksa', 'active', false, false, now() - interval '40 days'),
    (h_id, 'hidden@example.com', 'ksa', 'active', true, false, now()),
    (d_id, 'demo@example.com', 'ksa', 'active', false, true, now()),
    (s_id, 'sample@example.com', 'ksa', 'active', false, false, now()),
    (p_id, 'partner@example.com', 'sponsor', 'active', false, false, now() - interval '40 days');

  update public.members
  set tiers = array['member']::text[]
  where user_id = c_id;

  insert into public.profiles (user_id, full_name, headline, company) values
    (a_id, 'Amina Caller', 'Director', 'Caller Co'),
    (b_id, 'Layla New', 'Director', 'Diriyah Works'),
    (c_id, 'Noura Older', 'Director', 'Wahat Counsel'),
    (h_id, 'Hidden Person', 'Director', 'Hidden Co'),
    (d_id, 'Demo Person', 'Director', 'Demo Co'),
    (s_id, 'Sample Person', 'Director', 'Sample Co'),
    (p_id, 'Sponsor Person', 'Director', 'Partner Co');

  alter table public.directory_entries drop constraint if exists directory_entries_email_test;
  insert into public.directory_entries (
    id, is_demo, email, full_name, headline, company, location, sector, seat, portrait_asset
  ) values (
    s_id, true, 'sample.seat@example.com', 'Sample Person', 'Director', 'Sample Co',
    'Riyadh', 'Energy', 'ksa', '/demo/portraits/sample-person.svg'
  );

  select extracted.iso_year, extracted.iso_week into y, w
  from private.digest_week(now()) as extracted;

  insert into public.intro_suggestions (member_id, suggested_id, iso_year, iso_week, rank, reason) values
    (a_id, b_id, y, w, 1, 'Both are in Riyadh.'),
    (b_id, c_id, y, w, 1, 'A separate introduction.');

  insert into public.mandates (
    id, is_demo, published, sector, deal_type, ticket_band, geography, stage, one_liner,
    company_name, exact_amount, terms, contact_name, contact_email, contact_phone, narrative
  ) values (
    gen_random_uuid(), false, true,
    'Energy', 'Growth equity', 'Mid band', 'KSA', 'Diligence',
    'A clear regional mandate for members.',
    'Northwind Example', 'Terms on request', 'One board seat.',
    'Amal N.', 'admin.note@example.com', 'Room note',
    'The private brief stays out of the weekly digest.'
  );

  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
  insert into public.majlis_events (
    host_member_id, title, description, region, focus_tags, starts_at, ends_at,
    capacity, venue_name, venue_address, venue_visibility, status, approved_by, approved_at
  ) values
    (
      b_id, 'Open gathering', 'A members gathering.', 'Riyadh', array['Capital'],
      now() + interval '3 days', now() + interval '3 days 2 hours',
      20, 'Hall', 'Open hall', 'members_always', 'published', staff_id, now()
    ),
    (
      b_id, 'Private gathering', 'A members gathering.', 'Riyadh', array['Capital'],
      now() + interval '4 days', now() + interval '4 days 2 hours',
      20, 'Hall', 'Private hall', 'members_on_rsvp', 'published', staff_id, now()
    ),
    (
      b_id, 'Past gathering', 'A members gathering.', 'Riyadh', array['Capital'],
      now() - interval '3 days', now() - interval '3 days' + interval '2 hours',
      20, 'Hall', 'Open hall', 'members_always', 'published', staff_id, now() - interval '4 days'
    ),
    (
      h_id, 'Hidden host gathering', 'A members gathering.', 'Riyadh', array['Capital'],
      now() + interval '5 days', now() + interval '5 days 2 hours',
      20, 'Hall', 'Open hall', 'members_always', 'published', staff_id, now()
    );
  perform set_config('request.jwt.claims', '{}', false);

  insert into public.staff_users (user_id, email, role)
  values (staff_id, 'admin@example.com', 'staff');

  set role anon;
  begin
    perform public.my_weekly_digest();
    raise exception 'anon called the digest';
  exception
    when insufficient_privilege then
      if sqlerrm ilike '%not_allowed%' then
        raise exception 'anon reached the digest body';
      end if;
  end;
  set role postgres;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', a_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  digest := public.my_weekly_digest();
  perform public.set_digest_email_opt_in(true);
  begin
    perform public.set_digest_send_enabled(true);
    raise exception 'member changed the send switch';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%not_allowed%' then
        raise exception 'member switch error %', sqlerrm;
      end if;
  end;
  begin
    perform 1 from public.digest_issues;
    raise exception 'member read digest issues';
  exception
    when insufficient_privilege then
      null;
  end;
  set role postgres;

  if digest->>'mail_ready' is distinct from 'false' then
    raise exception 'mail ready was true';
  end if;
  if jsonb_array_length(digest->'new_members') <> 0
     or jsonb_array_length(digest->'new_mandates') <> 0
     or jsonb_array_length(digest->'upcoming_events') <> 0
     or jsonb_array_length(digest->'suggestions') <> 0
     or digest::text ilike '%layla%' then
    raise exception 'digest was live before approval %', digest;
  end if;

  select m.digest_unsubscribe_token, b.digest_unsubscribe_token
    into token, other_token
  from public.members m
  join public.members b on b.user_id = b_id
  where m.user_id = a_id;
  if token is null or char_length(token) <> 64 or token = other_token then
    raise exception 'token missing';
  end if;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', a_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  if public.own_digest_preference()->>'digest_email_opt_in' is distinct from 'true' then
    raise exception 'preference was not saved';
  end if;
  if position(token in public.own_digest_preference()::text) > 0 then
    raise exception 'preference returned the token';
  end if;
  set role postgres;
  if (select digest_email_opt_in from public.members where user_id = b_id) then
    raise exception 'other member preference changed';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', staff_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  begin
    perform public.staff_create_digest_draft();
    raise exception 'aal1 staff prepared an issue';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%not_allowed%' then
        raise exception 'aal1 error %', sqlerrm;
      end if;
  end;
  set role postgres;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', staff_id, 'aal', 'aal2', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  issue := public.staff_create_digest_draft();
  if issue->'issue'->>'status' is distinct from 'draft' or issue->>'send_enabled' is distinct from 'false'
     or issue->>'mail_ready' is distinct from 'false' then
    raise exception 'draft state %', issue;
  end if;
  if (issue->'issue'->'payload')::text ilike '%both are in riyadh%'
     or issue->'issue'->'payload'->'preview_intros'->0->>'full_name' is distinct from 'Example Member A' then
    raise exception 'staff saw a real introduction %', issue->'issue'->'payload';
  end if;
  if issue->'issue'->'payload'->'upcoming_events'->0->>'venue_address' is distinct from 'Open hall' then
    raise exception 'staff venue %', issue->'issue'->'payload'->'upcoming_events';
  end if;
  if position('@' in (issue->'issue'->'payload')::text) > 0 then
    raise exception 'draft leaked an address %', issue->'issue'->'payload';
  end if;
  if regexp_replace((issue->'issue'->'payload')::text, '[0-9a-fA-F-]{36}', '', 'g') ~ '[0-9][0-9 ()+.-]{6,}[0-9]' then
    raise exception 'draft leaked a phone %', issue->'issue'->'payload';
  end if;
  if (issue->'issue'->'payload')::text ilike '%nahla%'
     or (issue->'issue'->'payload')::text ilike '%private hall%'
     or (issue->'issue'->'payload')::text ilike '%hidden person%'
     or (issue->'issue'->'payload')::text ilike '%demo person%'
     or (issue->'issue'->'payload')::text ilike '%sample person%'
     or (issue->'issue'->'payload')::text ilike '%separate introduction%'
     or (issue->'issue'->'payload')::text ilike '%northwind%'
     or (issue->'issue'->'payload')::text ilike '%room note%' then
    raise exception 'draft leaked a private row %', issue->'issue'->'payload';
  end if;
  select coalesce(jsonb_agg(item->>'full_name' order by item->>'full_name'), '[]'::jsonb)
    into names
  from jsonb_array_elements(issue->'issue'->'payload'->'new_members') item;
  if names <> '["Amina Caller", "Layla New"]'::jsonb then
    raise exception 'draft members %', names;
  end if;
  if issue->'issue'->'payload'->'new_mandates'->0->>'one_liner' is distinct from 'A clear regional mandate for members.' then
    raise exception 'draft mandate %', issue->'issue'->'payload'->'new_mandates';
  end if;
  if issue->'issue'->'payload'->'upcoming_events'->1->>'title' is distinct from 'Private gathering'
     or issue->'issue'->'payload'->'upcoming_events'->1->>'venue_address' is not null
     or issue->'issue'->'payload'->'upcoming_events'->2->>'title' is distinct from 'Hidden host gathering'
     or issue->'issue'->'payload'->'upcoming_events'->2->>'host_name' is distinct from 'Board Arabia'
     or jsonb_array_length(issue->'issue'->'payload'->'upcoming_events') <> 3 then
    raise exception 'draft events %', issue->'issue'->'payload'->'upcoming_events';
  end if;
  issue_id := (issue->'issue'->>'id')::uuid;
  sendable := public.digest_issue_sendable(issue_id);
  if sendable then
    raise exception 'draft was sendable';
  end if;
  set role postgres;

  update public.digest_issues
  set payload = jsonb_set(payload, '{mail_ready}', 'true'::jsonb)
  where id = issue_id;
  update public.digest_settings set send_enabled = true where id;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', staff_id, 'aal', 'aal2', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  if public.digest_issue_sendable(issue_id) then
    raise exception 'unapproved issue was sendable';
  end if;
  set role postgres;

  update public.digest_issues
  set payload = jsonb_set(payload, '{mail_ready}', 'false'::jsonb)
  where id = issue_id;
  update public.digest_settings set send_enabled = false where id;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', staff_id, 'aal', 'aal2', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  begin
    perform public.staff_decide_digest_issue('approve');
    raise exception 'approved with no tier';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%audience_required%' then
        raise exception 'audience error %', sqlerrm;
      end if;
  end;
  set role postgres;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', a_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  begin
    perform public.staff_save_digest_draft('{}'::jsonb, array['founding']);
    raise exception 'member saved a draft';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%not_allowed%' then
        raise exception 'member save error %', sqlerrm;
      end if;
  end;
  begin
    perform public.staff_decide_digest_issue('approve');
    raise exception 'member approved an issue';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%not_allowed%' then
        raise exception 'member approve error %', sqlerrm;
      end if;
  end;
  set role postgres;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', staff_id, 'aal', 'aal2', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  select coalesce(jsonb_agg(
    case when listed.item->>'full_name' = 'Layla New' then listed.item - 'company' else listed.item end
    order by listed.ord
  ), '[]'::jsonb)
    into names
  from jsonb_array_elements(issue->'issue'->'payload'->'new_members') with ordinality as listed(item, ord);
  issue := public.staff_save_digest_draft(
    jsonb_build_object(
      'new_members', names,
      'new_mandates', issue->'issue'->'payload'->'new_mandates',
      'upcoming_events', (
        select coalesce(jsonb_agg(
          case
            when listed.item->>'title' = 'Hidden host gathering' then listed.item - 'region'
            else listed.item
          end
          order by listed.ord
        ), '[]'::jsonb)
        from jsonb_array_elements(issue->'issue'->'payload'->'upcoming_events') with ordinality as listed(item, ord)
      ),
      'introductions', '[]'::jsonb,
      'notes', jsonb_build_array(jsonb_build_object('text', 'Example note for members'))
    ),
    array['founding']
  );
  if issue->'issue'->'audience' <> '["founding"]'::jsonb then
    raise exception 'audience was not saved %', issue->'issue'->'audience';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(issue->'issue'->'payload'->'new_members') item
    where item->>'full_name' = 'Layla New' and item ? 'company'
  ) then
    raise exception 'company stayed on the saved draft %', issue->'issue'->'payload'->'new_members';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(issue->'issue'->'payload'->'upcoming_events') item
    where item->>'title' = 'Hidden host gathering' and item ? 'region'
  ) then
    raise exception 'region stayed on the saved draft %', issue->'issue'->'payload'->'upcoming_events';
  end if;
  if issue->'issue'->'payload'->'notes'->0->>'text' is distinct from 'Example note for members' then
    raise exception 'note was not saved %', issue->'issue'->'payload'->'notes';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(issue->'issue'->'log') item
    where item->>'action' = 'edited'
  ) then
    raise exception 'edit was not audited %', issue->'issue'->'log';
  end if;
  issue := public.staff_decide_digest_issue('approve');
  if public.digest_issue_sendable(issue_id) then
    raise exception 'approved issue was sendable while mail was off';
  end if;
  plan := public.staff_digest_mail_plan(issue_id);
  if plan->>'mail_ready' is distinct from 'false'
     or plan->>'sendable' is distinct from 'false'
     or plan->>'stored_mail_ready' is distinct from 'false' then
    raise exception 'mail plan was sendable %', plan;
  end if;
  if position('@' in plan::text) > 0 then
    raise exception 'mail plan returned an address %', plan;
  end if;
  if (plan->>'recipient_count')::integer <> 4 then
    raise exception 'recipient count %', plan;
  end if;
  set role postgres;
  if (select updated_by from public.digest_issues where id = issue_id) is distinct from staff_id
     or (select updated_at from public.digest_issues where id = issue_id) is null then
    raise exception 'edit stamp missing';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', a_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  digest := public.my_weekly_digest();
  notices := public.my_digest_notices();
  set role postgres;
  if exists (
    select 1
    from jsonb_array_elements(digest->'new_members') item
    where item->>'full_name' = 'Layla New' and item ? 'company'
  ) or exists (
    select 1
    from jsonb_array_elements(digest->'new_members') item
    where item ? 'id'
  ) then
    raise exception 'member still saw a removed field %', digest->'new_members';
  end if;
  if digest->'notes'->0->>'text' is distinct from 'Example note for members' then
    raise exception 'member note %', digest->'notes';
  end if;
  if position('@' in digest::text) > 0 or digest::text ~ '[0-9][0-9 ()+.-]{6,}[0-9]' then
    raise exception 'member digest leaked contact data %', digest;
  end if;
  if digest->'upcoming_events'->2->>'host_name' is distinct from 'Board Arabia'
     or exists (
       select 1
       from jsonb_array_elements(digest->'upcoming_events') item
       where item->>'title' = 'Hidden host gathering' and item ? 'region'
     ) then
    raise exception 'member events %', digest->'upcoming_events';
  end if;
  if digest::text ilike '%example member a%' then
    raise exception 'member saw the sample introduction %', digest;
  end if;
  if notices->0->>'title' is distinct from 'This week''s update is ready'
     or notices->0->>'href' is distinct from '/dashboard/digest' then
    raise exception 'in-tier notice %', notices;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', c_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  other := public.my_weekly_digest();
  notices := public.my_digest_notices();
  set role postgres;
  if jsonb_array_length(other->'new_members') <> 0
     or other::text ilike '%example note%'
     or jsonb_array_length(notices) <> 0 then
    raise exception 'out-of-tier member saw the issue % %', other, notices;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  sponsor_digest := public.my_weekly_digest();
  notices := public.my_digest_notices();
  set role postgres;
  if jsonb_array_length(sponsor_digest->'upcoming_events') <> 0
     or sponsor_digest::text ilike '%layla new%'
     or jsonb_array_length(notices) <> 0 then
    raise exception 'out-of-tier partner saw the issue % %', sponsor_digest, notices;
  end if;

  update public.digest_issues
  set payload = jsonb_set(payload, '{mail_ready}', 'true'::jsonb)
  where id = issue_id;
  update public.digest_settings set send_enabled = true where id;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', staff_id, 'aal', 'aal2', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  if not public.digest_issue_sendable(issue_id) then
    raise exception 'approved ready issue was refused';
  end if;
  issue := public.staff_decide_digest_issue('withdraw');
  if public.digest_issue_sendable(issue_id) then
    raise exception 'withdrawn issue was sendable';
  end if;
  if jsonb_array_length(issue->'issue'->'log') < 3 then
    raise exception 'audit log incomplete %', issue->'issue'->'log';
  end if;
  set role postgres;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', a_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  digest := public.my_weekly_digest();
  notices := public.my_digest_notices();
  set role postgres;
  if jsonb_array_length(digest->'new_members') <> 0
     or digest::text ilike '%example note%'
     or jsonb_array_length(notices) <> 0 then
    raise exception 'withdraw left the issue visible % %', digest, notices;
  end if;

  update public.members set show_card_to_sponsors = true where user_id = b_id;
  update public.digest_settings set send_enabled = false where id;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', staff_id, 'aal', 'aal2', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  issue := public.staff_create_digest_draft();
  issue := public.staff_save_digest_draft(
    jsonb_build_object(
      'new_members', issue->'issue'->'payload'->'new_members',
      'new_mandates', issue->'issue'->'payload'->'new_mandates',
      'upcoming_events', issue->'issue'->'payload'->'upcoming_events',
      'introductions', '[]'::jsonb,
      'notes', '[]'::jsonb
    ),
    array['sponsor']
  );
  perform public.staff_decide_digest_issue('approve');
  if public.digest_issue_sendable((issue->'issue'->>'id')::uuid) then
    raise exception 'partner issue was sendable';
  end if;
  set role postgres;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  sponsor_digest := public.my_weekly_digest();
  notices := public.my_digest_notices();
  set role postgres;
  select coalesce(jsonb_agg(item->>'full_name' order by item->>'full_name'), '[]'::jsonb)
    into names
  from jsonb_array_elements(sponsor_digest->'new_members') item;
  if names <> '["Layla New"]'::jsonb
     or jsonb_array_length(sponsor_digest->'upcoming_events') <> 0
     or sponsor_digest::text ilike '%amina caller%'
     or notices->0->>'title' is distinct from 'This week''s update is ready' then
    raise exception 'partner digest % %', sponsor_digest, notices;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', a_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  digest := public.my_weekly_digest();
  notices := public.my_digest_notices();
  set role postgres;
  if jsonb_array_length(digest->'new_members') <> 0 or jsonb_array_length(notices) <> 0 then
    raise exception 'founding member saw a partner issue % %', digest, notices;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', staff_id, 'aal', 'aal2', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  perform public.staff_decide_digest_issue('withdraw');
  set role postgres;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  sponsor_digest := public.my_weekly_digest();
  notices := public.my_digest_notices();
  set role postgres;
  if jsonb_array_length(sponsor_digest->'new_members') <> 0 or jsonb_array_length(notices) <> 0 then
    raise exception 'withdraw left the partner notice % %', sponsor_digest, notices;
  end if;
end
$checks$;
`

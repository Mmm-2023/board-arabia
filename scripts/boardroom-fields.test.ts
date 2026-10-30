import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  ADMIN_SEAT_MATCHES_OFF,
  ADMIN_SEAT_MATCHES_ON,
  adminSeatMatchState,
  applicationWhereOffer,
  BOARD_EXPERTISE,
  BOARD_ORG_TYPES,
  BOARD_ROLE_TITLES,
  BOARD_SEAT_TYPES,
  BOARD_SEAT_WHERE,
  BOARD_SEAT_MATCHES_LABEL,
  boardSeatFieldsForCompleteness,
  boardSeatMatchesOn,
  MAX_BOARD_EXPERTISE,
  MAX_BOARD_ROLES,
  organisationProblem,
  parseBoardroomRecord,
  presentBoardroomCard,
} from '../src/lib/boardroom.ts'
import { presentDirectoryCard } from '../src/lib/demoRows.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20270108120000_boardroom_fields.sql'

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function sqlList(sql: string, name: string) {
  const body = sql.split(`function private.${name}()`)[1] ?? ''
  const array = body.split('as $$')[1]?.split('$$;')[0] ?? ''
  return [...array.matchAll(/'((?:[^']|'')*)'/g)].map((match) => match[1].replaceAll("''", "'"))
}

const migration = read(`supabase/migrations/${migrationName}`)

test('boardroom migration slot, lists, and security text', () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.equal(names.includes(migrationName), true)
  assert.ok(names.indexOf(migrationName) > names.indexOf('20270107120000_staff_list_profiles.sql'))
  assert.match(migration, /private\.board_seat_match_fields\(m\.user_id\)/)
  assert.equal(/search_path\s*=\s*public/i.test(migration), false)
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)
  assert.equal(/to anon/i.test(migration), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(migration), false)
  assert.equal(/nammco/i.test(migration), false)
  assert.equal(migration.toLowerCase().includes('the desk'), false)
  assert.equal(/alter table public\.re_board_roles/i.test(migration), false)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /force row level security/)
  assert.match(migration, /revoke all on table public\.profile_board_roles from public, anon, authenticated, service_role/)
  assert.match(migration, /revoke all on table public\.profile_boardroom from public, anon, authenticated, service_role/)
  assert.equal(/grant\s+(select|insert|update|delete|all)[^;]*profile_board_roles/i.test(migration), false)
  assert.equal(/grant\s+(select|insert|update|delete|all)[^;]*profile_boardroom/i.test(migration), false)
  assert.match(migration, /grant execute on function public\.get_my_boardroom\(\) to authenticated/)
  assert.match(migration, /grant execute on function public\.save_my_board_roles\(jsonb\) to authenticated/)
  assert.match(migration, /grant execute on function public\.save_my_board_focus\(boolean, text\[\], text\[\], text\[\]\) to authenticated/)
  assert.match(migration, /v_user is null or private\.is_staff\(\)/)
  assert.match(migration, /private\.member_boardroom_card\(m\.user_id\)/)
  assert.deepEqual(sqlList(migration, 'board_role_titles'), [...BOARD_ROLE_TITLES])
  assert.deepEqual(sqlList(migration, 'board_org_types'), [...BOARD_ORG_TYPES])
  assert.deepEqual(sqlList(migration, 'board_seat_types'), [...BOARD_SEAT_TYPES])
  assert.deepEqual(sqlList(migration, 'board_seat_where'), [...BOARD_SEAT_WHERE])
  assert.deepEqual(sqlList(migration, 'board_expertise'), [...BOARD_EXPERTISE])
  const headers = migration.split(/create or replace function /i).slice(1).map((chunk) => chunk.slice(0, chunk.indexOf('as $$')))
  assert.ok(headers.length >= 15)
  for (const header of headers) {
    assert.match(header, /security definer/i)
    assert.match(header, /set search_path = ''/)
  }
  const audit = read('scripts/definer-audit.test.ts')
  assert.equal(audit.includes('get_my_boardroom'), false)
  assert.equal(audit.includes('save_my_board_roles'), false)
  assert.equal(audit.includes('save_my_board_focus'), false)
  const inventory = read('scripts/security-view-access.test.ts')
  assert.equal(/staff_boardroom|staff_save_my_board/.test(inventory), false)
})

test('boardroom route stays on the profile page', () => {
  const app = read('src/App.tsx')
  const profile = read('src/pages/dashboard/ProfilePage.tsx')
  const section = read('src/pages/dashboard/BoardroomSection.tsx')
  assert.match(app, /<Route path="\/apply" element={<ApplyPage \/>} \/>/)
  assert.match(app, /<Route path="profile" element={<ProfilePage \/>} \/>/)
  assert.match(profile, /<BoardroomSection/)
  assert.match(section, /id="boardroom"/)
  assert.match(section, /Use what you told us/)
  assert.match(section, /You told us:/)
  assert.match(section, /Add a board role/)
  assert.match(read('src/pages/dashboard/DirectoryBoard.tsx'), /Open to board seats|DirectoryBoardroomFace/)
  assert.match(read('src/pages/dashboard/DirectoryBoardroom.tsx'), /Open to board seats/)
  assert.equal(section.includes('\u2014'), false)
  assert.equal(section.includes('\u2013'), false)
  assert.equal(section.toLowerCase().includes('sponsor'), false)
  assert.equal(section.toLowerCase().includes('the desk'), false)
  assert.equal(/nammco/i.test(section), false)
})

test('client match rules follow open, one seat type, and one where', () => {
  const open = { openToSeats: true, seatTypes: ['Chair' as const], seatWhere: ['Saudi Arabia' as const] }
  assert.equal(boardSeatMatchesOn(open), true)
  assert.deepEqual(boardSeatFieldsForCompleteness(open), {
    boardSeatType: 'Chair',
    boardSeatWhere: 'Saudi Arabia',
  })
  assert.equal(boardSeatMatchesOn({ openToSeats: true, seatTypes: ['Chair'], seatWhere: [] }), false)
  assert.equal(boardSeatMatchesOn({ openToSeats: true, seatTypes: [], seatWhere: ['GCC'] }), false)
  assert.equal(boardSeatMatchesOn({ openToSeats: false, seatTypes: ['Chair'], seatWhere: ['GCC'] }), false)
  assert.equal(adminSeatMatchState('Chair', 'Saudi Arabia'), true)
  assert.equal(adminSeatMatchState('', 'Saudi Arabia'), false)
  assert.equal(adminSeatMatchState(null, null), null)
  const fields = boardSeatFieldsForCompleteness(open)
  assert.equal(adminSeatMatchState(fields.boardSeatType, fields.boardSeatWhere), boardSeatMatchesOn(open))
  assert.equal(MAX_BOARD_ROLES, 5)
  assert.equal(MAX_BOARD_EXPERTISE, 5)
  assert.equal(organisationProblem('Example Holdings'), '')
  assert.equal(organisationProblem('Vision 2024'), '')
  assert.equal(organisationProblem('person@example.com'), 'contact')
  assert.equal(organisationProblem('+966500000000'), 'contact')
  assert.equal(organisationProblem('0500000000'), 'contact')
  assert.equal(organisationProblem(''), 'empty')
  assert.equal(organisationProblem('x'.repeat(121)), 'long')
  assert.deepEqual(applicationWhereOffer('ksa_gcc').where, ['Saudi Arabia', 'GCC'])
  assert.deepEqual(applicationWhereOffer('intl').where, ['International'])
  assert.match(applicationWhereOffer('ksa_gcc').line, /Saudi Arabia and GCC/)
  assert.match(BOARD_SEAT_MATCHES_LABEL, /Board seat matches on/)
  assert.equal(ADMIN_SEAT_MATCHES_ON, 'Seat matches on')
  assert.equal(ADMIN_SEAT_MATCHES_OFF, 'Seat matches off')
})

test('directory card drops contact text and keeps permitted board fields', () => {
  const card = presentDirectoryCard({
    id: 'a1000001-0000-4000-8000-000000000009',
    is_demo: false,
    full_name: 'Example Member',
    seat: 'ksa',
    board_roles: [
      { role: 'Chair', org_type: 'Private', organisation: 'Example Holdings' },
      { role: 'Chair', org_type: 'Private', organisation: 'person@example.com' },
      { role: 'Chief', org_type: 'Private', organisation: 'Example House' },
      { role: 'Adviser', org_type: 'Listed', organisation: 'Second House' },
      { role: 'Adviser', org_type: 'Listed', organisation: 'Third House' },
      { role: 'Adviser', org_type: 'Listed', organisation: 'Fourth House' },
      { role: 'Adviser', org_type: 'Listed', organisation: 'Fifth House' },
      { role: 'Adviser', org_type: 'Listed', organisation: 'Sixth House' },
    ],
    open_to_board_seats: true,
    seat_types: ['Committee: Audit', 'Nope'],
    seat_where: ['GCC'],
    expertise: ['Governance', 'Governance', 'Not a topic'],
    email: 'person@example.com',
    phone: '+10000000000',
  })
  assert.ok(card)
  assert.equal(card.board_roles?.some((role) => role.organisation.includes('@')), false)
  assert.equal(card.board_roles?.some((role) => role.role === 'Chief'), false)
  assert.equal(card.board_roles?.length, 5)
  assert.deepEqual(card.seat_types, ['Committee: Audit'])
  assert.deepEqual(card.seat_where, ['GCC'])
  assert.deepEqual(card.expertise, ['Governance'])
  assert.equal('email' in card, false)
  const closed = presentBoardroomCard({
    open_to_board_seats: false,
    seat_types: ['Chair'],
    seat_where: ['International'],
    expertise: ['Strategy'],
  })
  assert.deepEqual(closed.seat_types, [])
  assert.deepEqual(closed.seat_where, [])
  assert.deepEqual(closed.expertise, ['Strategy'])
  const record = parseBoardroomRecord({
    roles: [{ organisation: 'Example Holdings', role: 'Chair', org_type: 'Private' }],
    open_to_seats: true,
    seat_types: ['Adviser'],
    seat_where: ['International'],
    expertise: ['ESG'],
    application_region: 'intl',
    application_board_seats: 'Example Holdings, chair',
  })
  assert.equal(record?.applicationRegion, 'intl')
  assert.equal(record?.applicationBoardSeats, 'Example Holdings, chair')
  assert.equal(record?.roles[0]?.organisation, 'Example Holdings')
})

test('boardroom section, card, and admin chip keep the fixed copy', () => {
  const section = read('src/pages/dashboard/BoardroomSection.tsx')
  const face = read('src/pages/dashboard/DirectoryBoardroom.tsx')
  const chip = read('src/pages/admin/SeatMatchChip.tsx')
  const profile = read('src/pages/dashboard/ProfilePage.tsx')
  assert.match(section, /No board roles yet/)
  assert.match(section, /Add a board role/)
  assert.match(section, /Use what you told us/)
  assert.match(section, /You told us:/)
  assert.match(section, /Open to new seats/)
  assert.match(section, /min-h-12/)
  assert.match(face, /\{role\.role\}, \{role\.orgType\}, \{role\.organisation\}/)
  assert.match(face, /Open to board seats/)
  assert.match(face, /Seat types/)
  assert.match(face, /Where/)
  assert.match(chip, /adminSeatMatchLabel/)
  assert.match(profile, /boardSeatType: seatFields.boardSeatType/)
  assert.match(read('src/lib/profileCompleteness.ts'), /BOARD_SEAT_LABEL/)
  for (const text of [section, face, chip]) {
    assert.equal(text.includes('\u2014'), false, 'em dash')
    assert.equal(text.includes('\u2013'), false, 'en dash')
    assert.equal(/nammco/i.test(text), false)
    assert.equal(text.toLowerCase().includes('the desk'), false)
    assert.equal(text.toLowerCase().includes('sponsor'), false)
  }
})

test('boardroom writes are owner only and directory hides private cards', { timeout: 300_000 }, () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-pf6-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_pf6_${process.pid}`
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
do $pf6$
declare
  member_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  hidden_id uuid := gen_random_uuid();
  partner_id uuid := gen_random_uuid();
  staff_id uuid := gen_random_uuid();
  listed jsonb;
  card jsonb;
  mine jsonb;
  match jsonb;
  priv text;
  bad text;
begin
  select string_agg(p.proname, ', ' order by p.proname)
    into bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.proname in (
    'board_role_titles', 'board_org_types', 'board_seat_types', 'board_seat_where',
    'board_expertise', 'board_org_ok', 'text_list_ok', 'assert_boardroom_owner',
    'member_boardroom_card', 'demo_boardroom_card', 'board_seat_match_fields',
    'touch_profile_updated', 'get_my_boardroom', 'save_my_board_roles',
    'save_my_board_focus', 'list_directory'
  )
    and (
      p.prosecdef is not true
      or not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
        where cfg = 'search_path=""'
      )
    );
  if bad is not null then
    raise exception 'boardroom function search_path or definer: %', bad;
  end if;

  foreach priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE']
  loop
    if has_table_privilege('anon', 'public.profile_board_roles', priv)
       or has_table_privilege('authenticated', 'public.profile_board_roles', priv)
       or has_table_privilege('anon', 'public.profile_boardroom', priv)
       or has_table_privilege('authenticated', 'public.profile_boardroom', priv)
    then
      raise exception 'boardroom table grant %', priv;
    end if;
  end loop;

  if not (
    select c.relrowsecurity and c.relforcerowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'profile_board_roles'
  ) or not (
    select c.relrowsecurity and c.relforcerowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'profile_boardroom'
  ) then
    raise exception 'boardroom rls is not forced';
  end if;

  if has_function_privilege('anon', 'public.get_my_boardroom()', 'execute')
     or has_function_privilege('anon', 'public.save_my_board_roles(jsonb)', 'execute')
     or has_function_privilege('anon', 'public.save_my_board_focus(boolean, text[], text[], text[])', 'execute')
     or has_function_privilege('authenticated', 'private.board_org_ok(text)', 'execute')
     or has_function_privilege('anon', 'private.board_seat_match_fields(uuid)', 'execute')
  then
    raise exception 'boardroom execute grant leaked';
  end if;

  if private.board_org_ok('Example Holdings') is not true
     or private.board_org_ok('Vision 2024') is not true
     or private.board_org_ok('person@example.com')
     or private.board_org_ok('+966500000000')
     or private.board_org_ok('0500000000')
     or private.board_org_ok('  Example Holdings')
  then
    raise exception 'organisation check drifted';
  end if;
  if (private.demo_boardroom_card(1) -> 'board_roles' -> 0 ->> 'organisation') is distinct from 'Example Holdings'
     or (private.demo_boardroom_card(2) ->> 'open_to_board_seats') is distinct from 'false'
  then
    raise exception 'demo card drifted';
  end if;

  insert into auth.users (id, email) values
    (member_id, 'member.pf6@example.com'),
    (other_id, 'other.pf6@example.com'),
    (hidden_id, 'hidden.pf6@example.com'),
    (partner_id, 'partner.pf6@example.com'),
    (staff_id, 'staff.pf6@example.com');
  insert into public.members (user_id, email, seat, status, must_set_password, tiers, directory_hidden) values
    (member_id, 'member.pf6@example.com', 'ksa', 'active', false, array['member']::text[], false),
    (other_id, 'other.pf6@example.com', 'ksa', 'active', false, array['member']::text[], false),
    (hidden_id, 'hidden.pf6@example.com', 'ksa', 'active', false, array['member']::text[], true),
    (partner_id, 'partner.pf6@example.com', 'sponsor', 'active', false, array['member', 'sponsor']::text[], false);
  insert into public.staff_users (user_id, email, role)
  values (staff_id, 'staff.pf6@example.com', 'staff');
  insert into public.profiles (user_id, full_name, headline, company, location) values
    (member_id, 'Visible Member', 'Chair', 'Example House', 'Riyadh'),
    (other_id, 'Other Member', 'Director', 'Example House', 'Jeddah'),
    (hidden_id, 'Hidden Member', 'Chair', 'Example House', 'Dammam'),
    (partner_id, 'Partner Example', 'Partner', 'Example House', 'Riyadh');
  insert into public.member_application_answers (member_id, region, board_seats)
  values (member_id, 'ksa_gcc', 'Example Holdings, chair');

  perform set_config('request.jwt.claims', json_build_object('sub', member_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set role authenticated;
  begin
    perform public.save_my_board_roles(jsonb_build_array(jsonb_build_object(
      'organisation', 'Example Holdings', 'role', 'Chief', 'org_type', 'Private'
    )));
    raise exception 'invalid role was stored';
  exception
    when invalid_parameter_value then
      if sqlerrm not like '%boardroom_invalid%' then
        raise exception 'invalid role error %', sqlerrm;
      end if;
  end;
  begin
    perform public.save_my_board_roles(jsonb_build_array(
      jsonb_build_object('organisation', 'person@example.com', 'role', 'Chair', 'org_type', 'Private')
    ));
    raise exception 'email organisation was stored';
  exception
    when check_violation then
      if sqlerrm not like '%boardroom_contact%' then
        raise exception 'contact error %', sqlerrm;
      end if;
  end;
  begin
    perform public.save_my_board_roles((
      select jsonb_agg(jsonb_build_object(
        'organisation', 'House ' || g::text,
        'role', 'Chair',
        'org_type', 'Private'
      ))
      from generate_series(1, 6) g
    ));
    raise exception 'sixth role was stored';
  exception
    when invalid_parameter_value then
      if sqlerrm not like '%boardroom_limit%' then
        raise exception 'limit error %', sqlerrm;
      end if;
  end;
  perform public.save_my_board_roles(jsonb_build_array(jsonb_build_object(
    'organisation', 'Visible Holdings', 'role', 'Chair', 'org_type', 'Private'
  )));
  perform public.save_my_board_focus(
    false,
    array['Chair']::text[],
    array['GCC']::text[],
    array['Strategy']::text[]
  );
  perform public.save_my_board_focus(
    true,
    array['Independent director']::text[],
    array['Saudi Arabia', 'GCC']::text[],
    array['Governance']::text[]
  );
  begin
    perform public.save_my_board_focus(
      true,
      array['Independent director']::text[],
      array['Saudi Arabia']::text[],
      array['Governance', 'Strategy', 'ESG', 'Turnaround', 'M&A', 'Audit and risk']::text[]
    );
    raise exception 'sixth expertise was stored';
  exception
    when invalid_parameter_value then
      if sqlerrm not like '%boardroom_limit%' then
        raise exception 'expertise limit %', sqlerrm;
      end if;
  end;

  mine := public.get_my_boardroom();
  if mine ->> 'application_region' is distinct from 'ksa_gcc'
     or mine ->> 'application_board_seats' is distinct from 'Example Holdings, chair'
     or mine ->> 'open_to_seats' is distinct from 'true'
     or mine -> 'roles' -> 0 ->> 'organisation' is distinct from 'Visible Holdings'
  then
    raise exception 'owner boardroom %', mine;
  end if;
  if mine::text like '%@example.com%' then
    raise exception 'owner payload has an email';
  end if;
  perform public.dismiss_my_application_answer('board_seats');
  mine := public.get_my_boardroom();
  if mine ? 'application_board_seats' and mine ->> 'application_board_seats' is not null then
    raise exception 'dismissed board seats still returned %', mine;
  end if;

  listed := public.list_directory();
  if listed::text like '%Hidden Holdings%' or listed::text like '%hidden.pf6@example.com%' then
    raise exception 'hidden or email leaked %', listed;
  end if;
  select item into card
  from jsonb_array_elements(listed) item
  where item ->> 'full_name' = 'Visible Member';
  if card is null
     or card -> 'board_roles' -> 0 ->> 'organisation' is distinct from 'Visible Holdings'
     or card ->> 'open_to_board_seats' is distinct from 'true'
     or card -> 'seat_types' ->> 0 is distinct from 'Independent director'
     or card -> 'seat_where' ->> 0 is distinct from 'Saudi Arabia'
     or card -> 'expertise' ->> 0 is distinct from 'Governance'
     or card ? 'email'
     or card ? 'phone'
     or card ? 'application_board_seats'
     or card ? 'turnover'
     or card ? 'turnover_usd'
  then
    raise exception 'visible card %', card;
  end if;

  set role postgres;
  update public.profiles set bio = 'Hidden about line' where user_id = hidden_id;
  insert into public.profile_board_roles (user_id, organisation, role, org_type, position)
  values (hidden_id, 'Hidden Holdings', 'Adviser', 'Listed', 1);

  perform set_config('request.jwt.claims', json_build_object('sub', other_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set role authenticated;
  perform public.save_my_board_roles(jsonb_build_array(jsonb_build_object(
    'organisation', 'Other Holdings', 'role', 'Adviser', 'org_type', 'Non-profit'
  )));
  listed := public.list_directory();
  if listed::text like '%Hidden Holdings%' then
    raise exception 'other member saw a hidden board';
  end if;
  if listed::text not like '%Visible Holdings%' then
    raise exception 'other member missed a visible board';
  end if;

  set role postgres;
  if exists (
    select 1 from public.profile_board_roles r
    where r.user_id = member_id and r.organisation is distinct from 'Visible Holdings'
  ) then
    raise exception 'other member rewrote the first board';
  end if;
  select private.board_seat_match_fields(member_id) into match;
  if match ->> 'board_seat_type' is distinct from 'Independent director'
     or match ->> 'board_seat_where' is distinct from 'Saudi Arabia'
  then
    raise exception 'match fields %', match;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', partner_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set role authenticated;
  listed := public.list_directory();
  if listed::text like '%Visible Holdings%' or listed::text like '%Hidden Holdings%' then
    raise exception 'partner saw a board without opt-in';
  end if;
  set role postgres;
  update public.members set show_card_to_sponsors = true where user_id = member_id;
  perform set_config('request.jwt.claims', json_build_object('sub', partner_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set role authenticated;
  listed := public.list_directory();
  if listed::text not like '%Visible Holdings%' or listed::text like '%Hidden Holdings%' then
    raise exception 'partner opt-in board view changed %', listed;
  end if;

  set role postgres;
  perform set_config('request.jwt.claims', json_build_object('sub', staff_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set role authenticated;
  begin
    perform public.save_my_board_roles('[]'::jsonb);
    raise exception 'staff wrote board roles';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%not_allowed%' then
        raise exception 'staff error %', sqlerrm;
      end if;
  end;
  listed := public.list_directory();
  if listed::text not like '%Visible Holdings%' or listed::text like '%staff.pf6@example.com%' then
    raise exception 'staff directory %', listed;
  end if;
  listed := public.staff_list_profiles();
  select item into card
  from jsonb_array_elements(listed) item
  where item ->> 'member_id' = member_id::text;
  if card is null
     or card ->> 'board_seat_type' is distinct from 'Independent director'
     or card ->> 'board_seat_where' is distinct from 'Saudi Arabia'
     or card ? 'email'
     or card ? 'phone'
  then
    raise exception 'staff profile list %', card;
  end if;

  set role anon;
  begin
    perform public.get_my_boardroom();
    raise exception 'anon read boardroom';
  exception
    when insufficient_privilege then
      if sqlerrm ilike '%not_allowed%' then
        raise exception 'anon reached the function body';
      end if;
  end;
  set role postgres;
end
$pf6$;
`

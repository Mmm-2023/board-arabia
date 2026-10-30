import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { presentDirectoryCard } from '../src/lib/demoRows.ts'
import { reasonsAction } from '../src/lib/profileCompleteness.ts'
import { directoryLanguageLine, matchingAsks } from '../src/lib/focusCard.ts'
import {
  CAN_HELP_WITH,
  FOCUS_CHIP_WEIGHT,
  FOCUS_LINE_MAX,
  LANGUAGES,
  LOOKING_FOR,
  LOOKING_FOR_TO_HELP,
  allowedChips,
  focusLineProblem,
  focusMatchReason,
  matchedHelpChips,
  suggestedVisionThemes,
} from '../supabase/functions/_shared/focus_fields.ts'
import {
  WEEKLY_INTRO_SUGGESTION_CAP,
  planIntroWeek,
  type PlanMember,
} from '../supabase/functions/_shared/suggest_intros.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20270109120000_focus_fields.sql'

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function sqlList(sql: string, name: string) {
  const body = sql.split(`function private.${name}()`)[1] ?? ''
  const array = body.split('as $$')[1]?.split('$$;')[0] ?? ''
  return [...array.matchAll(/'((?:[^']|'')*)'/g)].map((match) => match[1].replaceAll("''", "'"))
}

const migration = read(`supabase/migrations/${migrationName}`)
const NOW = new Date('2026-09-30T12:00:00.000Z')

function member(id: string, patch: Partial<PlanMember> = {}): PlanMember {
  return {
    id,
    email: `${id}@example.com`,
    status: 'active',
    seat: 'ksa',
    isDemo: false,
    fullName: id,
    sectorTags: ['Health'],
    visionThemes: [],
    region: '',
    cityKey: '',
    sample: false,
    directoryHidden: false,
    ...patch,
  }
}

function week(members: PlanMember[]) {
  return planIntroWeek({
    now: NOW,
    members,
    intros: [],
    priorSuggestions: [],
    membersWithCurrentWeek: [],
  }).suggestions
}

test('focus migration slot, lists, and security text', () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.equal(names.at(-1), '20270113120000_seat_matching.sql')
  assert.ok(names.includes(migrationName))
  assert.ok(names.indexOf(migrationName) > names.indexOf('20270108120000_boardroom_fields.sql'))
  assert.ok(names.indexOf(migrationName) < names.indexOf('20270110120000_majlis_reminder_windows.sql'))
  assert.equal(/search_path\s*=\s*public/i.test(migration), false)
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)
  assert.equal(/to anon/i.test(migration), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(migration), false)
  assert.equal(/nammco/i.test(migration), false)
  assert.equal(migration.toLowerCase().includes('the desk'), false)
  assert.match(migration, /profiles_update_own/)
  assert.equal(migration.includes('create policy'), false)
  assert.match(migration, /private\.text_list_ok\(can_help_with, private\.focus_can_help\(\), 3\)/)
  assert.match(migration, /private\.text_list_ok\(looking_for, private\.focus_looking_for\(\), 3\)/)
  assert.match(migration, /private\.text_list_ok\(languages, private\.focus_languages\(\), 6\)/)
  assert.match(migration, /private\.focus_line_ok\(can_help_line\)/)
  assert.match(migration, /private\.focus_line_ok\(looking_for_line\)/)
  assert.equal(/grant update \(can_help_with/.test(migration), false)
  assert.match(migration, /grant select \(can_help_with, can_help_line, looking_for, looking_for_line, languages\)/)
  assert.match(migration, /grant execute on function public\.save_my_focus\(text\[\], text, text\[\], text, text\[\]\) to authenticated/)
  assert.match(migration, /v_user is null or private\.is_staff\(\)/)
  assert.match(migration, /private\.member_focus_card\(m\.user_id\)/)
  assert.match(migration, /private\.caller_sees_member_card\(m\.user_id\)/)
  assert.equal(/p\.phone/.test(migration), false)
  assert.equal(/p\.email/.test(migration), false)
  assert.equal(/'turnover'/.test(migration), false)
  assert.deepEqual(sqlList(migration, 'focus_can_help'), [...CAN_HELP_WITH])
  assert.deepEqual(sqlList(migration, 'focus_looking_for'), [...LOOKING_FOR])
  assert.deepEqual(sqlList(migration, 'focus_languages'), [...LANGUAGES])
  const headers = migration.split(/create or replace function /i).slice(1).map((chunk) => chunk.slice(0, chunk.indexOf('as $$')))
  assert.ok(headers.length >= 8)
  for (const header of headers) {
    assert.match(header, /security definer/i)
    assert.match(header, /set search_path = ''/)
  }
  assert.equal(read('scripts/definer-audit.test.ts').includes('focus_can_help'), false)
  assert.equal(read('scripts/definer-audit.test.ts').includes('member_focus_card'), false)
  assert.equal(read('scripts/security-view-access.test.ts').includes('staff_focus'), false)
  assert.match(read('src/pages/dashboard/ProfilePage.tsx'), /helpWith: canHelp\[0\] \?\? ''/)
  assert.match(read('src/pages/dashboard/ProfilePage.tsx'), /lookingFor: lookingFor\[0\] \?\? ''/)
  assert.equal(read('src/pages/dashboard/ProfilePage.tsx').includes('helpWith: canHelpLine'), false)
  assert.equal(read('supabase/functions/suggest-intros/index.ts').includes('can_help_line'), false)
  assert.equal(read('supabase/functions/suggest-intros/index.ts').includes('looking_for_line'), false)
  assert.match(read('supabase/functions/suggest-intros/index.ts'), /can_help_with, looking_for/)
})

test('lines reject email and phone patterns and chips stay on the allowlist', () => {
  assert.equal(focusLineProblem(''), '')
  assert.equal(focusLineProblem('   '), '')
  assert.equal(focusLineProblem('Example. Introductions to operators in this sector.'), '')
  assert.equal(focusLineProblem('Opened in 2019.'), '')
  assert.match(focusLineProblem('ada@example.com'), /email or a phone/)
  assert.match(focusLineProblem('Write to ada@example.com today'), /email or a phone/)
  assert.match(focusLineProblem('+966555000000'), /email or a phone/)
  assert.match(focusLineProblem('555 121 1234'), /email or a phone/)
  assert.match(focusLineProblem('x'.repeat(FOCUS_LINE_MAX + 1)), /140/)
  assert.deepEqual(allowedChips(['Deal introductions', 'not a chip', 'Deal introductions'], CAN_HELP_WITH), [
    'Deal introductions',
  ])
  assert.deepEqual(allowedChips(['English', 'Klingon'], LANGUAGES, LANGUAGES.length), ['English'])
  assert.deepEqual(suggestedVisionThemes(['Real estate', 'Health']), ['Housing', 'Health transformation'])
  assert.equal(LOOKING_FOR_TO_HELP['Deal flow'], 'Deal introductions')
  assert.equal(LOOKING_FOR_TO_HELP['Capital for my company'], 'Co-investment')
  assert.deepEqual(matchedHelpChips(['Deal flow', 'Board seat'], ['Board experience', 'Deal introductions']), [
    'Deal introductions',
    'Board experience',
  ])
  assert.deepEqual(matchedHelpChips(['Deal flow'], ['please email ada@example.com']), [])
  assert.equal(focusMatchReason('Deal introductions'), 'They can help with deal introductions, which you are looking for.')
  assert.equal(focusMatchReason('GCC partners'), 'They can help with GCC partners, which you are looking for.')
  assert.equal(FOCUS_CHIP_WEIGHT, 1)
  assert.equal(reasonsAction(2), 'Pick 1 in each group')
  assert.equal(reasonsAction(1), 'Pick 1 more')
  assert.equal(reasonsAction(0), '')
  assert.equal(directoryLanguageLine(['English', 'Arabic']), 'Languages English, Arabic')
  assert.equal(
    directoryLanguageLine(['English', 'Arabic', 'French', 'Urdu', 'Hindi']),
    'Languages English, Arabic, French +2 more',
  )
  assert.deepEqual(matchingAsks(['Deal flow', 'Board seat'], ['Deal introductions']), ['Deal flow'])
})

test('a chip match ranks above no match at equal sectors and the reason is exact', () => {
  const planner = read('supabase/functions/_shared/suggest_intros.ts')
  assert.equal(/from ['"]https?:/.test(planner), false)
  assert.equal(planner.includes('fetch('), false)
  assert.equal(planner.includes('can_help_line'), false)
  assert.equal(planner.includes('looking_for_line'), false)
  assert.equal(WEEKLY_INTRO_SUGGESTION_CAP, 2)

  const viewer = member('viewer', { lookingFor: ['Deal flow'] })
  const match = member('match', { canHelpWith: ['Deal introductions'] })
  const plain = member('plain', { canHelpWith: ['Board experience'] })
  const ranked = week([viewer, match, plain]).filter((row) => row.memberId === 'viewer')
  assert.equal(ranked[0]?.suggestedId, 'match')
  assert.equal(ranked[0]?.reason, 'They can help with deal introductions, which you are looking for.')
  assert.equal(ranked[1]?.suggestedId, 'plain')
  assert.equal(ranked[1]?.reason, 'Both work on health.')
  assert.equal(ranked.some((row) => row.reason.includes('@')), false)

  const sectorFirst = week([
    viewer,
    member('sector', { canHelpWith: [] }),
    member('chip', { sectorTags: [], canHelpWith: ['Deal introductions'] }),
  ]).filter((row) => row.memberId === 'viewer')
  assert.equal(sectorFirst[0]?.suggestedId, 'sector')
  assert.equal(sectorFirst[1]?.suggestedId, 'chip')
  assert.equal(sectorFirst[1]?.reason, 'They can help with deal introductions, which you are looking for.')

  const junk = week([
    viewer,
    member('bad', { canHelpWith: ['ada@example.com'] }),
  ]).find((row) => row.suggestedId === 'bad')
  assert.equal(junk?.reason, 'Both work on health.')
  assert.equal(junk?.reason.includes('@'), false)

  const many = week([
    member('viewer', { sectorTags: [], lookingFor: ['Deal flow'] }),
    member('a', { sectorTags: [], canHelpWith: ['Deal introductions'] }),
    member('b', { sectorTags: [], canHelpWith: ['Deal introductions'] }),
    member('c', { sectorTags: [], canHelpWith: ['Deal introductions'] }),
    member('d', { sectorTags: [], canHelpWith: ['Deal introductions'] }),
  ]).filter((row) => row.memberId === 'viewer')
  assert.equal(many.length, WEEKLY_INTRO_SUGGESTION_CAP)
  assert.equal(many.every((row) => row.reason === 'They can help with deal introductions, which you are looking for.'), true)

  const hidden = week([
    viewer,
    member('hidden', { directoryHidden: true, canHelpWith: ['Deal introductions'] }),
    plain,
  ])
  assert.equal(hidden.some((row) => row.suggestedId === 'hidden'), false)
})

test('directory cards keep chips and drop contact lines', () => {
  const card = presentDirectoryCard({
    id: 'a1000001-0000-4000-8000-000000000009',
    full_name: 'Example Member',
    seat: 'ksa',
    can_help_with: ['Deal introductions', 'not a chip'],
    looking_for: ['Board seat'],
    can_help_line: 'ada@example.com',
    looking_for_line: 'Example. A board seat with a family company.',
    languages: ['English', 'Klingon'],
    email: 'ada@example.com',
    phone: '+10000000000',
    turnover: '1000000',
  })
  assert.ok(card)
  assert.deepEqual(card.can_help_with, ['Deal introductions'])
  assert.deepEqual(card.looking_for, ['Board seat'])
  assert.equal(card.can_help_line, '')
  assert.equal(card.looking_for_line, 'Example. A board seat with a family company.')
  assert.deepEqual(card.languages, ['English'])
  assert.equal('email' in card, false)
  assert.equal('phone' in card, false)
  assert.equal('turnover' in card, false)
})

const assertSql = `
do $pf7$
declare
  member_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  hidden_id uuid := gen_random_uuid();
  staff_id uuid := gen_random_uuid();
  listed jsonb;
  card jsonb;
begin
  if private.focus_line_ok('Example. Introductions to operators in this sector.') is not true
     or private.focus_line_ok('Opened in 2019.') is not true
     or private.focus_line_ok('ada@example.com')
     or private.focus_line_ok('Write to ada@example.com today')
     or private.focus_line_ok('+966555000000')
     or private.focus_line_ok('555 121 1234')
     or private.focus_line_ok(repeat('a', 141))
  then
    raise exception 'line check drifted';
  end if;

  if has_function_privilege('anon', 'private.focus_can_help()', 'execute')
     or has_function_privilege('anon', 'private.focus_line_ok(text)', 'execute')
     or has_function_privilege('anon', 'private.member_focus_card(uuid)', 'execute')
     or has_function_privilege('authenticated', 'private.focus_line_ok(text)', 'execute')
     or has_column_privilege('anon', 'public.profiles', 'can_help_with', 'update')
     or has_column_privilege('anon', 'public.profiles', 'can_help_line', 'select')
  then
    raise exception 'focus grant leaked';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'can_help_with', 'update')
     or not has_column_privilege('authenticated', 'public.profiles', 'looking_for_line', 'select')
     or has_function_privilege('anon', 'public.save_my_focus(text[], text, text[], text, text[])', 'execute')
     or not has_function_privilege('authenticated', 'public.save_my_focus(text[], text, text[], text, text[])', 'execute')
  then
    raise exception 'focus privileges drifted';
  end if;

  insert into auth.users (id, email) values
    (member_id, 'member.pf7@example.com'),
    (other_id, 'other.pf7@example.com'),
    (hidden_id, 'hidden.pf7@example.com'),
    (staff_id, 'staff.pf7@example.com');
  insert into public.members (user_id, email, seat, status, must_set_password, tiers, directory_hidden) values
    (member_id, 'member.pf7@example.com', 'ksa', 'active', false, array['member']::text[], false),
    (other_id, 'other.pf7@example.com', 'ksa', 'active', false, array['member']::text[], false),
    (hidden_id, 'hidden.pf7@example.com', 'ksa', 'active', false, array['member']::text[], true);
  insert into public.staff_users (user_id, email, role)
  values (staff_id, 'staff.pf7@example.com', 'staff');
  insert into public.profiles (user_id, full_name, headline, company, location) values
    (member_id, 'Visible Member', 'Chair', 'Example House', 'Riyadh'),
    (other_id, 'Other Member', 'Director', 'Example House', 'Jeddah'),
    (hidden_id, 'Hidden Member', 'Chair', 'Example House', 'Dammam');

  update public.profiles
  set can_help_line = 'Hidden secret line',
      can_help_with = array['Board experience']
  where user_id = hidden_id;

  perform set_config('request.jwt.claims', json_build_object('sub', member_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set role authenticated;
  perform public.save_my_focus(
    array['Deal introductions', 'Board experience'],
    'Example. Introductions to operators in this sector.',
    array['Deal flow'],
    'Example. A board seat with a family company.',
    array['English', 'Arabic']
  );

  begin
    perform public.save_my_focus(
      array['Board experience', 'Co-investment', 'Deal introductions', 'GCC partners'],
      null,
      '{}'::text[],
      null,
      '{}'::text[]
    );
    raise exception 'fourth chip stored';
  exception
    when invalid_parameter_value then
      if sqlerrm not like '%focus_limit%' then
        raise exception 'limit error %', sqlerrm;
      end if;
  end;
  begin
    perform public.save_my_focus(
      array['Deal introductions'],
      'ada@example.com',
      '{}'::text[],
      null,
      '{}'::text[]
    );
    raise exception 'email line stored';
  exception
    when check_violation then
      if sqlerrm not like '%focus_contact%' then
        raise exception 'contact error %', sqlerrm;
      end if;
  end;
  begin
    update public.profiles
    set can_help_line = 'Direct line'
    where user_id = member_id;
    raise exception 'direct column update stored';
  exception
    when insufficient_privilege then
      null;
  end;

  set role postgres;
  perform set_config('request.jwt.claims', json_build_object('sub', other_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set role authenticated;
  perform public.save_my_focus(
    array['Board experience'],
    'Other line',
    '{}'::text[],
    null,
    '{}'::text[]
  );

  set role postgres;
  perform set_config('request.jwt.claims', json_build_object('sub', member_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set role authenticated;
  listed := public.list_directory();
  if listed::text like '%Hidden secret line%'
     or listed::text like '%@%'
  then
    raise exception 'directory leaked %', listed;
  end if;
  select item into card
  from jsonb_array_elements(listed) item
  where item ->> 'full_name' = 'Visible Member';
  if card is null
     or card -> 'can_help_with' ->> 0 is distinct from 'Deal introductions'
     or card -> 'looking_for' ->> 0 is distinct from 'Deal flow'
     or card ->> 'can_help_line' is distinct from 'Example. Introductions to operators in this sector.'
     or card ->> 'looking_for_line' is distinct from 'Example. A board seat with a family company.'
     or card -> 'languages' ->> 0 is distinct from 'English'
     or card ? 'email'
     or card ? 'phone'
     or card ? 'turnover'
     or card ? 'turnover_usd'
     or card ? 'linkedin_url'
     or card ? 'calendar_url'
  then
    raise exception 'visible focus card %', card;
  end if;

  set role postgres;
  perform set_config('request.jwt.claims', json_build_object('sub', staff_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set role authenticated;
  begin
    perform public.save_my_focus('{}'::text[], null, '{}'::text[], null, '{}'::text[]);
    raise exception 'staff wrote focus';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%not_allowed%' then
        raise exception 'staff error %', sqlerrm;
      end if;
  end;
  listed := public.staff_list_profiles();
  select item into card
  from jsonb_array_elements(listed) item
  where item ->> 'member_id' = member_id::text;
  if card is null
     or card ->> 'help_with' is distinct from 'Deal introductions'
     or card ->> 'looking_for' is distinct from 'Deal flow'
     or card ? 'can_help_line'
     or card ? 'email'
     or card ? 'phone'
  then
    raise exception 'staff focus list %', card;
  end if;
  if listed::text like '%Hidden secret line%' or listed::text like '%@%' then
    raise exception 'staff list leaked a line';
  end if;

  set role anon;
  begin
    update public.profiles set can_help_with = array['Board experience'] where user_id = member_id;
    raise exception 'anon updated focus';
  exception
    when insufficient_privilege then
      null;
  end;
end
$pf7$;
`

test('focus writes are owner only and directory hides private lines', { timeout: 300_000 }, () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-pf7-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_pf7_${process.pid}`
  const stub = read('scripts/definer-audit.test.ts')
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

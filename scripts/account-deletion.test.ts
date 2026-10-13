import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { deletionContact } from '../src/lib/deletionContact.ts'
import { handleDeleteAccount } from '../supabase/functions/delete-candidate-account/handle.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const slot = '20261225120000_member_self_delete.sql'

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function stubSql() {
  const text = readFileSync(path.join(root, 'scripts/definer-audit.test.ts'), 'utf8')
  const marker = 'const stubSql = `'
  const start = text.indexOf(marker)
  assert.ok(start > 0)
  const body = start + marker.length
  const end = text.indexOf('`\n\nconst assertSql', body)
  assert.ok(end > body)
  return text.slice(body, end)
}

const USER = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'
const CAND = '44444444-4444-4444-8444-444444444444'
const STAFF = '55555555-5555-4555-8555-555555555555'
const HASH = 'a'.repeat(64)
const WRONG = 'b'.repeat(64)

function deps(overrides: Partial<Parameters<typeof handleDeleteAccount>[0]> = {}) {
  const calls = {
    issue: 0,
    voided: 0,
    confirmed: 0,
    mailed: 0,
  }
  const input: Parameters<typeof handleDeleteAccount>[0] = {
    userId: USER,
    email: 'member@example.com',
    body: { action: 'send_code' },
    now: () => Date.parse('2026-10-13T12:00:00.000Z'),
    pepper: 'test-pepper',
    issueCode: async () => {
      calls.issue += 1
      return 'ok'
    },
    voidCode: async () => {
      calls.voided += 1
    },
    confirmDelete: async () => {
      calls.confirmed += 1
      return { status: 'ok' }
    },
    sendMail: async () => {
      calls.mailed += 1
      return { ok: true }
    },
    ...overrides,
  }
  return { input, calls }
}

test('public deletion page reads the legal contact and renders nothing when unset', () => {
  const page = read('src/pages/AccountDeletionPage.tsx')
  const privacy = read('src/pages/PrivacyPage.tsx')
  assert.match(page, /legalField\('contactEmail'\)/)
  assert.match(privacy, /to="\/account-deletion"/)
  assert.equal(page.includes('\u2014'), false)
  assert.equal(page.includes('\u2013'), false)
  assert.equal(/the desk/i.test(page), false)
  assert.equal(/\bsponsor/i.test(page), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(page), false)
  assert.equal(deletionContact(''), null)
  assert.equal(deletionContact('To be confirmed'), null)
  assert.equal(deletionContact('privacy@example.com'), 'privacy@example.com')
  const app = read('src/App.tsx')
  assert.match(app, /path="\/account-deletion"/)
  assert.match(app, /path="\/apply" element=\{<ApplyPage/)
  const sql = read(`supabase/migrations/${slot}`)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql), false)
  assert.match(sql, /force row level security/)
  assert.match(sql, /set search_path = ''/)
  assert.match(sql, /private\.is_staff\(\)/)
  assert.match(sql, /revoke all on function public\.confirm_account_delete\(uuid, text\) from public, anon, authenticated/)
  assert.match(sql, /grant execute on function public\.confirm_account_delete\(uuid, text\) to service_role/)
  assert.equal(/\bto anon\b/i.test(sql), false)
  assert.equal(/\bto public\b/i.test(sql), false)
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.equal(names.includes(slot), true)
  assert.ok(names.indexOf(slot) > names.indexOf('20261219120000_operator_row_owner_lock.sql'))
  const covered = names.filter((name) => name <= slot)
  assert.equal(covered.at(-1), slot)
  assert.equal(covered.includes(slot), true)
})

test('delete edge auth refuses anon, staff, and a confirm without a code', async () => {
  const anonDeps = deps({ userId: null })
  const anon = await handleDeleteAccount(anonDeps.input)
  assert.equal(anon.status, 401)
  assert.equal(anonDeps.calls.issue, 0)

  const unconfigured = await handleDeleteAccount({ ...deps().input, pepper: '' })
  assert.equal(unconfigured.status, 503)

  const staffDeps = deps({
    issueCode: async () => 'staff',
  })
  const staff = await handleDeleteAccount(staffDeps.input)
  assert.equal(staff.status, 409)
  assert.equal(staffDeps.calls.mailed, 0)

  const silent = await handleDeleteAccount({ ...deps().input, body: {} })
  assert.equal(silent.status, 400)

  const missingCode = await handleDeleteAccount({
    ...deps().input,
    body: { action: 'confirm' },
  })
  assert.equal(missingCode.status, 400)

  const mismatchDeps = deps()
  mismatchDeps.input.body = { action: 'confirm', code: '000000' }
  mismatchDeps.input.confirmDelete = async () => {
    mismatchDeps.calls.confirmed += 1
    return { status: 'mismatch' }
  }
  const mismatch = await handleDeleteAccount(mismatchDeps.input)
  assert.equal(mismatch.status, 400)
  assert.equal(mismatchDeps.calls.confirmed, 1)

  const mailFail = deps({
    sendMail: async () => ({ ok: false }),
  })
  const failed = await handleDeleteAccount(mailFail.input)
  assert.equal(failed.status, 502)
  assert.equal(mailFail.calls.voided, 1)

  let mailedTo = ''
  const sent = deps({
    sendMail: async (message) => {
      mailedTo = message.to
      assert.match(message.text, /Your code is \d{6}/)
      assert.equal(message.text.includes('member@example.com'), false)
      return { ok: true }
    },
  })
  const okSend = await handleDeleteAccount(sent.input)
  assert.equal(okSend.status, 200)
  assert.equal(mailedTo, 'member@example.com')

  const closed = await handleDeleteAccount({
    ...deps().input,
    body: { action: 'confirm', code: '123456' },
  })
  assert.equal(closed.status, 200)
  assert.deepEqual(closed.body, { ok: true })

  const index = read('supabase/functions/delete-candidate-account/index.ts')
  const config = read('supabase/config.toml')
  assert.match(index, /requireUser\(req\)/)
  assert.match(index, /if \('error' in gate\)/)
  assert.match(config, /\[functions\.delete-candidate-account\]\s+verify_jwt = true/)
})

test('self-delete forces RLS, keeps consent, and blocks anon', { timeout: 180_000 }, () => {
  const names = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql') && name <= slot)
    .sort()
  assert.equal(names.at(-1), slot)
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-ad1-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_ad1_${process.pid}`
  writeFileSync(script, [stubSql(), ...names.map(include), assertSql].join('\n'))
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
    try {
      execFileSync('dropdb', ['--if-exists', db], { stdio: 'ignore' })
    } catch {
      // The database may already be gone.
    }
    rmSync(dir, { recursive: true, force: true })
  }
})

const assertSql = `
do $checks$
<<ad1>>
declare
  member_id uuid := '${USER}';
  other_id uuid := '${OTHER}';
  cand_id uuid := '${CAND}';
  staff_id uuid := '${STAFF}';
  code_hash text := '${HASH}';
  wrong_hash text := '${WRONG}';
  issued text;
  result jsonb;
  notices int;
  consent_left int;
  consent_named int;
  intro_left int;
  digest_left int;
  apps_left int;
  audit_named int;
  access_named int;
  forced boolean;
  profile_name text;
  member_email text;
  member_status text;
  hidden boolean;
  app_email text;
  app_user uuid;
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'account_closure_notices'
      and c.relforcerowsecurity
  ) then
    raise exception 'closure notices are not force RLS';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and c.relname = 'account_delete_codes'
      and c.relforcerowsecurity
  ) then
    raise exception 'delete codes are not force RLS';
  end if;

  select c.relforcerowsecurity into forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'account_closure_notices';
  if forced is distinct from true then
    raise exception 'force flag missing';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'confirm_account_delete'
      and exists (
        select 1 from unnest(coalesce(p.proconfig, array[]::text[])) as cfg
        where cfg like 'search_path=%'
          and cfg !~ 'public'
      )
  ) then
    raise exception 'confirm search_path is not empty';
  end if;

  if has_function_privilege('anon', 'public.confirm_account_delete(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.issue_account_delete_code(uuid, text, timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.void_account_delete_code(uuid)', 'execute')
     or has_function_privilege('anon', 'public.list_account_closure_notices()', 'execute')
     or has_function_privilege('authenticated', 'public.confirm_account_delete(uuid, text)', 'execute')
  then
    raise exception 'anon or authenticated can execute the delete functions';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where grantee = 'anon'
      and table_name in ('account_closure_notices', 'account_delete_codes')
  ) then
    raise exception 'anon has a table grant';
  end if;

  begin
    execute 'set role anon';
    perform public.confirm_account_delete(member_id, wrong_hash);
    raise exception 'anon confirmed';
  exception
    when insufficient_privilege then
      null;
  end;

  insert into auth.users (id, email) values
    (member_id, 'member-one'),
    (other_id, 'member-two'),
    (cand_id, 'cand-one'),
    (staff_id, 'staff-one');

  insert into public.members (user_id, email, seat, status)
  values
    (member_id, 'member-one', 'ksa', 'active'),
    (other_id, 'member-two', 'intl', 'active');

  insert into public.staff_users (user_id, email, role)
  values (staff_id, 'staff-one', 'staff');

  insert into public.profiles (user_id, full_name, headline, company)
  values (member_id, 'Example Member', 'Chair', 'Example Co');

  insert into public.candidates (user_id, email, full_name, role, region)
  values (cand_id, 'cand-one', 'Cand Person', 'chairperson', 'ksa_gcc');

  insert into public.applications (full_name, email, phone, companies, job_titles, turnover, status, member_user_id)
  values ('Example Member', 'member-one', '500', 'Example Co', 'Chair', 'band', 'accepted', member_id);

  insert into public.consent_log (consent_id, choice, banner_version, notice_version, language, user_id)
  values (gen_random_uuid(), 'accept', '1', '1', 'en', member_id);

  insert into public.staff_access_log (staff_user_id, member_id, object_type, object_id)
  values (staff_id, member_id, 'member', member_id);

  insert into public.member_tier_audits (member_user_id, actor_id, before_tiers, after_tiers)
  values (member_id, member_id, array['founding'], array['founding']);

  insert into public.member_intros (requester_id, target_id, reason)
  values (member_id, other_id, 'A warm introduction');

  insert into public.digest_issues (iso_year, iso_week, payload)
  values (2026, 41, '{}'::jsonb);

  insert into public.digest_notices (issue_id, member_id)
  select d.id, member_id
  from public.digest_issues d
  where d.iso_year = 2026 and d.iso_week = 41;

  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  issued := public.issue_account_delete_code(staff_id, code_hash, now() + interval '10 minutes');
  if issued is distinct from 'staff' then
    raise exception 'staff issue returned %', issued;
  end if;

  issued := public.issue_account_delete_code(cand_id, code_hash, now() + interval '10 minutes');
  if issued is distinct from 'ok' then
    raise exception 'candidate issue returned %', issued;
  end if;
  result := public.confirm_account_delete(cand_id, code_hash);
  if result->>'status' is distinct from 'ok' then
    raise exception 'candidate confirm returned %', result;
  end if;
  if exists (select 1 from auth.users where id = cand_id) then
    raise exception 'candidate sign-in remains';
  end if;
  if (select count(*) from public.account_closure_notices) <> 0 then
    raise exception 'candidate delete notified admin';
  end if;

  issued := public.issue_account_delete_code(member_id, code_hash, now() + interval '10 minutes');
  if issued is distinct from 'ok' then
    raise exception 'member issue returned %', issued;
  end if;
  result := public.confirm_account_delete(member_id, wrong_hash);
  if result->>'status' is distinct from 'mismatch' then
    raise exception 'mismatch returned %', result;
  end if;

  select status, email into member_status, member_email from public.members where user_id = member_id;
  if member_status is distinct from 'active' or member_email is distinct from 'member-one' then
    raise exception 'mismatch changed the member';
  end if;

  result := public.confirm_account_delete(member_id, code_hash);
  if result->>'status' is distinct from 'ok' then
    raise exception 'member confirm returned %', result;
  end if;

  select full_name into profile_name from public.profiles where user_id = member_id;
  select status, email, directory_hidden into member_status, member_email, hidden
  from public.members where user_id = member_id;
  if profile_name is distinct from 'Former member' then
    raise exception 'profile name %', profile_name;
  end if;
  if exists (select 1 from public.profiles where user_id = member_id and headline is not null) then
    raise exception 'headline remains';
  end if;
  if member_status is distinct from 'suspended' or hidden is distinct from true then
    raise exception 'directory listing remains % %', member_status, hidden;
  end if;
  if position('@' in member_email) > 0 then
    raise exception 'member email still has an address';
  end if;
  if exists (select 1 from auth.users where id = member_id and position('@' in coalesce(email, '')) > 0) then
    raise exception 'auth email still has an address';
  end if;

  select count(*) into intro_left from public.member_intros where requester_id = member_id or target_id = member_id;
  select count(*) into digest_left from public.digest_notices n where n.member_id = ad1.member_id;
  if intro_left <> 0 or digest_left <> 0 then
    raise exception 'intros or notices remain % %', intro_left, digest_left;
  end if;

  select count(*) into consent_left from public.consent_log;
  select count(*) into consent_named from public.consent_log where user_id = member_id;
  if consent_left <> 1 or consent_named <> 0 then
    raise exception 'consent rows % named %', consent_left, consent_named;
  end if;

  select count(*) into apps_left from public.applications where full_name = 'Former member';
  select email, member_user_id into app_email, app_user
  from public.applications where full_name = 'Former member';
  if apps_left <> 1 or app_user is not null or position('@' in app_email) > 0 then
    raise exception 'application was not kept anonymised';
  end if;

  select count(*) into audit_named
  from public.member_tier_audits
  where member_user_id = member_id or actor_id = member_id;
  select count(*) into access_named from public.staff_access_log l where l.member_id = ad1.member_id;
  if audit_named <> 0 or access_named <> 0 then
    raise exception 'audit reference remains';
  end if;
  if (select count(*) from public.member_tier_audits) <> 1 then
    raise exception 'tier audit row was deleted';
  end if;
  if (select count(*) from public.staff_access_log) <> 1 then
    raise exception 'access log row was deleted';
  end if;

  select count(*) into notices from public.account_closure_notices;
  if notices <> 1 then
    raise exception 'admin notice count %', notices;
  end if;

  begin
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', member_id, 'role', 'authenticated', 'aal', 'aal2')::text,
      true
    );
    execute 'set role authenticated';
    perform public.list_account_closure_notices();
    raise exception 'member listed notices';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%not_allowed%' then
        raise exception 'member list error: %', sqlerrm;
      end if;
  end;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', staff_id, 'role', 'authenticated', 'aal', 'aal2')::text,
    true
  );
  execute 'set role authenticated';
  result := public.list_account_closure_notices();
  if jsonb_array_length(result) <> 1 or result->0->>'notice' is distinct from 'A member closed their account.' then
    raise exception 'staff notice %', result;
  end if;
end
$checks$;
`

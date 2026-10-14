import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')

test('transactional notices skip, opt out, and do not mail a retry twice', { timeout: 300_000 }, () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.ok(names.includes('20261229120000_email_transactional.sql'))
  assert.equal(names.filter((name) => name.startsWith('20261229120000')).length, 1)
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-email-tx-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_email_tx_${process.pid}`
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
  kept_id uuid := gen_random_uuid();
  staff_id uuid := gen_random_uuid();
  fresh_id uuid := gen_random_uuid();
  demo_id uuid := gen_random_uuid();
  anon_id uuid := gen_random_uuid();
  ref_a uuid := gen_random_uuid();
  ref_b uuid := gen_random_uuid();
  first_id uuid;
  second_id uuid;
  row_count integer;
  send_count integer;
  reason text;
  ok boolean;
  master boolean;
  forced boolean;
  hashed text;
begin
  insert into auth.users (id, email) values
    (kept_id, 'kept.member@example.com'),
    (staff_id, 'admin.staff@example.com'),
    (fresh_id, 'fresh.member@example.com'),
    (demo_id, 'demo.member@example.com'),
    (anon_id, 'anon.member@example.com');

  insert into public.staff_users (user_id, email, role)
  values (staff_id, 'admin.staff@example.com', 'staff');

  insert into public.members (user_id, email, seat, status, digest_email_opt_in) values
    (kept_id, 'kept.member@example.com', 'ksa', 'active', false);

  perform private.email_save_preference(kept_id, 'weekly_digest', false, 'privacy_panel', 'opt_out');
  perform private.email_apply_admit_defaults(kept_id);
  if exists (
    select 1 from public.email_preferences p
    where p.user_id = kept_id and p.category = 'welcome' and p.opted_in
  ) then
    raise exception 'existing member was given welcome on';
  end if;
  if (select m.digest_email_opt_in from public.members m where m.user_id = kept_id) is distinct from false then
    raise exception 'existing weekly choice was flipped';
  end if;

  insert into public.members (user_id, email, seat, status, invited_by, digest_email_opt_in)
  values (fresh_id, 'fresh.member@example.com', 'ksa', 'active', staff_id, false);
  if (select p.opted_in from public.email_preferences p where p.user_id = fresh_id and p.category = 'welcome')
     is distinct from true then
    raise exception 'new member welcome was not on';
  end if;
  if (select p.opted_in from public.email_preferences p where p.user_id = fresh_id and p.category = 'news_invitations')
     is distinct from false then
    raise exception 'new member news was flipped on';
  end if;
  if (select count(*) from public.email_consent_log where user_id = fresh_id and source = 'admit_default') <> 2 then
    raise exception 'admit consent count changed';
  end if;

  select e.ok, e.reason into ok, reason
  from private.transactional_eligible('welcome', fresh_id) e;
  if ok or reason is distinct from 'master_off' then
    raise exception 'master off did not skip welcome % %', ok, reason;
  end if;
  select e.ok, e.reason into ok, reason
  from private.transactional_eligible('security_signin', fresh_id) e;
  if ok or reason is distinct from 'master_off' then
    raise exception 'master off did not skip essential % %', ok, reason;
  end if;

  update public.email_settings set master_enabled = true where id;

  select e.ok, e.reason into ok, reason
  from private.transactional_eligible('welcome', fresh_id) e;
  if ok is not true or reason is not null then
    raise exception 'opted in welcome was blocked % %', ok, reason;
  end if;

  hashed := private.email_address_hash('fresh.member@example.com');
  insert into public.email_suppressions (email_hash, reason, source)
  values (hashed, 'hard_bounce', 'webhook');
  select e.reason into reason from private.transactional_eligible('welcome', fresh_id) e;
  if reason is distinct from 'suppressed' then
    raise exception 'hard bounce did not block welcome %', reason;
  end if;
  select e.ok, e.reason into ok, reason from private.transactional_eligible('security_signin', fresh_id) e;
  if ok is not true then
    raise exception 'hard bounce blocked essential %', reason;
  end if;
  update public.email_suppressions set reason = 'complaint' where email_hash = hashed;
  select e.reason into reason from private.transactional_eligible('invite', fresh_id) e;
  if reason is distinct from 'suppressed' then
    raise exception 'complaint did not block invite %', reason;
  end if;
  select e.ok into ok from private.transactional_eligible('security_two_step', fresh_id) e;
  if ok is not true then
    raise exception 'complaint blocked essential';
  end if;
  update public.email_suppressions set reason = 'invalid' where email_hash = hashed;
  select e.reason into reason from private.transactional_eligible('security_deletion', fresh_id) e;
  if reason is distinct from 'suppressed' then
    raise exception 'invalid did not block essential %', reason;
  end if;
  delete from public.email_suppressions where email_hash = hashed;

  perform private.email_save_preference(fresh_id, 'welcome', false, 'privacy_panel', 'opt_out');
  select e.reason into reason from private.transactional_eligible('welcome', fresh_id) e;
  if reason is distinct from 'opted_out' then
    raise exception 'welcome opt out did not stick %', reason;
  end if;
  select e.ok into ok from private.transactional_eligible('invite', fresh_id) e;
  if ok is not true then
    raise exception 'welcome opt out blocked invite';
  end if;

  insert into public.members (user_id, email, seat, status, is_demo)
  values (demo_id, 'demo.member@example.com', 'ksa', 'active', true);
  select e.reason into reason from private.transactional_eligible('welcome', demo_id) e;
  if reason is distinct from 'demo' then
    raise exception 'demo was not skipped %', reason;
  end if;
  insert into public.members (user_id, email, seat, status, anonymised_at)
  values (anon_id, 'anon.member@example.com', 'ksa', 'active', now());
  select e.reason into reason from private.transactional_eligible('security_signin', anon_id) e;
  if reason is distinct from 'anonymised' then
    raise exception 'anonymised was not skipped %', reason;
  end if;

  first_id := private.enqueue_member_notice('invite', fresh_id, ref_a, jsonb_build_object('invite_id', ref_a));
  second_id := private.enqueue_member_notice('invite', fresh_id, ref_a, jsonb_build_object('invite_id', ref_a));
  if first_id is null or second_id is distinct from first_id then
    raise exception 'retry did not reuse the outbox row';
  end if;
  select count(*) into row_count from public.email_outbox where type_key = 'invite' and ref_id = ref_a and user_id = fresh_id;
  select count(*) into send_count from public.email_sends where type_key = 'invite' and ref_id = ref_a and user_id = fresh_id;
  if row_count <> 1 or send_count <> 1 then
    raise exception 'retry mailed more than once % %', row_count, send_count;
  end if;
  perform private.enqueue_member_notice('invite', fresh_id, ref_b, '{}'::jsonb);
  if (select count(*) from public.email_outbox where user_id = fresh_id and type_key = 'invite') <> 2 then
    raise exception 'a different event was collapsed';
  end if;

  begin
    perform private.enqueue_member_notice('welcome', fresh_id, ref_b, jsonb_build_object('note', 'hello'));
    raise exception 'copy was stored in the payload';
  exception
    when sqlstate '22023' then
      null;
  end;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', fresh_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  begin
    perform public.set_email_preference('security_signin', false);
    raise exception 'essential preference was saved';
  exception
    when sqlstate '22023' then
      null;
  end;
  set role postgres;

  select master_enabled into master from public.email_settings where id;
  update public.email_settings set master_enabled = false where id;
  if (select master_enabled from public.email_settings where id) is distinct from false then
    raise exception 'master switch stayed on';
  end if;

  perform private.enqueue_member_notice(
    'security_deletion', fresh_id, fresh_id, jsonb_build_object('user_id', fresh_id)
  );
  if (
    select o.address_snapshot
    from public.email_outbox o
    where o.type_key = 'security_deletion' and o.user_id = fresh_id
  ) is distinct from 'fresh.member@example.com' then
    raise exception 'deletion notice did not keep the address snapshot';
  end if;
  if exists (
    select 1 from public.email_outbox o
    where o.type_key = 'security_deletion'
      and o.user_id = fresh_id
      and o.payload::text like '%@%'
  ) then
    raise exception 'payload stored an address';
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conname = 'email_sends_user_id_fkey'
      and conrelid = 'public.email_sends'::regclass
  ) then
    raise exception 'email send member link was dropped';
  end if;

  for row_count in 1..5 loop
    perform private.enqueue_member_notice(
      'security_two_step', kept_id, gen_random_uuid(), jsonb_build_object('user_id', kept_id)
    );
  end loop;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
  set role service_role;
  if public.service_two_step_notice_ref(kept_id) is not null then
    raise exception 'two-step notices were not limited';
  end if;
  if public.service_two_step_notice_ref(fresh_id) is null then
    raise exception 'a quiet member was limited';
  end if;
  set role postgres;

  select c.relforcerowsecurity into forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'email_outbox';
  if forced is not true then
    raise exception 'outbox rls was not forced';
  end if;
  if has_table_privilege('anon', 'public.email_outbox', 'SELECT')
     or has_table_privilege('authenticated', 'public.email_outbox', 'SELECT')
     or has_function_privilege('anon', 'private.enqueue_member_notice(text,uuid,uuid,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.enqueue_member_notice(text,uuid,uuid,jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.service_enqueue_member_notice(text,uuid,uuid,jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.service_claim_member_notices(integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.set_email_preference(text,boolean)', 'EXECUTE') is not true then
    raise exception 'notice grants were wrong';
  end if;
end
$checks$;
`

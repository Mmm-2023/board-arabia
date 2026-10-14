import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20270101120000_email_deliverability.sql'

test('pause thresholds, permanent suppression, and owner resume', { timeout: 300_000 }, () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.equal(names.includes(migrationName), true)
  assert.ok(names.indexOf(migrationName) > names.indexOf('20261230120000_staff_aal1_access.sql'))
  assert.equal(names.includes('20261231120000_newsletter_analytics.sql'), false)
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-email-pause-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_email_pause_${process.pid}`
  const stub = readFileSync(path.join(root, 'scripts/definer-audit.test.ts'), 'utf8')
  const stubStart = stub.indexOf('const stubSql = `') + 'const stubSql = `'.length
  const stubEnd = stub.indexOf('`\n\nconst assertSql')
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
  member_id uuid := gen_random_uuid();
  owner_id uuid := gen_random_uuid();
  staff_id uuid := gen_random_uuid();
  small_id uuid;
  complaint_id uuid;
  bounce_id uuid;
  hashed text;
  v_ok boolean;
  v_reason text;
  v_status text;
  v_master boolean;
  v_pause text;
  v_count integer;
  resumed jsonb;
  forced boolean;
begin
  if private.email_pause_reason(99, 99, 99) <> '' then
    raise exception 'small send was paused';
  end if;
  if private.email_pause_reason(100, 0, 3) <> '' then
    raise exception '3 percent bounces paused';
  end if;
  if private.email_pause_reason(100, 1, 0) is distinct from 'complaint_rate' then
    raise exception '0.1 percent complaints did not pause';
  end if;
  if private.email_pause_reason(100, 0, 4) is distinct from 'bounce_rate' then
    raise exception '4 percent bounces did not pause';
  end if;
  if private.email_pause_reason(1000, 1, 40) is distinct from 'complaint_rate' then
    raise exception 'complaint did not win over bounces';
  end if;
  if private.email_pause_reason(1000, 0, 39) <> '' then
    raise exception '39 of 1000 paused';
  end if;
  if private.email_pause_reason(1000, 0, 40) is distinct from 'bounce_rate' then
    raise exception '40 of 1000 did not pause';
  end if;

  insert into auth.users (id, email) values
    (member_id, 'member.pause@example.com'),
    (owner_id, 'owner.pause@example.com'),
    (staff_id, 'staff.pause@example.com');
  insert into public.members (user_id, email, seat, status, tiers) values
    (member_id, 'member.pause@example.com', 'ksa', 'active', array['founding']::text[]);
  insert into public.staff_users (user_id, email, role) values
    (owner_id, 'owner.pause@example.com', 'master'),
    (staff_id, 'staff.pause@example.com', 'staff');
  hashed := private.email_address_hash('member.pause@example.com');

  update public.email_settings set master_enabled = true where id;
  insert into public.email_suppressions (email_hash, reason, source)
  values (hashed, 'hard_bounce', 'provider');
  insert into public.email_suppressions (email_hash, reason, source)
  values (hashed, 'complaint', 'provider')
  on conflict (email_hash) do nothing;
  select count(*), min(reason) into v_count, v_reason
  from public.email_suppressions where email_hash = hashed;
  if v_count <> 1 or v_reason is distinct from 'hard_bounce' then
    raise exception 'suppression was not permanent % %', v_count, v_reason;
  end if;
  if private.email_is_suppressed(hashed) is not true then
    raise exception 'news stream did not see the suppression';
  end if;
  select t.ok, t.reason into v_ok, v_reason
  from private.transactional_eligible('invite', member_id) t;
  if v_ok or v_reason is distinct from 'suppressed' then
    raise exception 'complaint or bounce did not block transactional mail % %', v_ok, v_reason;
  end if;
  select t.ok, t.reason into v_ok, v_reason
  from private.transactional_eligible('security_signin', member_id) t;
  if v_ok is not true then
    raise exception 'essential mail was blocked % %', v_ok, v_reason;
  end if;
  update public.email_suppressions set reason = 'complaint' where email_hash = hashed;
  select t.ok, t.reason into v_ok, v_reason
  from private.transactional_eligible('invite', member_id) t;
  if v_reason is distinct from 'suppressed' then
    raise exception 'complaint did not block the mail stream';
  end if;
  select t.ok into v_ok from private.transactional_eligible('security_signin', member_id) t;
  if v_ok is not true then
    raise exception 'a complaint blocked essential mail';
  end if;
  update public.email_settings set master_enabled = false where id;

  insert into public.email_campaigns (
    kind, category, subject, body_text, body_html_sanitised, audience_tiers, status, created_by
  ) values (
    'campaign', 'news_invitations', 'Small', 'Hello', '<p>Hello</p>', array['founding']::text[], 'sending', member_id
  ) returning id into small_id;
  insert into public.email_sends (campaign_id, email_hash, status, provider_message_id, is_test)
  select small_id, hashed, 'sent', 'small-' || g, false
  from generate_series(1, 99) g;
  insert into public.newsletter_events (send_id, message_id, event, occurred_at)
  select s.id, s.provider_message_id, 'delivered', timestamptz '2026-10-14 10:00:00+00'
  from public.email_sends s
  where s.campaign_id = small_id;
  insert into public.newsletter_events (send_id, message_id, event, occurred_at)
  select s.id, s.provider_message_id, 'complained', timestamptz '2026-10-14 10:05:00+00'
  from public.email_sends s
  where s.campaign_id = small_id
  order by s.provider_message_id
  limit 10;
  select status into v_status from public.email_campaigns where id = small_id;
  select pause_reason into v_pause from public.email_settings where id;
  if v_status is distinct from 'sending' or v_pause is not null then
    raise exception 'a send under 100 delivered was paused % %', v_status, v_pause;
  end if;

  insert into public.email_campaigns (
    kind, category, subject, body_text, body_html_sanitised, audience_tiers, status, created_by
  ) values (
    'campaign', 'news_invitations', 'Wide', 'Hello', '<p>Hello</p>', array['founding']::text[], 'sending', member_id
  ) returning id into complaint_id;
  insert into public.email_sends (campaign_id, email_hash, status, provider_message_id, is_test)
  select complaint_id, hashed, 'sent', 'wide-' || g, false
  from generate_series(1, 100) g;
  insert into public.newsletter_events (send_id, message_id, event, occurred_at)
  select s.id, s.provider_message_id, 'delivered', timestamptz '2026-10-14 11:00:00+00'
  from public.email_sends s
  where s.campaign_id = complaint_id;
  insert into public.newsletter_events (send_id, message_id, event, occurred_at)
  select s.id, s.provider_message_id, 'complained', timestamptz '2026-10-14 11:05:00+00'
  from public.email_sends s
  where s.campaign_id = complaint_id
  order by s.provider_message_id
  limit 1;
  select status into v_status from public.email_campaigns where id = complaint_id;
  select master_enabled, pause_reason into v_master, v_pause from public.email_settings where id;
  if v_status is distinct from 'paused' or v_master is distinct from false or v_pause is distinct from 'complaint_rate' then
    raise exception 'complaint pause failed % % %', v_status, v_master, v_pause;
  end if;
  if not exists (
    select 1 from public.email_pause_log
    where campaign_id = complaint_id and reason = 'complaint_rate' and delivered = 100 and complaints = 1
  ) then
    raise exception 'complaint pause was not logged';
  end if;

  update public.email_settings
  set pause_reason = null, paused_at = null, master_enabled = false
  where id;
  insert into public.email_campaigns (
    kind, category, subject, body_text, body_html_sanitised, audience_tiers, status, created_by
  ) values (
    'campaign', 'news_invitations', 'Bounces', 'Hello', '<p>Hello</p>', array['founding']::text[], 'sending', member_id
  ) returning id into bounce_id;
  insert into public.email_sends (campaign_id, email_hash, status, provider_message_id, is_test)
  select bounce_id, hashed, 'sent', 'bounce-' || g, false
  from generate_series(1, 100) g;
  insert into public.newsletter_events (send_id, message_id, event, occurred_at)
  select s.id, s.provider_message_id, 'delivered', timestamptz '2026-10-14 12:00:00+00'
  from public.email_sends s
  where s.campaign_id = bounce_id;
  insert into public.newsletter_events (send_id, message_id, event, occurred_at)
  select s.id, s.provider_message_id, 'bounced', timestamptz '2026-10-14 12:05:00+00'
  from public.email_sends s
  where s.campaign_id = bounce_id
  order by s.provider_message_id
  limit 4;
  select status into v_status from public.email_campaigns where id = bounce_id;
  select pause_reason, master_enabled into v_pause, v_master from public.email_settings where id;
  if v_status is distinct from 'paused' or v_pause is distinct from 'bounce_rate' or v_master is distinct from false then
    raise exception 'bounce pause failed % % %', v_status, v_pause, v_master;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', staff_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  begin
    perform public.staff_resume_email_pause();
    raise exception 'staff resumed a pause';
  exception
    when insufficient_privilege then
      reset role;
  end;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', owner_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
  resumed := public.staff_resume_email_pause();
  reset role;
  if resumed->>'ok' is distinct from 'true' or resumed->>'master_enabled' is distinct from 'false' then
    raise exception 'owner resume changed the master switch %', resumed;
  end if;
  select master_enabled, pause_reason into v_master, v_pause from public.email_settings where id;
  if v_master is distinct from false or v_pause is not null then
    raise exception 'resume left sending on % %', v_master, v_pause;
  end if;
  if exists (select 1 from public.email_campaigns where status = 'paused') then
    raise exception 'a campaign stayed paused';
  end if;
  select status into v_status from public.email_campaigns where id = complaint_id;
  if v_status is distinct from 'sending' then
    raise exception 'resume did not return the letter to sending %', v_status;
  end if;

  select c.relrowsecurity and c.relforcerowsecurity into forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'email_pause_log';
  if forced is distinct from true then
    raise exception 'pause log is not forced';
  end if;
  if has_table_privilege('anon', 'public.email_pause_log', 'SELECT')
     or has_table_privilege('authenticated', 'public.email_suppressions', 'DELETE')
     or has_function_privilege('anon', 'public.staff_resume_email_pause()', 'EXECUTE')
     or has_function_privilege('anon', 'public.email_apply_pause(uuid, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.email_apply_pause(uuid, text)', 'EXECUTE') then
    raise exception 'pause grants are too wide';
  end if;
end;
$checks$;
`

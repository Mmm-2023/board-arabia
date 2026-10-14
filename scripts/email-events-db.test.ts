import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261221120000_newsletter_events.sql'
const hashed = createHash('sha256').update('member.events@example.com').digest('hex')
const other = createHash('sha256').update('member.other@example.com').digest('hex')

test('provider events store the url and time and do not grant anon', { timeout: 300_000 }, () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.equal(names.includes(migrationName), true)
  assert.ok(names.indexOf(migrationName) > names.indexOf('20261220120000_email_core.sql'))
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-email-events-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_email_events_${process.pid}`
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
  other_id uuid := gen_random_uuid();
  campaign_id uuid;
  other_campaign uuid;
  hashed text;
  other_hash text;
  event_n integer;
  stored text;
  send_status text;
  master boolean;
  forced boolean;
  consent_n integer;
  owner_id uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  release_status text;
  progress jsonb;
  marked jsonb;
  edited jsonb;
begin
  if private.email_address_hash('member.events@example.com') is distinct from '${hashed}' then
    raise exception 'address hash does not match';
  end if;
  hashed := '${hashed}';
  other_hash := '${other}';

  insert into auth.users (id, email) values
    (member_id, 'member.events@example.com'),
    (other_id, 'member.other@example.com');
  insert into public.members (user_id, email, seat, status, tiers) values
    (member_id, 'member.events@example.com', 'ksa', 'active', array['founding']::text[]),
    (other_id, 'member.other@example.com', 'ksa', 'active', array['founding']::text[]);
  insert into public.email_campaigns (
    kind, category, subject, body_text, body_html_sanitised, audience_tiers, status, created_by
  ) values (
    'campaign', 'news_invitations', 'Hello', 'Hello', '<p>Hello</p>', array['founding']::text[], 'approved', member_id
  ) returning id into campaign_id;
  insert into public.email_sends (campaign_id, user_id, email_hash, status, provider_message_id)
  values (campaign_id, member_id, hashed, 'sent', 'msg-open');

  perform private.email_record_event('msg-open', 'opened', hashed, null, '2026-10-14 08:00:00+00');
  perform private.email_record_event('msg-open', 'clicked', hashed, 'https://example.com/story', '2026-10-14 08:01:00+00');
  perform private.email_record_event('msg-open', 'clicked', hashed, 'https://example.com/story', '2026-10-14 08:01:00+00');
  perform private.email_record_event('msg-open', 'clicked', hashed, 'javascript:alert(1)', '2026-10-14 08:02:00+00');
  perform private.email_record_event('msg-open', 'delivered', hashed, null, '2026-10-14 08:03:00+00');
  select status into send_status from public.email_sends where provider_message_id = 'msg-open';
  if send_status is distinct from 'clicked' then
    raise exception 'click did not win over a later delivery %', send_status;
  end if;
  select count(*) into event_n from public.newsletter_events where message_id = 'msg-open' and event = 'clicked';
  if event_n <> 2 then
    raise exception 'click rows %', event_n;
  end if;
  select url into stored from public.newsletter_events
  where message_id = 'msg-open' and event = 'clicked' and occurred_at = '2026-10-14 08:01:00+00';
  if stored is distinct from 'https://example.com/story' then
    raise exception 'click url missing';
  end if;
  if exists (select 1 from public.newsletter_events where url like 'javascript:%') then
    raise exception 'unsafe url stored';
  end if;
  if not exists (
    select 1 from public.newsletter_events
    where message_id = 'msg-open' and event = 'opened' and occurred_at = '2026-10-14 08:00:00+00' and url is null
  ) or not exists (
    select 1 from public.newsletter_events
    where message_id = 'msg-open' and event = 'delivered'
  ) then
    raise exception 'opened or delivered was not stored';
  end if;

  perform private.email_record_event('msg-open', 'hard_bounce', hashed, null, '2026-10-14 08:04:00+00');
  perform private.email_record_event('msg-open', 'hard_bounce', hashed, null, '2026-10-14 08:04:00+00');
  select status into send_status from public.email_sends where provider_message_id = 'msg-open';
  if send_status is distinct from 'bounced' then
    raise exception 'bounce did not replace the click';
  end if;
  if not exists (
    select 1 from public.email_suppressions where email_hash = hashed and reason = 'hard_bounce'
  ) then
    raise exception 'bounce did not suppress';
  end if;
  select count(*) into consent_n from public.email_consent_log where user_id = member_id and action = 'bounce';
  if consent_n <> 1 then
    raise exception 'bounce consent %', consent_n;
  end if;
  select count(*) into event_n from public.newsletter_events where message_id = 'msg-open' and event = 'bounced';
  if event_n <> 1 then
    raise exception 'bounce event rows %', event_n;
  end if;
  perform private.email_record_event('msg-open', 'hard_bounce', '${other}', null, '2026-10-14 08:05:00+00');
  if exists (select 1 from public.email_suppressions where email_hash = '${other}') then
    raise exception 'wrong hash was suppressed';
  end if;

  insert into public.email_campaigns (
    kind, category, subject, body_text, body_html_sanitised, audience_tiers, status, created_by
  ) values (
    'campaign', 'news_invitations', 'Other', 'Other', '<p>Other</p>', array['founding']::text[], 'approved', other_id
  ) returning id into other_campaign;
  insert into public.email_sends (campaign_id, user_id, email_hash, status, provider_message_id)
  values (other_campaign, other_id, other_hash, 'sent', 'msg-complaint');
  perform public.email_record_event('msg-complaint', 'complaint', other_hash, null, '2026-10-14 09:00:00+00');
  select status into send_status from public.email_sends where provider_message_id = 'msg-complaint';
  if send_status is distinct from 'complained' then
    raise exception 'complaint was not stored';
  end if;
  if not exists (
    select 1 from public.email_suppressions where email_hash = other_hash and reason = 'complaint'
  ) or not exists (
    select 1 from public.newsletter_events where message_id = 'msg-complaint' and event = 'complained'
  ) then
    raise exception 'complaint event missing';
  end if;

  select master_enabled into master from public.email_settings where id;
  if master is distinct from false then
    raise exception 'master switch changed';
  end if;

  select c.relrowsecurity and c.relforcerowsecurity into forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'newsletter_events';
  if forced is distinct from true then
    raise exception 'events table is not forced';
  end if;
  if has_table_privilege('anon', 'public.newsletter_events', 'SELECT')
     or has_table_privilege('authenticated', 'public.newsletter_events', 'SELECT')
     or has_table_privilege('service_role', 'public.newsletter_events', 'INSERT')
     or has_function_privilege('anon', 'public.email_record_event(text, text, text, text, timestamptz, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.email_record_event(text, text, text, text, timestamptz, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.email_recipients(uuid)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.email_record_event(text, text, text, text, timestamptz, text)', 'EXECUTE') is not true then
    raise exception 'event grants are wrong';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'email_events'
      and column_name in ('send_id', 'message_id', 'occurred_at', 'url')
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'email_events'
      and column_name = 'recipient'
  ) then
    raise exception 'account mail log was created or altered';
  end if;

  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'email_preferences_category_idx')
     or not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'email_consent_log_category_idx')
     or not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'email_campaigns_category_idx')
     or not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'email_sends_user_idx')
     or not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'email_sends_campaign_idx') then
    raise exception 'a foreign key index is missing';
  end if;

  perform private.email_record_event('msg-open', 'opened', hashed, null, null, 'svix-replay');
  perform private.email_record_event('msg-open', 'opened', hashed, null, null, 'svix-replay');
  select count(*) into event_n from public.newsletter_events where svix_id = 'svix-replay';
  if event_n <> 1 then
    raise exception 'svix replay stored % rows', event_n;
  end if;

  insert into auth.users (id, email) values
    (owner_id, 'owner.events@example.com'),
    (admin_id, 'admin.events@example.com');
  insert into public.staff_users (user_id, email, role) values
    (owner_id, 'owner.events@example.com', 'master'),
    (admin_id, 'admin.events@example.com', 'staff');
  set role service_role;
  progress := public.email_set_campaign_progress(campaign_id, 'sending', owner_id);
  if progress->>'ok' is distinct from 'false' then
    raise exception 'live started with no test %', progress;
  end if;
  marked := public.email_mark_owner_test(campaign_id, admin_id);
  if marked->>'ok' is distinct from 'false' then
    raise exception 'admin test was accepted %', marked;
  end if;
  progress := public.email_set_campaign_progress(campaign_id, 'sending', owner_id);
  if progress->>'ok' is distinct from 'false' then
    raise exception 'live started after an admin test %', progress;
  end if;
  marked := public.email_mark_owner_test(campaign_id, owner_id);
  if marked->>'ok' is distinct from 'true' then
    raise exception 'owner test was refused %', marked;
  end if;
  set role postgres;
  select c.status into release_status from public.email_campaigns c where c.id = campaign_id;
  if release_status is distinct from 'test_sent' then
    raise exception 'owner test did not stamp %', release_status;
  end if;
  set role postgres;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', owner_id, 'aal', 'aal2', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  edited := public.staff_upsert_campaign(
    campaign_id, 'campaign', 'news_invitations', 'Hello edited', '', 'Hello', '<p>Hello</p>',
    array['founding']::text[], null
  );
  if edited->>'status' is distinct from 'approved' then
    raise exception 'edit did not return to approved %', edited;
  end if;
  set role postgres;
  if exists (
    select 1 from public.email_campaigns c
    where c.id = campaign_id
      and (c.test_sent_by is not null or c.test_sent_at is not null or c.test_content_hash is not null)
  ) then
    raise exception 'edit left the owner test in place';
  end if;
  set role postgres;
  update public.email_settings set master_enabled = true where id;
  set role service_role;
  progress := public.email_set_campaign_progress(campaign_id, 'sending', owner_id);
  if progress->>'ok' is distinct from 'false' then
    raise exception 'live started after an edit %', progress;
  end if;
  marked := public.email_mark_owner_test(campaign_id, owner_id);
  progress := public.email_set_campaign_progress(campaign_id, 'sending', admin_id);
  if marked->>'ok' is distinct from 'true' or progress->>'ok' is distinct from 'false' then
    raise exception 'a different user id was accepted % %', marked, progress;
  end if;
  progress := public.email_set_campaign_progress(campaign_id, 'sending', owner_id);
  if progress->>'ok' is distinct from 'true' then
    raise exception 'live after an owner test failed %', progress;
  end if;
  set role postgres;
  update public.email_settings set master_enabled = false where id;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.proname in (
        'email_record_event',
        'email_is_suppressed',
        'email_recipients',
        'email_send_gate',
        'email_log_send',
        'email_set_campaign_progress'
      )
      and (
        not p.prosecdef
        or not exists (
          select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
          where cfg = 'search_path=""'
        )
      )
  ) then
    raise exception 'a send definer is missing an empty search_path';
  end if;
end
$checks$;
`

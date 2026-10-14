import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261223120000_email_campaign_ui.sql'

test('campaign release gate keeps existing members and does not read an application tick', { timeout: 300_000 }, () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.equal(names.includes(migrationName), true)
  assert.equal(names.includes('20261222120000_cs1_demo_seed_topup.sql'), true)
  assert.equal(names.includes('20261223120000_email_campaign_ui.sql'), true)
  assert.ok(names.indexOf(migrationName) > names.indexOf('20261220120000_email_core.sql'))
  assert.ok(names.indexOf(migrationName) > names.indexOf('20261222120000_cs1_demo_seed_topup.sql'))
  assert.equal(names.filter((name) => name.startsWith('20261223120000')).length, 1)
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-email-ui-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_email_ui_${process.pid}`
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
  off_id uuid := gen_random_uuid();
  news_id uuid := gen_random_uuid();
  plain_id uuid := gen_random_uuid();
  staff_id uuid := gen_random_uuid();
  owner_id uuid := gen_random_uuid();
  app_news uuid;
  app_plain uuid;
  letter_id uuid;
  send_id uuid;
  weekly_on boolean;
  news_on boolean;
  pref boolean;
  consent_n integer;
  result jsonb;
  master boolean;
  stored_html text;
  markup_id uuid;
  hashed text;
  owner_hash text;
  send_hash text;
  status text;
begin
  insert into auth.users (id, email) values
    (off_id, 'kept.off@example.com'),
    (news_id, 'applicant.news@example.com'),
    (plain_id, 'applicant.plain@example.com'),
    (staff_id, 'admin.staff@example.com'),
    (owner_id, 'owner.one@example.com');

  insert into public.staff_users (user_id, email, role) values
    (staff_id, 'admin.staff@example.com', 'staff'),
    (owner_id, 'owner.one@example.com', 'master');

  insert into public.members (user_id, email, seat, status, digest_email_opt_in, tiers)
  values (off_id, 'kept.off@example.com', 'ksa', 'active', false, array['founding']::text[]);
  perform private.email_backfill_weekly();
  perform private.email_apply_admit_defaults(off_id);
  select m.digest_email_opt_in into weekly_on from public.members m where m.user_id = off_id;
  select p.opted_in into pref
  from public.email_preferences p
  where p.user_id = off_id and p.category = 'weekly_digest';
  select count(*) into consent_n from public.email_consent_log where user_id = off_id and action = 'opt_in';
  if weekly_on is distinct from false or pref is distinct from false or consent_n <> 0 then
    raise exception 'existing member was flipped % % %', weekly_on, pref, consent_n;
  end if;

  insert into public.applications (email, status, full_name)
  values ('applicant.news@example.com', 'verified', 'News Example')
  returning id into app_news;
  insert into public.members (
    user_id, application_id, email, seat, status, invited_by, digest_email_opt_in, tiers, is_demo
  ) values (
    news_id, app_news, 'applicant.news@example.com', 'ksa', 'invited', staff_id, false, array['founding']::text[], false
  );
  select m.digest_email_opt_in into weekly_on from public.members m where m.user_id = news_id;
  select n.opted_in into news_on
  from public.email_preferences n
  where n.user_id = news_id and n.category = 'news_invitations';
  if weekly_on is distinct from true or news_on is distinct from false then
    raise exception 'admit defaults were wrong % %', weekly_on, news_on;
  end if;
  if not exists (
    select 1 from public.email_consent_log
    where user_id = news_id and category = 'weekly_digest' and action = 'opt_in'
      and source = 'admit_default' and notice_version is not null and created_at is not null
  ) or exists (
    select 1 from public.email_consent_log
    where user_id = news_id and source = 'apply_form'
  ) then
    raise exception 'admit consent was wrong';
  end if;
  perform private.email_save_preference(news_id, 'news_invitations', true, 'privacy_panel', 'opt_in');

  insert into public.applications (email, status, full_name)
  values ('applicant.plain@example.com', 'verified', 'Plain Example')
  returning id into app_plain;
  insert into public.members (
    user_id, application_id, email, seat, status, invited_by, digest_email_opt_in, tiers, is_demo
  ) values (
    plain_id, app_plain, 'applicant.plain@example.com', 'ksa', 'invited', staff_id, false, array['founding']::text[], false
  );
  select n.opted_in into news_on
  from public.email_preferences n
  where n.user_id = plain_id and n.category = 'news_invitations';
  if news_on is distinct from false then
    raise exception 'unticked admit opted in';
  end if;
  if exists (
    select 1 from public.email_consent_log
    where user_id = plain_id and source = 'apply_form'
  ) then
    raise exception 'unticked admit logged apply_form';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', staff_id, 'aal', 'aal2', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  result := public.staff_upsert_campaign(
    null, 'campaign', 'news_invitations', 'Hello', 'Preview', 'Hello members.',
    '<p>Hello</p>', array['founding']::text[], null
  );
  letter_id := (result->>'id')::uuid;
  result := public.staff_approve_campaign(letter_id);
  if result->>'status' is distinct from 'approved' then
    raise exception 'letter was not approved %', result;
  end if;
  begin
    perform public.staff_set_email_master(true);
    raise exception 'staff changed the master switch';
  exception
    when others then
      if sqlerrm not like '%not_allowed%' then
        raise exception 'master error %', sqlerrm;
      end if;
  end;
  set role service_role;
  result := public.email_mark_owner_test(letter_id, staff_id);
  if result->>'ok' is distinct from 'false' then
    raise exception 'staff test was stamped %', result;
  end if;
  result := public.email_mark_owner_test(letter_id, owner_id);
  if result->>'ok' is distinct from 'true' or result->>'status' is distinct from 'test_sent' then
    raise exception 'owner test was not stamped %', result;
  end if;
  set role postgres;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', owner_id, 'aal', 'aal2', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  if not exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'staff_email_release_gate'
      and p.proargnames = array['p_campaign_id']::text[]
  ) then
    raise exception 'staff_email_release_gate argument name is not p_campaign_id';
  end if;
  result := public.staff_email_release_gate(p_campaign_id => letter_id);
  if result->>'ready' is distinct from 'false' or result->>'master_enabled' is distinct from 'false' then
    raise exception 'gate opened while the master switch is off %', result;
  end if;
  perform public.staff_set_email_master(true);
  result := public.staff_email_release_gate(p_campaign_id => letter_id);
  if result->>'ready' is distinct from 'true'
     or result->>'version_matches' is distinct from 'true'
     or result->>'test_sent' is distinct from 'true' then
    raise exception 'owner release stayed closed %', result;
  end if;
  if position('@' in result::text) > 0 then
    raise exception 'release gate returned an address';
  end if;
  set role service_role;
  result := public.email_set_campaign_progress(letter_id, 'sending', owner_id);
  if result->>'ok' is distinct from 'true' then
    raise exception 'live progress was refused after the owner test %', result;
  end if;
  set role postgres;

  set role authenticated;
  result := public.staff_upsert_campaign(
    null, 'campaign', 'news_invitations', 'Second', 'Preview', 'Hello members.',
    '<p>Hello</p>', array['founding']::text[], null
  );
  letter_id := (result->>'id')::uuid;
  perform public.staff_approve_campaign(letter_id);
  set role service_role;
  perform public.email_mark_owner_test(letter_id, owner_id);
  set role authenticated;
  result := public.staff_upsert_campaign(
    letter_id, 'campaign', 'news_invitations', 'Second edited', 'Preview', 'Hello members.',
    '<p>Hello</p>', array['founding']::text[], null
  );
  if result->>'status' is distinct from 'approved' then
    raise exception 'edit did not reset the test %', result;
  end if;
  set role postgres;
  if exists (
    select 1 from public.email_campaigns c
    where c.id = letter_id
      and (
        c.test_sent_by is not null
        or c.test_sent_at is not null
        or c.test_content_hash is not null
        or c.content_hash is null
        or c.status is distinct from 'approved'
      )
  ) then
    raise exception 'edit did not clear the owner test';
  end if;
  set role authenticated;
  result := public.staff_email_release_gate(p_campaign_id => letter_id);
  if result->>'ready' is distinct from 'false' then
    raise exception 'screen gate stayed open after the edit %', result;
  end if;
  set role service_role;
  result := public.email_set_campaign_progress(letter_id, 'sending', owner_id);
  if result->>'ok' is distinct from 'false' then
    raise exception 'live send stayed open after the edit %', result;
  end if;
  set role postgres;

  set role authenticated;
  result := public.staff_upsert_campaign(
    null, 'campaign', 'news_invitations', 'Markup', 'Preview', 'Hello <b>members</b>.',
    null, array['founding']::text[], null
  );
  markup_id := (result->>'id')::uuid;
  set role postgres;
  select c.body_html_sanitised into stored_html
  from public.email_campaigns c
  where c.id = markup_id;
  if stored_html is distinct from '<p>Hello &lt;b&gt;members&lt;/b&gt;.</p>' then
    raise exception 'null html was not escaped %', stored_html;
  end if;
  set role authenticated;
  result := public.staff_upsert_campaign(
    markup_id, 'campaign', 'news_invitations', 'Markup', 'Preview', 'Hello <b>members</b>.',
    '<p>Hello</p>', array['founding']::text[], null
  );
  set role postgres;
  select c.body_html_sanitised into stored_html
  from public.email_campaigns c
  where c.id = markup_id;
  if stored_html is distinct from '<p>Hello</p>' then
    raise exception 'supplied html was rewritten %', stored_html;
  end if;

  insert into public.email_sends (campaign_id, email_hash, status, is_test)
  values (letter_id, repeat('ab', 32), 'sent', false)
  returning id into send_id;
  insert into public.newsletter_events (send_id, message_id, event, url, occurred_at)
  values (send_id, 'msg-1', 'clicked', 'https://example.com/letters', now());
  insert into public.email_events (kind, recipient, subject, status)
  values ('decoy_webhook', 'member@example.com', 'Do not show', 'sent');
  set role authenticated;
  result := public.staff_email_screen();
  if position('clicked' in result::text) = 0
     or position('https://example.com/letters' in result::text) = 0 then
    raise exception 'screen missed newsletter events %', result;
  end if;
  if position('decoy_webhook' in result::text) > 0
     or position('@' in result::text) > 0 then
    raise exception 'screen read the transactional mail log %', result;
  end if;
  set role postgres;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', news_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  perform public.set_digest_email_opt_in(false);
  perform public.set_email_preference('news_invitations', false);
  set role postgres;
  select p.opted_in into weekly_on
  from public.email_preferences p
  where p.user_id = news_id and p.category = 'weekly_digest';
  select n.opted_in into news_on
  from public.email_preferences n
  where n.user_id = news_id and n.category = 'news_invitations';
  if weekly_on is distinct from false or news_on is distinct from false then
    raise exception 'settings switches did not turn mail off';
  end if;
  if not exists (
    select 1 from public.email_consent_log
    where user_id = news_id and source = 'privacy_panel' and category = 'weekly_digest' and action = 'opt_out'
  ) or not exists (
    select 1 from public.email_consent_log
    where user_id = news_id and source = 'privacy_panel' and category = 'news_invitations' and action = 'opt_out'
  ) then
    raise exception 'settings switches did not log consent';
  end if;

  hashed := private.email_unsub_token(plain_id, 'weekly_digest');
  set role anon;
  perform public.email_unsubscribe(hashed, 'unsubscribe_link');
  set role postgres;
  select p.opted_in into weekly_on
  from public.email_preferences p
  where p.user_id = plain_id and p.category = 'weekly_digest';
  if weekly_on is distinct from false then
    raise exception 'unsubscribe link left weekly on';
  end if;
  if not exists (
    select 1 from public.email_consent_log
    where user_id = plain_id and source = 'unsubscribe_link' and category = 'weekly_digest' and action = 'unsubscribe_link'
  ) then
    raise exception 'unsubscribe link did not log consent';
  end if;

  select master_enabled into master from public.email_settings where id;
  if master is distinct from true then
    raise exception 'owner master switch did not stick';
  end if;
end;
$checks$;
`

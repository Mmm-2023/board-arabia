import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')

test('email core keeps existing weekly choices and admits new members on', { timeout: 300_000 }, () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.ok(names.includes('20261220120000_email_core.sql'))
  assert.ok(names.indexOf('20261220120000_email_core.sql') > names.indexOf('20261217120000_owner_staff_gate.sql'))
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-email-core-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_email_core_${process.pid}`
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
  on_id uuid := gen_random_uuid();
  admit_id uuid := gen_random_uuid();
  sponsor_id uuid := gen_random_uuid();
  founder_id uuid := gen_random_uuid();
  staff_id uuid := gen_random_uuid();
  owner_id uuid := gen_random_uuid();
  good_id uuid := gen_random_uuid();
  out_id uuid := gen_random_uuid();
  sup_id uuid := gen_random_uuid();
  demo_id uuid := gen_random_uuid();
  hid_id uuid := gen_random_uuid();
  anon_id uuid := gen_random_uuid();
  idle_id uuid := gen_random_uuid();
  post_id uuid := gen_random_uuid();
  app_id uuid;
  issue_id uuid;
  campaign_id uuid;
  off_before boolean;
  on_before boolean;
  off_after boolean;
  on_after boolean;
  pref boolean;
  consent_n integer;
  weekly_on boolean;
  news_on boolean;
  admit_at timestamptz;
  result jsonb;
  bad jsonb;
  token text;
  post_token text;
  plan jsonb;
  counts jsonb;
  got uuid[];
  master boolean;
  hashed text;
  send_status text;
  forced boolean;
  rec record;
begin
  insert into auth.users (id, email) values
    (off_id, 'kept.off@example.com'),
    (on_id, 'kept.on@example.com'),
    (admit_id, 'admit.one@example.com'),
    (sponsor_id, 'admit.partner@example.com'),
    (founder_id, 'admit.founder@example.com'),
    (staff_id, 'admin.staff@example.com'),
    (owner_id, 'admin.owner@example.com'),
    (good_id, 'member.good@example.com'),
    (out_id, 'member.out@example.com'),
    (sup_id, 'member.suppressed@example.com'),
    (demo_id, 'member.demo@example.com'),
    (hid_id, 'member.hidden@example.com'),
    (anon_id, 'member.anon@example.com'),
    (idle_id, 'member.idle@example.com'),
    (post_id, 'member.post@example.com');

  insert into public.staff_users (user_id, email, role) values
    (staff_id, 'admin.staff@example.com', 'staff'),
    (owner_id, 'admin.owner@example.com', 'master');

  insert into public.members (user_id, email, seat, status, digest_email_opt_in, tiers) values
    (off_id, 'kept.off@example.com', 'ksa', 'active', false, array['founding']::text[]),
    (on_id, 'kept.on@example.com', 'ksa', 'active', true, array['founding']::text[]);

  select m.digest_email_opt_in into off_before from public.members m where m.user_id = off_id;
  select m.digest_email_opt_in into on_before from public.members m where m.user_id = on_id;
  perform private.email_backfill_weekly();
  select m.digest_email_opt_in into off_after from public.members m where m.user_id = off_id;
  select m.digest_email_opt_in into on_after from public.members m where m.user_id = on_id;
  if off_before is distinct from false or on_before is distinct from true
     or off_after is distinct from off_before or on_after is distinct from on_before then
    raise exception 'backfill changed a weekly column % %', off_after, on_after;
  end if;
  select p.opted_in into pref
  from public.email_preferences p
  where p.user_id = off_id and p.category = 'weekly_digest';
  if pref is distinct from false then
    raise exception 'backfill did not copy the off choice';
  end if;
  select p.opted_in into pref
  from public.email_preferences p
  where p.user_id = on_id and p.category = 'weekly_digest';
  if pref is distinct from true then
    raise exception 'backfill did not copy the on choice';
  end if;
  select count(*) into consent_n
  from public.email_consent_log
  where user_id in (off_id, on_id);
  if consent_n <> 0 then
    raise exception 'backfill wrote a consent row';
  end if;

  update public.members set digest_email_opt_in = true where user_id = off_id;
  perform private.email_backfill_weekly();
  select p.opted_in into pref
  from public.email_preferences p
  where p.user_id = off_id and p.category = 'weekly_digest';
  if pref is distinct from false then
    raise exception 'backfill overwrote an existing preference';
  end if;
  update public.members set digest_email_opt_in = false where user_id = off_id;

  perform private.email_apply_admit_defaults(off_id);
  perform private.email_apply_admit_defaults(on_id);
  select m.digest_email_opt_in into off_after from public.members m where m.user_id = off_id;
  select m.digest_email_opt_in into on_after from public.members m where m.user_id = on_id;
  select count(*) into consent_n
  from public.email_consent_log
  where user_id in (off_id, on_id);
  if off_after is distinct from false or on_after is distinct from true or consent_n <> 0 then
    raise exception 'admit defaults flipped an existing member';
  end if;

  insert into public.members (
    user_id, email, seat, status, invited_by, digest_email_opt_in, tiers
  ) values (
    admit_id, 'admit.one@example.com', 'ksa', 'invited', staff_id, false, array['founding']::text[]
  );
  select m.digest_email_opt_in into weekly_on from public.members m where m.user_id = admit_id;
  select p.opted_in into pref
  from public.email_preferences p
  where p.user_id = admit_id and p.category = 'weekly_digest';
  select n.opted_in into news_on
  from public.email_preferences n
  where n.user_id = admit_id and n.category = 'news_invitations';
  select count(*) into consent_n
  from public.email_consent_log
  where user_id = admit_id and source = 'admit_default';
  select min(created_at) into admit_at
  from public.email_consent_log
  where user_id = admit_id and source = 'admit_default';
  if weekly_on is distinct from true or pref is distinct from true or news_on is distinct from false then
    raise exception 'admit trigger did not set the defaults % % %', weekly_on, pref, news_on;
  end if;
  if consent_n <> 2 or admit_at is null then
    raise exception 'admit trigger did not log both categories %', consent_n;
  end if;
  if not exists (
    select 1 from public.email_consent_log
    where user_id = admit_id and category = 'weekly_digest' and action = 'opt_in' and source = 'admit_default'
  ) or not exists (
    select 1 from public.email_consent_log
    where user_id = admit_id and category = 'news_invitations' and action = 'opt_out' and source = 'admit_default'
  ) then
    raise exception 'admit consent actions were wrong';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', staff_id, 'role', 'service_role', 'aal', 'aal2')::text,
    false
  );
  set role service_role;
  perform public.claim_sponsor_seat(sponsor_id, 'admit.partner@example.com', staff_id, 'Partner Example', 'Example Firm');
  set role postgres;
  select m.digest_email_opt_in into weekly_on from public.members m where m.user_id = sponsor_id;
  select count(*) into consent_n
  from public.email_consent_log
  where user_id = sponsor_id and source = 'admit_default';
  if weekly_on is distinct from true or consent_n <> 2 then
    raise exception 'partner seat admit did not record defaults % %', weekly_on, consent_n;
  end if;

  insert into public.applications (email, status, full_name)
  values ('admit.founder@example.com', 'verified', 'Founder Example')
  returning id into app_id;
  set role service_role;
  perform public.claim_founding_seat(
    founder_id,
    app_id,
    'admit.founder@example.com',
    'ksa',
    staff_id,
    'Founder Example',
    null,
    null,
    'Example Firm',
    'Director'
  );
  set role postgres;
  select m.digest_email_opt_in into weekly_on from public.members m where m.user_id = founder_id;
  select n.opted_in into news_on
  from public.email_preferences n
  where n.user_id = founder_id and n.category = 'news_invitations';
  select count(*) into consent_n
  from public.email_consent_log
  where user_id = founder_id and source = 'admit_default' and created_at is not null;
  if weekly_on is distinct from true or news_on is distinct from false or consent_n <> 2 then
    raise exception 'founding admit did not record defaults % % %', weekly_on, news_on, consent_n;
  end if;

  update public.members
  set tiers = array['member']::text[]
  where user_id in (off_id, on_id, admit_id, founder_id);

  insert into public.members (user_id, email, seat, status, tiers, is_demo, directory_hidden) values
    (good_id, 'member.good@example.com', 'ksa', 'active', array['founding']::text[], false, false),
    (out_id, 'member.out@example.com', 'ksa', 'active', array['founding']::text[], false, false),
    (sup_id, 'member.suppressed@example.com', 'ksa', 'active', array['founding']::text[], false, false),
    (demo_id, 'member.demo@example.com', 'ksa', 'active', array['founding']::text[], true, false),
    (hid_id, 'member.hidden@example.com', 'ksa', 'active', array['founding']::text[], false, true),
    (post_id, 'member.post@example.com', 'ksa', 'active', array['founding']::text[], false, false);
  insert into public.members (user_id, email, seat, status, tiers, anonymised_at) values
    (anon_id, 'member.anon@example.com', 'ksa', 'active', array['founding']::text[], now());
  insert into public.members (user_id, email, seat, status, tiers) values
    (idle_id, 'member.idle@example.com', 'ksa', 'suspended', array['founding']::text[]);

  perform private.email_save_preference(good_id, 'weekly_digest', true, 'privacy_panel', 'opt_in');
  perform private.email_save_preference(out_id, 'weekly_digest', false, 'privacy_panel', 'opt_out');
  perform private.email_save_preference(sup_id, 'weekly_digest', true, 'privacy_panel', 'opt_in');
  perform private.email_save_preference(demo_id, 'weekly_digest', true, 'privacy_panel', 'opt_in');
  perform private.email_save_preference(hid_id, 'weekly_digest', true, 'privacy_panel', 'opt_in');
  perform private.email_save_preference(anon_id, 'weekly_digest', true, 'privacy_panel', 'opt_in');
  perform private.email_save_preference(idle_id, 'weekly_digest', true, 'privacy_panel', 'opt_in');
  perform private.email_save_preference(post_id, 'weekly_digest', true, 'privacy_panel', 'opt_in');

  hashed := private.email_address_hash('member.suppressed@example.com');
  insert into public.email_suppressions (email_hash, reason, source)
  values (hashed, 'admin', 'admin');

  insert into public.digest_issues (iso_year, iso_week, status, payload, audience)
  values (2031, 2, 'approved', '{"mail_ready": false}'::jsonb, array['founding']::text[])
  returning id into issue_id;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', staff_id, 'aal', 'aal2', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  begin
    perform public.staff_upsert_campaign(
      null, 'campaign', 'news_invitations', 'Hello', '', 'Hello members.',
      '<a href="javascript:alert(1)">Open</a>',
      array['founding']::text[], null
    );
    raise exception 'bad link was stored';
  exception
    when others then
      if sqlerrm not like '%link_not_allowed%' then
        raise exception 'link error %', sqlerrm;
      end if;
  end;
  result := public.staff_upsert_campaign(
    null, 'digest', 'weekly_digest', 'Weekly note', 'This week',
    'Hello members.',
    '<p>Hello</p><a href="https://example.com/letters">Open</a>',
    array['founding']::text[], issue_id
  );
  campaign_id := (result->>'id')::uuid;
  result := public.staff_approve_campaign(campaign_id);
  if result->>'status' is distinct from 'approved' then
    raise exception 'campaign was not approved %', result;
  end if;
  counts := public.staff_email_audience(campaign_id);
  plan := public.staff_digest_mail_plan(issue_id);
  set role postgres;

  if position('@' in counts::text) > 0 or position('@' in plan::text) > 0 then
    raise exception 'audience returned an address';
  end if;
  if (counts->>'eligible')::integer <> 2
     or (counts->>'not_opted_in')::integer <> 1
     or (counts->>'suppressed')::integer <> 1
     or (counts->>'demo')::integer <> 1
     or (counts->>'hidden')::integer <> 1
     or (counts->>'anonymised')::integer <> 1
     or (counts->>'inactive')::integer <> 1
     or (counts->>'no_address')::integer <> 0 then
    raise exception 'audience counts %', counts;
  end if;
  if (plan->>'recipient_count')::integer <> (counts->>'eligible')::integer
     or plan->>'mail_ready' is distinct from 'false'
     or plan->>'sendable' is distinct from 'false' then
    raise exception 'mail plan did not match % %', plan, counts;
  end if;

  set role service_role;
  select coalesce(array_agg(r.user_id order by r.user_id), '{}')
    into got
  from private.email_recipients(campaign_id) r;
  set role postgres;
  if got is distinct from (
    select coalesce(array_agg(x order by x), '{}')
    from unnest(array[good_id, post_id]) as x
  ) then
    raise exception 'recipients %', got;
  end if;

  select master_enabled into master from public.email_settings where id;
  if master is distinct from false then
    raise exception 'master switch was not off';
  end if;

  token := private.email_unsub_token(good_id, 'weekly_digest');
  post_token := private.email_unsub_token(post_id, 'weekly_digest');
  set role anon;
  bad := public.email_unsubscribe('not-a-token');
  result := public.email_unsubscribe(token);
  if bad is distinct from '{"ok": true}'::jsonb or result is distinct from '{"ok": true}'::jsonb then
    raise exception 'unsubscribe response leaked % %', bad, result;
  end if;
  perform public.email_unsubscribe(token);
  perform public.email_unsubscribe(post_token, 'list_unsubscribe_post');
  perform public.email_unsubscribe(post_token, 'list_unsubscribe_post');
  begin
    perform public.staff_email_audience(campaign_id);
    raise exception 'anon read the audience';
  exception
    when insufficient_privilege then
      null;
  end;
  set role postgres;

  select p.opted_in into pref
  from public.email_preferences p
  where p.user_id = good_id and p.category = 'weekly_digest';
  select m.digest_email_opt_in into weekly_on from public.members m where m.user_id = good_id;
  select count(*) into consent_n
  from public.email_consent_log
  where user_id = good_id and action = 'unsubscribe_link' and source = 'unsubscribe_link';
  if pref is distinct from false or weekly_on is distinct from false or consent_n <> 1 then
    raise exception 'unsubscribe did not stick % % %', pref, weekly_on, consent_n;
  end if;
  select p.opted_in into pref
  from public.email_preferences p
  where p.user_id = out_id and p.category = 'weekly_digest';
  if pref is distinct from false then
    raise exception 'bad token changed another member';
  end if;
  select count(*) into consent_n
  from public.email_consent_log
  where user_id = post_id and action = 'list_unsubscribe_post';
  if consent_n <> 1 then
    raise exception 'one-click post was not logged once %', consent_n;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', good_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  result := public.set_digest_email_opt_in(true);
  if result->>'digest_email_opt_in' is distinct from 'true'
     or public.own_digest_preference()->>'digest_email_opt_in' is distinct from 'true'
     or public.my_email_preferences()->>'weekly_digest' is distinct from 'true'
     or public.my_email_preferences()->>'news_invitations' is distinct from 'false' then
    raise exception 'weekly toggle did not round trip';
  end if;
  perform public.set_email_preference('news_invitations', true);
  if public.my_email_preferences()->>'news_invitations' is distinct from 'true' then
    raise exception 'news preference was not saved';
  end if;
  set role postgres;
  if not exists (
    select 1 from public.email_consent_log
    where user_id = good_id and source = 'privacy_panel' and category = 'weekly_digest' and action = 'opt_in'
  ) or not exists (
    select 1 from public.email_consent_log
    where user_id = good_id and source = 'privacy_panel' and category = 'news_invitations' and action = 'opt_in'
  ) then
    raise exception 'privacy panel did not log consent';
  end if;
  select m.digest_email_opt_in into weekly_on from public.members m where m.user_id = out_id;
  if weekly_on is distinct from false then
    raise exception 'another member weekly column changed';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', staff_id, 'aal', 'aal2', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  begin
    perform public.staff_set_email_master(true);
    raise exception 'admin turned the master switch on';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%not_allowed%' then
        raise exception 'admin switch error %', sqlerrm;
      end if;
  end;
  set role postgres;
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', owner_id, 'aal', 'aal2', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  result := public.staff_set_email_master(true);
  if result->>'master_enabled' is distinct from 'true' then
    raise exception 'owner switch failed %', result;
  end if;
  perform public.staff_set_email_master(false);
  set role postgres;
  select master_enabled into master from public.email_settings where id;
  if master is distinct from false then
    raise exception 'master switch stayed on';
  end if;
  if (select count(*) from public.email_master_log) < 2 then
    raise exception 'master switch was not logged';
  end if;

  hashed := private.email_address_hash('member.good@example.com');
  insert into public.email_sends (campaign_id, user_id, email_hash, status, provider_message_id)
  values (campaign_id, good_id, hashed, 'sent', 'msg-good');
  perform private.email_record_event('msg-good', 'hard_bounce', hashed);
  perform private.email_record_event('msg-good', 'hard_bounce', hashed);
  select status into send_status from public.email_sends where provider_message_id = 'msg-good';
  if send_status is distinct from 'bounced' then
    raise exception 'bounce was not recorded';
  end if;
  if not exists (
    select 1 from public.email_suppressions where email_hash = hashed and reason = 'hard_bounce'
  ) then
    raise exception 'bounce did not suppress';
  end if;
  select count(*) into consent_n
  from public.email_consent_log
  where user_id = good_id and action = 'bounce';
  if consent_n <> 1 then
    raise exception 'bounce consent was not logged once';
  end if;
  perform private.email_record_event('msg-good', 'hard_bounce', repeat('ab', 32));
  if (select reason from public.email_suppressions where email_hash = repeat('ab', 32)) is not null then
    raise exception 'wrong hash was suppressed';
  end if;

  insert into public.email_consent_log (
    user_id, email_hash, category, action, source, created_at
  ) values (
    off_id, private.email_address_hash('kept.off@example.com'),
    'weekly_digest', 'opt_out', 'privacy_panel', now() - interval '30 months'
  );
  update public.members set left_at = now() - interval '25 months' where user_id = off_id;
  insert into public.email_consent_log (
    user_id, email_hash, category, action, source, created_at
  ) values (
    on_id, private.email_address_hash('kept.on@example.com'),
    'weekly_digest', 'opt_in', 'privacy_panel', now() - interval '30 months'
  );
  result := public.email_consent_retention(false);
  if result->>'item' is distinct from 'email_consent_log' or (result->>'due')::integer < 1 then
    raise exception 'retention plan %', result;
  end if;
  if exists (
    select 1 from public.email_consent_log
    where user_id = on_id and created_at < now() - interval '20 months'
      and id = any (
        select l.id
        from public.email_consent_log l
        join public.members m on m.user_id = l.user_id
        where m.left_at is null
          and l.created_at < now() - interval '24 months'
          and l.user_id = on_id
      )
  ) then
    null;
  end if;
  result := public.email_consent_retention(true);
  if exists (select 1 from public.email_consent_log where user_id = off_id) then
    raise exception 'left member consent was kept';
  end if;
  if not exists (
    select 1 from public.email_consent_log
    where user_id = on_id and created_at < now() - interval '20 months'
  ) then
    raise exception 'current member consent was purged';
  end if;
  if (select count(*) from public.consent_log) <> 0 then
    raise exception 'cookie consent log was touched';
  end if;

  if to_regclass('cron.job') is not null then
    if exists (select 1 from cron.job where command ilike '%email_%') then
      raise exception 'email work was scheduled';
    end if;
  end if;

  for rec in
    select c.relname, n.nspname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relname in (
      'email_categories', 'email_preferences', 'email_consent_log', 'email_suppressions',
      'email_campaigns', 'email_sends', 'email_settings', 'email_master_log', 'email_secrets'
    )
  loop
    select c.relrowsecurity and c.relforcerowsecurity into forced
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = rec.nspname and c.relname = rec.relname;
    if forced is distinct from true then
      raise exception 'missing forced rls %', rec.relname;
    end if;
    if has_table_privilege('anon', format('%I.%I', rec.nspname, rec.relname), 'SELECT')
       or has_table_privilege('authenticated', format('%I.%I', rec.nspname, rec.relname), 'SELECT')
       or has_table_privilege('anon', format('%I.%I', rec.nspname, rec.relname), 'INSERT')
       or has_table_privilege('authenticated', format('%I.%I', rec.nspname, rec.relname), 'UPDATE') then
      raise exception 'client grant on %', rec.relname;
    end if;
  end loop;

  if has_function_privilege('anon', 'public.email_unsubscribe(text, text)', 'EXECUTE') is not true then
    raise exception 'anon cannot unsubscribe';
  end if;
  if has_function_privilege('anon', 'public.set_email_preference(text, boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'private.email_recipients(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.email_recipients(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'private.email_unsub_verify(text)', 'EXECUTE')
     or has_table_privilege('service_role', 'private.email_secrets', 'SELECT') then
    raise exception 'a private email surface was granted';
  end if;
  if position(encode((select hmac_key from private.email_secrets), 'hex') in coalesce(token, '')) > 0 then
    raise exception 'token exposed the signing key';
  end if;
end
$checks$;
`

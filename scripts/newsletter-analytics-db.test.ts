import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261231120000_newsletter_analytics.sql'

test('newsletter counts mask small cells and stay staff only', { timeout: 300_000 }, () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.equal(names.includes(migrationName), true)
  assert.ok(names.indexOf(migrationName) > names.indexOf('20261221120000_newsletter_events.sql'))
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-newsletter-stats-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_newsletter_stats_${process.pid}`
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
create or replace function pg_temp.note_event(
  p_send uuid,
  p_event text,
  p_url text,
  p_at timestamptz
) returns void
language plpgsql
as $$
begin
  update public.email_sends
  set measure = true
  where id = p_send
    and is_test = false;
  insert into public.newsletter_events (send_id, message_id, event, url, occurred_at)
  values (
    p_send,
    substr(p_send::text, 1, 8) || '-' || p_event || '-' || replace(p_at::text, ' ', 'T'),
    p_event,
    p_url,
    p_at
  );
end;
$$;

do $checks$
declare
  staff_id uuid := gen_random_uuid();
  member_id uuid := gen_random_uuid();
  campaign_a uuid;
  campaign_b uuid;
  founding_ids uuid[] := '{}';
  member_ids uuid[] := '{}';
  trend_ids uuid[] := '{}';
  fid uuid;
  sid uuid;
  hashed text;
  i integer;
  n integer;
  issue_id uuid;
  week_campaign uuid;
  sent_at timestamptz;
  stats jsonb;
  later jsonb;
  trend jsonb;
  master boolean;
  definer boolean;
  pinned boolean;
  account_mail integer;
  removed integer;
  kept integer;
begin
  insert into auth.users (id, email) values (staff_id, 'admin.stats@example.com'), (member_id, 'member.reader@example.com');
  insert into public.staff_users (user_id, email, role) values (staff_id, 'admin.stats@example.com', 'staff');
  insert into public.members (user_id, email, seat, status, tiers)
  values (member_id, 'member.reader@example.com', 'ksa', 'active', array['member']::text[]);

  for i in 1..6 loop
    fid := gen_random_uuid();
    founding_ids := founding_ids || fid;
    insert into auth.users (id, email) values (fid, 'founding.' || i || '@example.com');
    insert into public.members (user_id, email, seat, status, tiers)
    values (fid, 'founding.' || i || '@example.com', 'ksa', 'active', array['founding']::text[]);
  end loop;
  for i in 1..4 loop
    fid := gen_random_uuid();
    member_ids := member_ids || fid;
    insert into auth.users (id, email) values (fid, 'tier.member.' || i || '@example.com');
    insert into public.members (user_id, email, seat, status, tiers)
    values (fid, 'tier.member.' || i || '@example.com', 'ksa', 'active', array['member']::text[]);
  end loop;
  for i in 1..5 loop
    fid := gen_random_uuid();
    trend_ids := trend_ids || fid;
    insert into auth.users (id, email) values (fid, 'trend.' || i || '@example.com');
    insert into public.members (user_id, email, seat, status, tiers)
    values (fid, 'trend.' || i || '@example.com', 'ksa', 'active', array['founding']::text[]);
  end loop;
  insert into public.email_preferences (user_id, category, opted_in)
  select x, 'measure_opens', true
  from unnest(founding_ids || member_ids || trend_ids) as x
  on conflict (user_id, category) do update set opted_in = true;

  insert into public.email_campaigns (
    kind, category, subject, body_text, body_html_sanitised, audience_tiers, status, created_by
  ) values (
    'campaign', 'news_invitations', 'Hello', 'Hello', '<p>Hello</p>',
    array['founding', 'member']::text[], 'sent', staff_id
  ) returning id into campaign_a;

  for i in 1..6 loop
    hashed := private.email_address_hash('founding.' || i || '@example.com');
    insert into public.email_sends (campaign_id, user_id, email_hash, status, is_test, created_at)
    values (campaign_a, founding_ids[i], hashed, 'sent', false, '2026-10-01 09:00:00+00')
    returning id into sid;
    perform pg_temp.note_event(sid, 'delivered', null, '2026-10-01 10:00:00+00');
    perform pg_temp.note_event(sid, 'opened', null, '2026-10-01 10:01:00+00');
    perform pg_temp.note_event(sid, 'clicked', 'https://Example.com/story/?utm_source=letter', '2026-10-01 10:02:00+00');
    perform pg_temp.note_event(sid, 'clicked', 'https://example.com/story', '2026-10-01 10:03:00+00');
    perform pg_temp.note_event(sid, 'clicked', 'https://example.com/email/unsubscribe?t=example', '2026-10-01 10:04:00+00');
    perform pg_temp.note_event(sid, 'bounced', null, '2026-10-01 10:05:00+00');
    if i <= 3 then
      perform pg_temp.note_event(sid, 'clicked', 'https://example.com/small', '2026-10-01 10:06:00+00');
    end if;
    perform pg_temp.note_event(sid, 'clicked', 'https://example.com/other', '2026-10-01 10:07:00+00');
    insert into public.email_consent_log (user_id, email_hash, category, action, source, created_at)
    values (founding_ids[i], hashed, 'news_invitations', 'unsubscribe_link', 'unsubscribe_link', '2026-10-02 09:00:00+00');
  end loop;

  for i in 1..4 loop
    hashed := private.email_address_hash('tier.member.' || i || '@example.com');
    insert into public.email_sends (campaign_id, user_id, email_hash, status, is_test, created_at)
    values (campaign_a, member_ids[i], hashed, 'sent', false, '2026-10-01 09:00:00+00')
    returning id into sid;
    perform pg_temp.note_event(sid, 'delivered', null, '2026-10-01 11:00:00+00');
    perform pg_temp.note_event(sid, 'opened', null, '2026-10-01 11:01:00+00');
  end loop;

  hashed := private.email_address_hash('founding.1@example.com');
  insert into public.email_sends (campaign_id, user_id, email_hash, status, is_test, created_at)
  values (campaign_a, founding_ids[1], hashed, 'sent', true, '2026-10-01 12:00:00+00')
  returning id into sid;
  for i in 1..20 loop
    perform pg_temp.note_event(sid, 'opened', null, ('2026-10-01 12:10:00+00'::timestamptz + make_interval(secs => i)));
  end loop;

  insert into public.email_consent_log (user_id, email_hash, category, action, source, created_at)
  values (
    founding_ids[1], hashed, 'weekly_digest', 'unsubscribe_link', 'unsubscribe_link', '2026-10-02 10:00:00+00'
  );
  insert into public.email_consent_log (user_id, email_hash, category, action, source, created_at)
  values (
    null, repeat('ab', 32), 'news_invitations', 'unsubscribe_link', 'unsubscribe_link', '2026-10-02 11:00:00+00'
  );

  insert into public.email_campaigns (
    kind, category, subject, body_text, body_html_sanitised, audience_tiers, status, created_by
  ) values (
    'campaign', 'news_invitations', 'Later', 'Later', '<p>Later</p>',
    array['founding']::text[], 'sent', staff_id
  ) returning id into campaign_b;
  for i in 1..6 loop
    insert into public.email_sends (campaign_id, user_id, email_hash, status, is_test, created_at)
    values (
      campaign_b,
      founding_ids[i],
      private.email_address_hash('founding.' || i || '@example.com'),
      'sent',
      false,
      '2026-10-03 09:00:00+00'
    );
  end loop;

  insert into public.digest_issues (iso_year, iso_week, status, payload, audience)
  values (2031, 53, 'approved', '{}'::jsonb, array['founding']::text[])
  returning id into issue_id;
  insert into public.email_campaigns (
    kind, category, subject, body_text, body_html_sanitised, audience_tiers, status, created_by, digest_issue_id
  ) values (
    'digest', 'weekly_digest', 'Old week', 'Old', '<p>Old</p>',
    array['founding']::text[], 'sent', staff_id, issue_id
  ) returning id into week_campaign;
  for i in 1..5 loop
    hashed := private.email_address_hash('trend.' || i || '@example.com');
    insert into public.email_sends (campaign_id, user_id, email_hash, status, is_test, created_at)
    values (week_campaign, trend_ids[i], hashed, 'sent', false, '2031-12-01 09:00:00+00')
    returning id into sid;
    perform pg_temp.note_event(sid, 'delivered', null, '2031-12-01 10:00:00+00');
    perform pg_temp.note_event(sid, 'opened', null, '2031-12-01 10:01:00+00');
    perform pg_temp.note_event(sid, 'clicked', 'https://example.com/old', '2031-12-01 10:02:00+00');
    perform pg_temp.note_event(sid, 'bounced', null, '2031-12-01 10:03:00+00');
    insert into public.email_consent_log (user_id, email_hash, category, action, source, created_at)
    values (trend_ids[i], hashed, 'weekly_digest', 'unsubscribe_link', 'unsubscribe_link', '2031-12-02 09:00:00+00');
  end loop;

  for n in 1..12 loop
    insert into public.digest_issues (iso_year, iso_week, status, payload, audience)
    values (2032, n, 'approved', '{}'::jsonb, array['founding']::text[])
    returning id into issue_id;
    insert into public.email_campaigns (
      kind, category, subject, body_text, body_html_sanitised, audience_tiers, status, created_by, digest_issue_id
    ) values (
      'digest', 'weekly_digest', 'Week', 'Week', '<p>Week</p>',
      array['founding']::text[], 'sent', staff_id, issue_id
    ) returning id into week_campaign;
    sent_at := timestamptz '2032-01-06 09:00:00+00' + make_interval(days => n);
    for i in 1..5 loop
      hashed := private.email_address_hash('trend.' || i || '@example.com');
      insert into public.email_sends (campaign_id, user_id, email_hash, status, is_test, created_at)
      values (week_campaign, trend_ids[i], hashed, 'sent', false, sent_at)
      returning id into sid;
      perform pg_temp.note_event(sid, 'delivered', null, sent_at + interval '1 minute');
      perform pg_temp.note_event(sid, 'opened', null, sent_at + interval '2 minutes');
      perform pg_temp.note_event(sid, 'clicked', 'https://example.com/week', sent_at + interval '3 minutes');
      perform pg_temp.note_event(sid, 'bounced', null, sent_at + interval '4 minutes');
      if n < 12 or i <= 2 then
        insert into public.email_consent_log (user_id, email_hash, category, action, source, created_at)
        values (
          trend_ids[i], hashed, 'weekly_digest', 'list_unsubscribe_post', 'list_unsubscribe_post',
          sent_at + interval '1 hour'
        );
      end if;
    end loop;
  end loop;

  select p.prosecdef,
    exists (select 1 from unnest(p.proconfig) cfg where cfg = 'search_path=""')
    into definer, pinned
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'staff_newsletter_stats';
  if definer is distinct from true or pinned is distinct from true then
    raise exception 'stats definer or search_path missing';
  end if;
  if has_function_privilege('anon', 'public.staff_newsletter_stats(uuid)', 'execute')
     or has_function_privilege('service_role', 'public.staff_newsletter_stats(uuid)', 'execute')
     or has_function_privilege('anon', 'public.staff_newsletter_trend()', 'execute') then
    raise exception 'stats granted too widely';
  end if;
  if not has_function_privilege('authenticated', 'public.staff_newsletter_stats(uuid)', 'execute') then
    raise exception 'staff role cannot execute stats';
  end if;
  if position('email_events' in pg_get_functiondef('public.staff_newsletter_stats(uuid)'::regprocedure)) > 0
     or position('email_events' in pg_get_functiondef('public.staff_newsletter_trend()'::regprocedure)) > 0 then
    raise exception 'analytics reads account mail';
  end if;
  select count(*) into account_mail from public.email_events;
  if account_mail <> 0 then
    raise exception 'account mail log was written';
  end if;
  select master_enabled into master from public.email_settings where id;
  if master is distinct from false then
    raise exception 'master switch changed';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', staff_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  stats := public.staff_newsletter_stats(campaign_a);
  later := public.staff_newsletter_stats(campaign_b);
  trend := public.staff_newsletter_trend();
  begin
    perform public.staff_upsert_campaign(
      null, 'campaign', 'measure_opens', 'Hello', '', 'Hello members.',
      '<p>Hello</p>', array['founding']::text[], null
    );
    raise exception 'measure_opens was accepted as an audience';
  exception
    when others then
      if sqlerrm not like '%not_allowed%' then
        raise exception 'measure_opens error %', sqlerrm;
      end if;
  end;
  begin
    perform public.staff_newsletter_stats(gen_random_uuid());
    raise exception 'missing campaign returned a row';
  exception
    when others then
      if sqlerrm not like '%not_found%' then
        raise exception 'missing campaign error %', sqlerrm;
      end if;
  end;
  set role postgres;

  if stats->>'opens' is distinct from 'approximate'
     or stats->>'measured_only' is distinct from 'true'
     or trend->>'opens' is distinct from 'approximate' then
    raise exception 'opens were not labelled approximate % %', stats->>'opens', trend->>'opens';
  end if;
  if jsonb_typeof(stats->'counts'->'sent') is distinct from 'string' then
    raise exception 'counts were not text';
  end if;
  if stats->'counts'->>'sent' is distinct from '10'
     or stats->'counts'->>'delivered' is distinct from '10'
     or stats->'counts'->>'unique_opens' is distinct from '10'
     or stats->'counts'->>'total_opens' is distinct from '10'
     or stats->'counts'->>'open_rate' is distinct from '100%'
     or stats->'counts'->>'unique_clicks' is distinct from '6'
     or stats->'counts'->>'total_clicks' is distinct from '21'
     or stats->'counts'->>'click_rate' is distinct from '60%'
     or stats->'counts'->>'bounces' is distinct from '6'
     or stats->'counts'->>'complaints' is distinct from '<5'
     or stats->'counts'->>'unsubscribes' is distinct from '6' then
    raise exception 'campaign counts %', stats->'counts';
  end if;
  if stats->'tiers'->0->>'tier' is distinct from 'founding'
     or stats->'tiers'->0->'counts'->>'sent' is distinct from '6'
     or stats->'tiers'->0->'counts'->>'click_rate' is distinct from '100%'
     or stats->'tiers'->1->>'tier' is distinct from 'member'
     or stats->'tiers'->1->'counts'->>'sent' is distinct from '<5'
     or stats->'tiers'->1->'counts'->>'open_rate' is distinct from '<5'
     or stats->'tiers'->1->'counts'->>'unsubscribes' is distinct from '<5' then
    raise exception 'tier counts %', stats->'tiers';
  end if;
  if jsonb_array_length(stats->'links') <> 2
     or stats->'links'->0->>'url' is distinct from 'https://example.com/story'
     or stats->'links'->0->>'unique' is distinct from '6'
     or stats->'links'->0->>'total' is distinct from '12'
     or stats->'links'->1->>'url' is distinct from 'https://example.com/other'
     or stats::text like '%example.com/small%'
     or stats::text like '%?%' then
    raise exception 'links %', stats->'links';
  end if;
  if stats::text like '%/email/unsubscribe%' or stats::text like '%@%'
     or position(founding_ids[1]::text in stats::text) > 0
     or position(private.email_address_hash('founding.1@example.com') in stats::text) > 0 then
    raise exception 'stats leaked a person %', stats;
  end if;
  if later->'counts'->>'unsubscribes' is distinct from '<5'
     or later->'counts'->>'delivered' is distinct from '<5' then
    raise exception 'later letter took the earlier unsubscribe %', later->'counts';
  end if;
  if jsonb_array_length(trend->'issues') <> 12
     or trend->'issues'->0->>'iso_year' is distinct from '2032'
     or trend->'issues'->0->>'iso_week' is distinct from '1'
     or trend->'issues'->0->>'open_rate' is distinct from '100%'
     or trend->'issues'->0->>'click_rate' is distinct from '100%'
     or trend->'issues'->0->>'bounces' is distinct from '5'
     or trend->'issues'->0->>'unsubscribes' is distinct from '5'
     or trend->'issues'->11->>'iso_week' is distinct from '12'
     or trend->'issues'->11->>'unsubscribes' is distinct from '<5'
     or trend::text like '%2031%' then
    raise exception 'trend %', trend->'issues';
  end if;

  insert into public.newsletter_events (send_id, message_id, event, occurred_at)
  select s.id, 'old-measure', 'opened', pg_catalog.now() - interval '14 months'
  from public.email_sends s
  where s.campaign_id = campaign_a and s.is_test = false
  limit 1;
  insert into public.newsletter_events (send_id, message_id, event, occurred_at)
  select s.id, 'kept-measure', 'opened', pg_catalog.now()
  from public.email_sends s
  where s.campaign_id = campaign_a and s.is_test = false
  limit 1;
  set role service_role;
  removed := public.newsletter_events_retention();
  set role postgres;
  select count(*) into kept from public.newsletter_events where message_id = 'kept-measure';
  if removed < 1
     or exists (select 1 from public.newsletter_events where message_id = 'old-measure')
     or kept <> 1 then
    raise exception 'retention did not keep the recent row % %', removed, kept;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', member_id, 'aal', 'aal2', 'role', 'authenticated')::text,
    false
  );
  set role authenticated;
  begin
    perform public.staff_newsletter_stats(campaign_a);
    raise exception 'member read stats';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%not_allowed%' then
        raise exception 'member error %', sqlerrm;
      end if;
  end;
  begin
    perform public.staff_newsletter_trend();
    raise exception 'member read the trend';
  exception
    when insufficient_privilege then
      if sqlerrm not like '%not_allowed%' then
        raise exception 'member trend error %', sqlerrm;
      end if;
  end;
  begin
    perform public.newsletter_events_retention();
    raise exception 'member deleted measurement rows';
  exception
    when insufficient_privilege then
      if sqlerrm like '%not_allowed%' then
        raise exception 'member reached the retention body';
      end if;
  end;
  if public.my_email_preferences()->>'measure_opens' is distinct from 'false' then
    raise exception 'measurement was on by default';
  end if;
  perform public.set_email_preference('measure_opens', true);
  if public.my_email_preferences()->>'measure_opens' is distinct from 'true' then
    raise exception 'measurement toggle did not save';
  end if;
  set role postgres;
  if not exists (
    select 1 from public.email_consent_log
    where user_id = member_id
      and category = 'measure_opens'
      and action = 'opt_in'
      and source = 'privacy_panel'
  ) then
    raise exception 'measurement consent was not logged';
  end if;
  set role anon;
  begin
    perform public.staff_newsletter_stats(campaign_a);
    raise exception 'anon read stats';
  exception
    when insufficient_privilege then
      if sqlerrm like '%not_allowed%' then
        raise exception 'anon reached the staff check';
      end if;
  end;
  set role postgres;
end;
$checks$;
`

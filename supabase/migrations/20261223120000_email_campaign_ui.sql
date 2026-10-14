-- Campaign screen support for letters and the release gate.
-- Does not send mail. Does not schedule anything. Does not call a network.
-- The master switch stays off. Nothing in this file turns it on.
-- A test of the stored letter is recorded by email-send, not by this file.
-- Release reads test_sent_by, test_content_hash, and content_hash. It does not store an address.
-- The sign-up consent prompt is not in this file. It is waiting on the owner.
-- This file does not replace staff_upsert_campaign. An edit still clears the owner test.
-- Apply after 20261221120000_newsletter_events.sql. 20261222120000 is already used.
-- Factory does not apply migrations.

create or replace function public.my_email_preferences()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  weekly_col boolean;
  weekly_pref boolean;
  news_pref boolean;
  connected boolean;
begin
  if auth.uid() is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select m.digest_email_opt_in into weekly_col
  from public.members m
  where m.user_id = auth.uid()
    and m.status in ('invited', 'active');
  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select p.opted_in into weekly_pref
  from public.email_preferences p
  where p.user_id = auth.uid() and p.category = 'weekly_digest';
  select p.opted_in into news_pref
  from public.email_preferences p
  where p.user_id = auth.uid() and p.category = 'news_invitations';
  select s.master_enabled into connected
  from public.email_settings s
  where s.id;
  return pg_catalog.jsonb_build_object(
    'weekly_digest', coalesce(weekly_pref, weekly_col, false),
    'news_invitations', coalesce(news_pref, false),
    'delivery_connected', coalesce(connected, false)
  );
end;
$fn$;

revoke all on function public.my_email_preferences() from public, anon;
grant execute on function public.my_email_preferences() to authenticated;

create or replace function public.staff_email_release_gate(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner boolean;
  v_master boolean;
  v_status text;
  v_category text;
  v_audience text[];
  v_hash text;
  v_test_hash text;
  v_test_by uuid;
  v_approved timestamptz;
  v_match boolean := false;
  v_counts jsonb;
  v_eligible integer := 0;
  v_ready boolean := false;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  v_owner := private.is_owner();
  select s.master_enabled into v_master from public.email_settings s where s.id;
  select
    c.status, c.category, c.audience_tiers, c.content_hash, c.test_content_hash,
    c.test_sent_by, c.approved_at
    into
      v_status, v_category, v_audience, v_hash, v_test_hash, v_test_by, v_approved
  from public.email_campaigns c
  where c.id = p_campaign_id;
  if v_status is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_match := v_hash is not null
    and v_test_hash is not null
    and v_hash = v_test_hash;
  v_ready := v_owner
    and coalesce(v_master, false)
    and v_status in ('test_sent', 'sending')
    and v_test_by is not null
    and v_test_by = auth.uid()
    and v_match;
  v_counts := private.email_audience_counts(v_audience, v_category);
  v_eligible := coalesce((v_counts->>'eligible')::integer, 0);
  return pg_catalog.jsonb_build_object(
    'ready', v_ready,
    'is_owner', v_owner,
    'master_enabled', coalesce(v_master, false),
    'approved', v_approved is not null,
    'status', v_status,
    'test_sent', v_status in ('test_sent', 'sending') and v_test_by = auth.uid() and v_match,
    'version_matches', v_match,
    'eligible', v_eligible
  );
end;
$$;

revoke all on function public.staff_email_release_gate(uuid) from public, anon;
grant execute on function public.staff_email_release_gate(uuid) to authenticated;

comment on function public.staff_email_release_gate(uuid) is
  'Read-only view of the server release rule: master switch, test_sent_by, and matching content_hash. Does not send mail.';

create or replace function private.email_newsletter_event_rows(p_campaign_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce(pg_catalog.jsonb_agg(ev.payload order by ev.at desc), '[]'::jsonb)
  from (
    select e.occurred_at as at,
      pg_catalog.jsonb_build_object(
        'status', e.event,
        'at', e.occurred_at,
        'is_test', false,
        'url', e.url
      ) as payload
    from public.newsletter_events e
    join public.email_sends s on s.id = e.send_id
    where s.campaign_id = p_campaign_id
    order by e.occurred_at desc
    limit 8
  ) ev;
$fn$;

revoke all on function private.email_newsletter_event_rows(uuid) from public, anon, authenticated;

comment on function private.email_newsletter_event_rows(uuid) is
  'Latest webhook rows from public.newsletter_events for one letter. The transactional mail log is not read. Does not send mail.';

create or replace function public.staff_email_screen()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_master boolean;
  v_owner boolean;
  v_rows jsonb;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select s.master_enabled into v_master from public.email_settings s where s.id;
  v_owner := private.is_owner();
  select coalesce(pg_catalog.jsonb_agg(item.payload order by item.created_at desc), '[]'::jsonb)
    into v_rows
  from (
    select c.created_at,
      pg_catalog.jsonb_build_object(
        'id', c.id,
        'kind', c.kind,
        'category', c.category,
        'subject', c.subject,
        'preheader', c.preheader,
        'body_text', c.body_text,
        'status', c.status,
        'audience_tiers', pg_catalog.to_jsonb(c.audience_tiers),
        'digest_issue_id', c.digest_issue_id,
        'created_at', c.created_at,
        'approved', c.approved_at is not null,
        'audience', private.email_audience_counts(c.audience_tiers, c.category),
        'release', public.staff_email_release_gate(c.id),
        'log', pg_catalog.jsonb_build_object(
          'queued', (
            select count(*) from public.email_sends s
            where s.campaign_id = c.id and s.status = 'queued' and s.is_test = false
          ),
          'skipped', (
            select count(*) from public.email_sends s
            where s.campaign_id = c.id and s.status = 'skipped' and s.is_test = false
          ),
          'sent', (
            select count(*) from public.email_sends s
            where s.campaign_id = c.id and s.status = 'sent' and s.is_test = false
          ),
          'delivered', (
            select count(*) from public.email_sends s
            where s.campaign_id = c.id and s.status = 'delivered' and s.is_test = false
          ),
          'bounced', (
            select count(*) from public.email_sends s
            where s.campaign_id = c.id and s.status = 'bounced' and s.is_test = false
          ),
          'complained', (
            select count(*) from public.email_sends s
            where s.campaign_id = c.id and s.status = 'complained' and s.is_test = false
          ),
          'failed', (
            select count(*) from public.email_sends s
            where s.campaign_id = c.id and s.status = 'failed' and s.is_test = false
          ),
          'test', (
            select count(*) from public.email_sends s
            where s.campaign_id = c.id and s.is_test
          ),
          'events', private.email_newsletter_event_rows(c.id)
        )
      ) as payload
    from public.email_campaigns c
    order by c.created_at desc
    limit 40
  ) item;
  return pg_catalog.jsonb_build_object(
    'master_enabled', coalesce(v_master, false),
    'is_owner', v_owner,
    'campaigns', coalesce(v_rows, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.staff_email_screen() from public, anon;
grant execute on function public.staff_email_screen() to authenticated;

comment on function public.staff_email_screen() is
  'Admin letter list, audience counts, and send log counts. No address is returned. Does not send mail.';

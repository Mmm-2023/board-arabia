-- Aggregate newsletter results for admin.
-- Reads public.newsletter_events, the send log, and the unsubscribe log.
-- Does not read the account mail log.
-- Returns counts only. A count under 5 is the text <5.
-- Opens are marked approximate. No per-person list is returned.
-- Does not send mail. Does not schedule anything. Does not call a network.
-- Apply after 20261230120000_staff_aal1_access.sql.
-- 20261229120000 is reserved and is not this file.
-- Factory does not apply migrations.

alter table public.newsletter_events enable row level security;
alter table public.newsletter_events force row level security;

create index if not exists newsletter_events_event_send_idx
  on public.newsletter_events (event, send_id);

create index if not exists email_consent_log_hash_category_idx
  on public.email_consent_log (email_hash, category, created_at);

create or replace function private.newsletter_mask_count(p_value bigint)
returns text
language sql
immutable
set search_path = ''
as $fn$
  select case
    when p_value is null or p_value < 5 then '<5'
    else p_value::text
  end;
$fn$;

revoke all on function private.newsletter_mask_count(bigint) from public;
revoke all on function private.newsletter_mask_count(bigint) from anon, authenticated, service_role;

create or replace function private.newsletter_mask_rate(p_num bigint, p_den bigint)
returns text
language sql
immutable
set search_path = ''
as $fn$
  select case
    when p_num is null or p_den is null or p_num < 5 or p_den < 5 then '<5'
    else pg_catalog.regexp_replace(
      pg_catalog.to_char(
        pg_catalog.round((100.0 * p_num::numeric) / p_den::numeric, 1),
        'FM990.0'
      ),
      '\.0$',
      ''
    ) || '%'
  end;
$fn$;

revoke all on function private.newsletter_mask_rate(bigint, bigint) from public;
revoke all on function private.newsletter_mask_rate(bigint, bigint) from anon, authenticated, service_role;

create or replace function private.newsletter_unsub_url(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select p_url is not null and (
    p_url ~* '/email/unsubscribe([/?#]|$)'
    or p_url ~* ('/' || 'functions/v1/' || 'email-unsubscribe' || '([/?#]|$)')
  );
$fn$;

revoke all on function private.newsletter_unsub_url(text) from public;
revoke all on function private.newsletter_unsub_url(text) from anon, authenticated, service_role;

create or replace function private.newsletter_link_key(p_url text)
returns text
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  v text;
  v_host text;
  v_rest text;
begin
  if p_url is null or p_url !~* '^https?://' then
    return null;
  end if;
  v := pg_catalog.split_part(pg_catalog.btrim(p_url), '#', 1);
  v := pg_catalog.split_part(v, '?', 1);
  v := pg_catalog.regexp_replace(v, '/+$', '');
  v_host := substring(v from '^https?://[^/]+');
  if v_host is null or v_host = '' then
    return null;
  end if;
  v_rest := pg_catalog.substring(v, pg_catalog.char_length(v_host) + 1);
  return pg_catalog.lower(v_host) || coalesce(v_rest, '');
end;
$fn$;

revoke all on function private.newsletter_link_key(text) from public;
revoke all on function private.newsletter_link_key(text) from anon, authenticated, service_role;

create or replace function private.newsletter_metric_text(p_send_ids uuid[], p_unsubs bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_sent bigint;
  v_delivered bigint;
  v_unique_opens bigint;
  v_total_opens bigint;
  v_unique_clicks bigint;
  v_total_clicks bigint;
  v_bounces bigint;
  v_complaints bigint;
begin
  v_sent := coalesce(pg_catalog.cardinality(p_send_ids), 0);
  select
    count(distinct e.send_id) filter (where e.event = 'delivered'),
    count(distinct e.send_id) filter (where e.event = 'opened'),
    count(*) filter (where e.event = 'opened'),
    count(distinct e.send_id) filter (
      where e.event = 'clicked' and not private.newsletter_unsub_url(e.url)
    ),
    count(*) filter (
      where e.event = 'clicked' and not private.newsletter_unsub_url(e.url)
    ),
    count(distinct e.send_id) filter (where e.event = 'bounced'),
    count(distinct e.send_id) filter (where e.event = 'complained')
  into
    v_delivered, v_unique_opens, v_total_opens, v_unique_clicks, v_total_clicks, v_bounces, v_complaints
  from public.newsletter_events e
  where e.send_id = any (coalesce(p_send_ids, array[]::uuid[]));

  return pg_catalog.jsonb_build_object(
    'sent', private.newsletter_mask_count(v_sent),
    'delivered', private.newsletter_mask_count(v_delivered),
    'unique_opens', private.newsletter_mask_count(v_unique_opens),
    'total_opens', private.newsletter_mask_count(v_total_opens),
    'open_rate', private.newsletter_mask_rate(v_unique_opens, v_delivered),
    'unique_clicks', private.newsletter_mask_count(v_unique_clicks),
    'total_clicks', private.newsletter_mask_count(v_total_clicks),
    'click_rate', private.newsletter_mask_rate(v_unique_clicks, v_delivered),
    'bounces', private.newsletter_mask_count(v_bounces),
    'complaints', private.newsletter_mask_count(v_complaints),
    'unsubscribes', private.newsletter_mask_count(coalesce(p_unsubs, 0))
  );
end;
$fn$;

revoke all on function private.newsletter_metric_text(uuid[], bigint) from public;
revoke all on function private.newsletter_metric_text(uuid[], bigint) from anon, authenticated, service_role;

comment on function private.newsletter_metric_text(uuid[], bigint) is
  'Masked counts for one set of sends. Opens stay a count. The label approximate is added by the staff functions. Does not read account mail.';

create or replace function private.newsletter_unsub_hashes(p_campaign_id uuid)
returns table (email_hash text)
language sql
stable
security definer
set search_path = ''
as $fn$
  with live as (
    select s.campaign_id, s.email_hash, s.created_at, c.category
    from public.email_sends s
    join public.email_campaigns c on c.id = s.campaign_id
    where s.is_test = false
      and s.status in ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained')
  ),
  hits as (
    select distinct on (l.email_hash, l.category, l.created_at)
      s.campaign_id,
      l.email_hash
    from public.email_consent_log l
    join live s
      on s.email_hash = l.email_hash
     and s.category = l.category
     and s.created_at <= l.created_at
    where l.action in ('unsubscribe_link', 'list_unsubscribe_post')
    order by l.email_hash, l.category, l.created_at, s.created_at desc
  )
  select distinct hits.email_hash
  from hits
  where hits.campaign_id = p_campaign_id;
$fn$;

revoke all on function private.newsletter_unsub_hashes(uuid) from public;
revoke all on function private.newsletter_unsub_hashes(uuid) from anon, authenticated, service_role;

comment on function private.newsletter_unsub_hashes(uuid) is
  'Address hashes whose unsubscribe is attributed to this letter. Not returned to admin.';

create or replace function private.newsletter_unsub_count(p_campaign_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $fn$
  select count(*)::bigint from private.newsletter_unsub_hashes(p_campaign_id);
$fn$;

revoke all on function private.newsletter_unsub_count(uuid) from public;
revoke all on function private.newsletter_unsub_count(uuid) from anon, authenticated, service_role;

create or replace function public.staff_newsletter_stats(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_audience text[];
  v_sends uuid[];
  v_tiers jsonb := '[]'::jsonb;
  v_links jsonb;
  v_tier text;
  v_tier_sends uuid[];
  v_tier_unsubs bigint;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select c.audience_tiers
    into v_audience
  from public.email_campaigns c
  where c.id = p_campaign_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(s.id), array[]::uuid[])
    into v_sends
  from public.email_sends s
  where s.campaign_id = p_campaign_id
    and s.is_test = false
    and s.status in ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained');

  for v_tier in
    select sorted.tier
    from (
      select distinct u.tier
      from public.email_sends s
      join public.members m on m.user_id = s.user_id
      cross join lateral unnest(coalesce(m.tiers, array[]::text[])) as u(tier)
      where s.id = any (v_sends)
        and (
          cardinality(coalesce(v_audience, array[]::text[])) = 0
          or u.tier = any (v_audience)
        )
    ) sorted
    order by case sorted.tier
      when 'founding' then 1
      when 'member' then 2
      when 'sponsor' then 3
      else 4
    end, sorted.tier
  loop
    select coalesce(array_agg(distinct s.id), array[]::uuid[])
      into v_tier_sends
    from public.email_sends s
    join public.members m on m.user_id = s.user_id
    where s.id = any (v_sends)
      and coalesce(m.tiers, array[]::text[]) @> array[v_tier]::text[];

    select count(distinct h.email_hash)::bigint
      into v_tier_unsubs
    from private.newsletter_unsub_hashes(p_campaign_id) h
    join public.email_sends s
      on s.email_hash = h.email_hash
     and s.id = any (v_tier_sends);

    v_tiers := v_tiers || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'tier', v_tier,
        'counts', private.newsletter_metric_text(v_tier_sends, coalesce(v_tier_unsubs, 0))
      )
    );
  end loop;

  select coalesce(pg_catalog.jsonb_agg(x.payload order by x.total_n desc, x.key), '[]'::jsonb)
    into v_links
  from (
    select grouped.key,
      grouped.total_n,
      pg_catalog.jsonb_build_object(
        'url', grouped.key,
        'unique', private.newsletter_mask_count(grouped.unique_n),
        'total', private.newsletter_mask_count(grouped.total_n)
      ) as payload
    from (
      select private.newsletter_link_key(e.url) as key,
        count(distinct e.send_id)::bigint as unique_n,
        count(*)::bigint as total_n
      from public.newsletter_events e
      where e.send_id = any (v_sends)
        and e.event = 'clicked'
        and not private.newsletter_unsub_url(e.url)
        and private.newsletter_link_key(e.url) is not null
      group by private.newsletter_link_key(e.url)
      having count(distinct e.send_id) >= 5
      order by count(*) desc, private.newsletter_link_key(e.url)
      limit 10
    ) grouped
  ) x;

  return pg_catalog.jsonb_build_object(
    'opens', 'approximate',
    'counts', private.newsletter_metric_text(v_sends, private.newsletter_unsub_count(p_campaign_id)),
    'tiers', v_tiers,
    'links', coalesce(v_links, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.staff_newsletter_stats(uuid) from public;
revoke all on function public.staff_newsletter_stats(uuid) from public, anon;
revoke all on function public.staff_newsletter_stats(uuid) from anon, authenticated, service_role;
grant execute on function public.staff_newsletter_stats(uuid) to authenticated;

comment on function public.staff_newsletter_stats(uuid) is
  'Admin counts for one letter. Cells under 5 are <5. Opens are approximate. No person, address, or hash is returned. Does not read account mail. Does not send mail.';

create or replace function public.staff_newsletter_trend()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_issues jsonb := '[]'::jsonb;
  v_row record;
  v_ids uuid[];
  v_metrics jsonb;
  v_point jsonb;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  for v_row in
    select picked.id, picked.iso_year, picked.iso_week
    from (
      select distinct on (c.digest_issue_id)
        c.id,
        i.iso_year,
        i.iso_week
      from public.email_campaigns c
      join public.digest_issues i on i.id = c.digest_issue_id
      where c.kind = 'digest'
        and c.status = 'sent'
      order by c.digest_issue_id, c.created_at desc
    ) picked
    order by picked.iso_year desc, picked.iso_week desc
    limit 12
  loop
    select coalesce(array_agg(s.id), array[]::uuid[])
      into v_ids
    from public.email_sends s
    where s.campaign_id = v_row.id
      and s.is_test = false
      and s.status in ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained');

    v_metrics := private.newsletter_metric_text(v_ids, private.newsletter_unsub_count(v_row.id));
    v_point := pg_catalog.jsonb_build_object(
      'iso_year', v_row.iso_year,
      'iso_week', v_row.iso_week,
      'open_rate', v_metrics->>'open_rate',
      'click_rate', v_metrics->>'click_rate',
      'bounces', v_metrics->>'bounces',
      'unsubscribes', v_metrics->>'unsubscribes'
    );
    v_issues := pg_catalog.jsonb_build_array(v_point) || v_issues;
  end loop;

  return pg_catalog.jsonb_build_object(
    'opens', 'approximate',
    'issues', v_issues
  );
end;
$$;

revoke all on function public.staff_newsletter_trend() from public;
revoke all on function public.staff_newsletter_trend() from public, anon;
revoke all on function public.staff_newsletter_trend() from anon, authenticated, service_role;
grant execute on function public.staff_newsletter_trend() to authenticated;

comment on function public.staff_newsletter_trend() is
  'Last 12 sent weekly issues, oldest first. Open rate, click rate, bounces, and unsubscribes. Cells under 5 are <5. Does not read account mail. Does not send mail.';

create or replace function public.newsletter_events_retention()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.newsletter_events e
  where e.occurred_at < pg_catalog.now() - interval '24 months';
  get diagnostics removed = row_count;
  return coalesce(removed, 0);
end;
$$;

revoke all on function public.newsletter_events_retention() from public;
revoke all on function public.newsletter_events_retention() from public, anon;
revoke all on function public.newsletter_events_retention() from anon, authenticated, service_role;
grant execute on function public.newsletter_events_retention() to service_role;

comment on function public.newsletter_events_retention() is
  'Deletes newsletter measurement rows older than 24 months. Called by the existing retention sweep. Does not read account mail. Does not send mail. Not scheduled here.';

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

alter table public.email_sends
  add column if not exists measure boolean not null default false;

comment on column public.email_sends.measure is
  'True only when this send used the tracked news sender because the member had turned measurement on. Default false.';

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
      and s.measure
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
    and s.measure
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
    'measured_only', true,
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
      and s.measure
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
    'measured_only', true,
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
  where e.occurred_at < pg_catalog.now() - interval '13 months';
  get diagnostics removed = row_count;
  return coalesce(removed, 0);
end;
$$;

revoke all on function public.newsletter_events_retention() from public;
revoke all on function public.newsletter_events_retention() from public, anon;
revoke all on function public.newsletter_events_retention() from anon, authenticated, service_role;
grant execute on function public.newsletter_events_retention() to service_role;

comment on function public.newsletter_events_retention() is
  'Deletes newsletter measurement rows older than 13 months. Called by the existing retention sweep. Does not read account mail. Does not send mail. Not scheduled here.';

alter table public.email_categories
  drop constraint if exists email_categories_kind_check;
alter table public.email_categories
  add constraint email_categories_kind_check
  check (kind in ('bulk', 'transactional', 'essential', 'measurement'));

insert into public.email_categories (key, label, requires_opt_in, kind, member_can_disable)
values ('measure_opens', 'Measure opens and clicks', true, 'measurement', true)
on conflict (key) do update
set label = excluded.label,
    requires_opt_in = excluded.requires_opt_in,
    kind = excluded.kind,
    member_can_disable = excluded.member_can_disable;

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
  measure_pref boolean;
  v_master boolean;
  v_notices jsonb;
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
  select p.opted_in into measure_pref
  from public.email_preferences p
  where p.user_id = auth.uid() and p.category = 'measure_opens';
  select s.master_enabled into v_master
  from public.email_settings s
  where s.id;
  select coalesce(pg_catalog.jsonb_object_agg(c.key, coalesce(p.opted_in, false)), '{}'::jsonb)
    into v_notices
  from public.email_categories c
  left join public.email_preferences p
    on p.category = c.key
   and p.user_id = auth.uid()
  where c.kind = 'transactional'
    and c.key <> 'newsletter_ready';
  return pg_catalog.jsonb_build_object(
    'weekly_digest', coalesce(weekly_pref, weekly_col, false),
    'news_invitations', coalesce(news_pref, false),
    'measure_opens', coalesce(measure_pref, false),
    'delivery_connected', coalesce(v_master, false),
    'notices', coalesce(v_notices, '{}'::jsonb),
    'essential_always_on', true
  );
end;
$fn$;

revoke all on function public.my_email_preferences() from public;
revoke all on function public.my_email_preferences() from public, anon;
revoke all on function public.my_email_preferences() from anon, authenticated, service_role;
grant execute on function public.my_email_preferences() to authenticated;

drop function if exists public.email_recipients(uuid);
drop function if exists private.email_recipients(uuid);

create or replace function private.email_recipients(p_campaign_id uuid)
returns table (user_id uuid, address text, unsubscribe_token text, measure boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_category text;
  v_audience text[];
begin
  select c.category, c.audience_tiers into v_category, v_audience
  from public.email_campaigns c
  where c.id = p_campaign_id;
  if v_category is null then
    return;
  end if;
  return query
  select
    m.user_id,
    m.email,
    private.email_unsub_token(m.user_id, v_category),
    coalesce(pref.opted_in, false)
  from public.members m
  left join public.email_preferences pref
    on pref.user_id = m.user_id
   and pref.category = 'measure_opens'
  where m.tiers && coalesce(v_audience, array[]::text[])
    and private.email_member_reason(m.user_id, v_category) = 'eligible'
    and not exists (
      select 1
      from public.email_suppressions s
      where s.email_hash = private.email_address_hash(m.email)
    );
end;
$fn$;

revoke all on function private.email_recipients(uuid) from public;
revoke all on function private.email_recipients(uuid) from anon, authenticated, service_role;
grant execute on function private.email_recipients(uuid) to service_role;

create or replace function public.email_recipients(p_campaign_id uuid)
returns table (user_id uuid, address text, unsubscribe_token text, measure boolean)
language sql
security definer
set search_path = ''
as $fn$
  select r.user_id, r.address, r.unsubscribe_token, r.measure
  from private.email_recipients(p_campaign_id) r;
$fn$;

revoke all on function public.email_recipients(uuid) from public;
revoke all on function public.email_recipients(uuid) from public, anon;
revoke all on function public.email_recipients(uuid) from anon, authenticated, service_role;
grant execute on function public.email_recipients(uuid) to service_role;

comment on function public.email_recipients(uuid) is
  'Eligible recipients. measure is true only when that member turned measurement on. Service role only. Does not send mail.';

create or replace function public.email_set_send_measure(p_send_id uuid, p_measure boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  update public.email_sends
  set measure = coalesce(p_measure, false)
  where id = p_send_id
    and is_test = false;
end;
$fn$;

revoke all on function public.email_set_send_measure(uuid, boolean) from public;
revoke all on function public.email_set_send_measure(uuid, boolean) from public, anon;
revoke all on function public.email_set_send_measure(uuid, boolean) from anon, authenticated, service_role;
grant execute on function public.email_set_send_measure(uuid, boolean) to service_role;

comment on function public.email_set_send_measure(uuid, boolean) is
  'Stamps whether this live send used the tracked sender. Service role only. Does not send mail.';

create or replace function private.newsletter_event_allowed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.event in ('opened', 'clicked') then
    if not exists (
      select 1
      from public.email_sends s
      join public.email_preferences p
        on p.user_id = s.user_id
       and p.category = 'measure_opens'
       and p.opted_in
      where s.id = new.send_id
        and s.measure
    ) then
      return null;
    end if;
  end if;
  return new;
end;
$fn$;

revoke all on function private.newsletter_event_allowed() from public;
revoke all on function private.newsletter_event_allowed() from anon, authenticated, service_role;

drop trigger if exists newsletter_events_consent on public.newsletter_events;
create trigger newsletter_events_consent
  before insert on public.newsletter_events
  for each row
  execute function private.newsletter_event_allowed();

create or replace function private.email_sends_measure_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.status in ('opened', 'clicked') and (
    not new.measure
    or not exists (
      select 1
      from public.email_preferences p
      where p.user_id = new.user_id
        and p.category = 'measure_opens'
        and p.opted_in
    )
  ) then
    new.status := old.status;
  end if;
  return new;
end;
$fn$;

revoke all on function private.email_sends_measure_status() from public;
revoke all on function private.email_sends_measure_status() from anon, authenticated, service_role;

drop trigger if exists email_sends_measure_status on public.email_sends;
create trigger email_sends_measure_status
  before update on public.email_sends
  for each row
  execute function private.email_sends_measure_status();

-- Live staff_upsert_campaign is the body from 20261223120000_email_campaign_ui.sql.
-- The only change is that a campaign category must be bulk. Measurement is not an audience.
create or replace function public.staff_upsert_campaign(
  p_id uuid,
  p_kind text,
  p_category text,
  p_subject text,
  p_preheader text,
  p_body_text text,
  p_body_html text,
  p_audience text[],
  p_digest_issue_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status text;
  v_requires boolean;
  v_kind text;
  v_audience text[];
  v_subject text;
  v_preheader text;
  v_body text;
  v_html text;
  v_hash text;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_kind not in ('digest', 'campaign') then
    raise exception 'not_allowed' using errcode = '22023';
  end if;
  select c.requires_opt_in, c.kind into v_requires, v_kind
  from public.email_categories c
  where c.key = p_category;
  if not found or v_kind is distinct from 'bulk' then
    raise exception 'not_allowed' using errcode = '22023';
  end if;
  if p_kind = 'campaign' and v_requires is not true then
    raise exception 'not_allowed' using errcode = '22023';
  end if;
  if p_kind = 'digest' and p_category is distinct from 'weekly_digest' then
    raise exception 'not_allowed' using errcode = '22023';
  end if;
  if p_kind = 'digest' and (
    p_digest_issue_id is null
    or not exists (select 1 from public.digest_issues i where i.id = p_digest_issue_id)
  ) then
    raise exception 'not_allowed' using errcode = '22023';
  end if;
  if p_kind = 'campaign' and p_digest_issue_id is not null then
    raise exception 'not_allowed' using errcode = '22023';
  end if;

  v_audience := private.normalize_membership_tiers(coalesce(p_audience, array[]::text[]));
  if coalesce(pg_catalog.cardinality(v_audience), 0) > 0
     and not private.membership_tiers_valid(v_audience) then
    raise exception 'invalid_tier' using errcode = '22023';
  end if;

  v_subject := coalesce(private.digest_plain(p_subject, 180), '');
  v_preheader := coalesce(private.digest_plain(p_preheader, 180), '');
  v_body := coalesce(private.digest_plain(p_body_text, 8000), '');
  perform private.email_assert_links(v_subject);
  perform private.email_assert_links(v_preheader);
  perform private.email_assert_links(v_body);
  v_html := private.email_sanitise_html(
    case
      when p_body_html is null then private.email_plain_html(v_body)
      else p_body_html
    end
  );
  v_hash := private.email_content_hash(v_subject, v_preheader, v_body, v_html, v_audience);

  if p_id is null then
    insert into public.email_campaigns (
      kind, digest_issue_id, category, subject, preheader, body_text,
      body_html_sanitised, audience_tiers, status, created_by, content_hash
    ) values (
      p_kind, p_digest_issue_id, p_category, v_subject, v_preheader, v_body,
      v_html, v_audience, 'draft', auth.uid(), v_hash
    )
    returning id into v_id;
    v_status := 'draft';
  else
    select c.status into v_status
    from public.email_campaigns c
    where c.id = p_id
    for update;
    if v_status is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if v_status not in ('draft', 'approved', 'test_sent') then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    v_status := case when v_status = 'draft' then 'draft' else 'approved' end;
    update public.email_campaigns
    set kind = p_kind,
        digest_issue_id = p_digest_issue_id,
        category = p_category,
        subject = v_subject,
        preheader = v_preheader,
        body_text = v_body,
        body_html_sanitised = v_html,
        audience_tiers = v_audience,
        status = v_status,
        content_hash = v_hash,
        test_sent_by = null,
        test_sent_at = null,
        test_content_hash = null
    where id = p_id;
    v_id := p_id;
  end if;

  return pg_catalog.jsonb_build_object('id', v_id, 'status', v_status);
end;
$$;

revoke all on function public.staff_upsert_campaign(uuid, text, text, text, text, text, text, text[], uuid) from public, anon;
grant execute on function public.staff_upsert_campaign(uuid, text, text, text, text, text, text, text[], uuid) to authenticated;

comment on function public.staff_upsert_campaign(uuid, text, text, text, text, text, text, text[], uuid) is
  'Admin saves a draft, or edits an approved campaign. Only a bulk category can be the audience. Measurement is refused. A null HTML argument is built from the plain text and sanitised. An edit clears the owner test and returns the campaign to approved. Does not send mail.';

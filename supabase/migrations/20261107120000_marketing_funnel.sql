-- TR-3 marketing funnel. Staff only.
-- One migration: marketing_funnel_counts, an empty marketing_campaigns table,
-- and the marketing_stats_cache used by the marketing-stats edge function.
-- Counts of 1 to 4 are returned as the string lt5. Zero stays 0.
-- The output has no financial band, phone, CR number, statement, name, or email.
-- Approved dates follow coalesce(admitted_at, members.created_at, decision_at
-- where status is accepted). Applications have no approved_at column.
-- Demo members, staff emails, and test rows are excluded.

create or replace function private.marketing_excluded(p_email text, p_demo boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_demo, false)
    or exists (
      select 1
      from public.staff_users s
      where lower(s.email) = lower(btrim(coalesce(p_email, '')))
    )
    or lower(btrim(coalesce(p_email, ''))) ~ '(^|[.+_-])test([.+_@-]|$)'
    or lower(btrim(coalesce(p_email, ''))) like '%@example.com';
$$;

revoke all on function private.marketing_excluded(text, boolean) from public, anon, authenticated;

create or replace function private.marketing_is_paid(p_medium text)
returns boolean
language sql
immutable
as $$
  select lower(btrim(coalesce(p_medium, ''))) in (
    'paid_social', 'cpc', 'display', 'paid_email', 'partner_paid'
  );
$$;

revoke all on function private.marketing_is_paid(text) from public, anon, authenticated;

create or replace function private.marketing_channel_match(p_medium text, p_channel text)
returns boolean
language sql
immutable
as $$
  select case lower(btrim(coalesce(p_channel, 'all')))
    when 'paid' then private.marketing_is_paid(p_medium)
    when 'organic' then not private.marketing_is_paid(p_medium)
    else true
  end;
$$;

revoke all on function private.marketing_channel_match(text, text) from public, anon, authenticated;

create or replace function private.marketing_bucket(n integer)
returns jsonb
language sql
immutable
as $$
  select case
    when coalesce(n, 0) <= 0 then '0'::jsonb
    when n < 5 then '"lt5"'::jsonb
    else to_jsonb(n)
  end;
$$;

revoke all on function private.marketing_bucket(integer) from public, anon, authenticated;

comment on function private.marketing_bucket(integer) is
  'Positive counts under 5 become the string lt5. Zero stays 0.';

create or replace function private.legacy_approved_at(
  p_id uuid,
  p_status text,
  p_admitted_at timestamptz,
  p_decision_at timestamptz,
  p_member_user_id uuid
) returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p_admitted_at,
    (
      select m.created_at
      from public.members m
      where m.is_demo = false
        and (
          m.application_id = p_id
          or (p_member_user_id is not null and m.user_id = p_member_user_id)
        )
      order by m.created_at
      limit 1
    ),
    case when p_status = 'accepted' then p_decision_at else null end
  );
$$;

revoke all on function private.legacy_approved_at(uuid, text, timestamptz, timestamptz, uuid) from public, anon, authenticated;

comment on function private.legacy_approved_at(uuid, text, timestamptz, timestamptz, uuid) is
  'Approved date for a legacy application: admitted_at, then a non-demo member created_at, then decision_at when status is accepted.';

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign text not null,
  channel text not null,
  month date not null,
  spend_sar numeric(12, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  constraint marketing_campaigns_campaign_token check (private.attribution_token(campaign)),
  constraint marketing_campaigns_channel_token check (private.attribution_token(channel)),
  constraint marketing_campaigns_month_start check (month = date_trunc('month', month)::date),
  constraint marketing_campaigns_spend_nonnegative check (spend_sar >= 0 and spend_sar <= 1000000000),
  constraint marketing_campaigns_notes_len check (notes is null or char_length(notes) <= 500)
);

comment on table public.marketing_campaigns is
  'Empty until ads start. Staff read only. The paid cost panel stays hidden while every spend_sar is 0. No person data.';

alter table public.marketing_campaigns enable row level security;
alter table public.marketing_campaigns force row level security;

revoke all on table public.marketing_campaigns from public, anon, authenticated;
grant select on table public.marketing_campaigns to authenticated;

drop policy if exists marketing_campaigns_select_staff on public.marketing_campaigns;
create policy marketing_campaigns_select_staff on public.marketing_campaigns
  for select to authenticated
  using (private.is_staff());

create table if not exists public.marketing_stats_cache (
  cache_key text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint marketing_stats_cache_key_len check (char_length(cache_key) between 8 and 200),
  constraint marketing_stats_cache_payload_obj check (jsonb_typeof(payload) = 'object')
);

comment on table public.marketing_stats_cache is
  'Aggregate PostHog responses only. Fresh for 15 minutes. Rows older than 24 hours are deleted. Service role only.';

alter table public.marketing_stats_cache enable row level security;
alter table public.marketing_stats_cache force row level security;

revoke all on table public.marketing_stats_cache from public, anon, authenticated;

create or replace function public.purge_marketing_stats_cache()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.marketing_stats_cache
  where created_at < now() - interval '24 hours';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_marketing_stats_cache() from public, anon, authenticated;
grant execute on function public.purge_marketing_stats_cache() to service_role;

comment on function public.purge_marketing_stats_cache() is
  'Deletes marketing stats cache rows older than 24 hours. Service role only.';

create or replace function public.marketing_funnel_counts(
  p_from timestamptz,
  p_to timestamptz,
  p_channel text default 'all'
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  channel text;
  form_sent integer := 0;
  email_verified integer := 0;
  legacy_applications integer := 0;
  checklist_complete integer := 0;
  full_requested integer := 0;
  candidate_approved integer := 0;
  legacy_approved integer := 0;
  checklist jsonb := '[]'::jsonb;
  step text;
  step_count integer;
  sources jsonb := '[]'::jsonb;
  days jsonb := '[]'::jsonb;
  quiet_days integer := 0;
  spend boolean := false;
begin
  if auth.uid() is null or not private.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'invalid_range' using errcode = '22023';
  end if;

  channel := lower(btrim(coalesce(p_channel, 'all')));
  if channel not in ('all', 'paid', 'organic') then
    raise exception 'invalid_channel' using errcode = '22023';
  end if;

  select count(*) into form_sent
  from public.candidates c
  left join public.members m on m.user_id = c.user_id
  where c.created_at >= p_from
    and c.created_at < p_to
    and not private.marketing_excluded(c.email, coalesce(m.is_demo, false))
    and private.marketing_channel_match(c.ft_medium, channel);

  select count(*) into email_verified
  from public.candidates c
  left join public.members m on m.user_id = c.user_id
  where c.email_verified_at >= p_from
    and c.email_verified_at < p_to
    and not private.marketing_excluded(c.email, coalesce(m.is_demo, false))
    and private.marketing_channel_match(c.ft_medium, channel);

  select count(*) into legacy_applications
  from public.applications a
  where a.created_at >= p_from
    and a.created_at < p_to
    and not private.marketing_excluded(
      a.email,
      exists (
        select 1
        from public.members m
        where m.is_demo = true
          and (
            m.application_id = a.id
            or (a.member_user_id is not null and m.user_id = a.member_user_id)
          )
      )
    )
    and private.marketing_channel_match(a.ft_medium, channel);

  select count(distinct e.candidate_user_id) into checklist_complete
  from public.candidate_events e
  join public.candidates c on c.user_id = e.candidate_user_id
  left join public.members m on m.user_id = c.user_id
  where e.kind = 'checklist_complete'
    and e.created_at >= p_from
    and e.created_at < p_to
    and not private.marketing_excluded(c.email, coalesce(m.is_demo, false))
    and private.marketing_channel_match(c.ft_medium, channel);

  select count(*) into full_requested
  from public.candidates c
  left join public.members m on m.user_id = c.user_id
  where c.submitted_at >= p_from
    and c.submitted_at < p_to
    and not private.marketing_excluded(c.email, coalesce(m.is_demo, false))
    and private.marketing_channel_match(c.ft_medium, channel);

  select count(*) into candidate_approved
  from public.candidates c
  left join public.members m on m.user_id = c.user_id
  where c.approved_at >= p_from
    and c.approved_at < p_to
    and not private.marketing_excluded(c.email, coalesce(m.is_demo, false))
    and private.marketing_channel_match(c.ft_medium, channel);

  select count(*) into legacy_approved
  from public.applications a
  where private.legacy_approved_at(a.id, a.status, a.admitted_at, a.decision_at, a.member_user_id) >= p_from
    and private.legacy_approved_at(a.id, a.status, a.admitted_at, a.decision_at, a.member_user_id) < p_to
    and not private.marketing_excluded(
      a.email,
      exists (
        select 1
        from public.members m
        where m.is_demo = true
          and (
            m.application_id = a.id
            or (a.member_user_id is not null and m.user_id = a.member_user_id)
          )
      )
    )
    and private.marketing_channel_match(a.ft_medium, channel);

  foreach step in array array[
    'email', 'role', 'company_title', 'linkedin', 'scale_band', 'sectors', 'statement',
    'cr_number', 'referral', 'capacity', 'phone'
  ]
  loop
    if step = 'email' then
      step_count := email_verified;
    else
      select count(distinct e.candidate_user_id) into step_count
      from public.candidate_events e
      join public.candidates c on c.user_id = e.candidate_user_id
      left join public.members m on m.user_id = c.user_id
      where e.kind = 'checklist_step'
        and e.detail->>'step' = step
        and e.created_at >= p_from
        and e.created_at < p_to
        and not private.marketing_excluded(c.email, coalesce(m.is_demo, false))
        and private.marketing_channel_match(c.ft_medium, channel);
    end if;
    checklist := checklist || jsonb_build_array(
      jsonb_build_object('step', step, 'count', private.marketing_bucket(step_count))
    );
  end loop;

  with grouped as (
    select
      coalesce(nullif(lower(btrim(c.ft_source)), ''), 'direct') as source,
      coalesce(nullif(lower(btrim(c.ft_medium)), ''), 'none') as medium,
      'candidate'::text as line,
      count(*) filter (
        where c.email_verified_at >= p_from and c.email_verified_at < p_to
      )::integer as regs,
      count(*) filter (
        where c.approved_at >= p_from and c.approved_at < p_to
      )::integer as approved
    from public.candidates c
    left join public.members m on m.user_id = c.user_id
    where not private.marketing_excluded(c.email, coalesce(m.is_demo, false))
      and private.marketing_channel_match(c.ft_medium, channel)
    group by 1, 2
    union all
    select
      coalesce(nullif(lower(btrim(a.ft_source)), ''), 'direct') as source,
      coalesce(nullif(lower(btrim(a.ft_medium)), ''), 'none') as medium,
      'legacy'::text as line,
      count(*) filter (
        where a.created_at >= p_from and a.created_at < p_to
      )::integer as regs,
      count(*) filter (
        where private.legacy_approved_at(a.id, a.status, a.admitted_at, a.decision_at, a.member_user_id) >= p_from
          and private.legacy_approved_at(a.id, a.status, a.admitted_at, a.decision_at, a.member_user_id) < p_to
      )::integer as approved
    from public.applications a
    where not private.marketing_excluded(
      a.email,
      exists (
        select 1
        from public.members m
        where m.is_demo = true
          and (
            m.application_id = a.id
            or (a.member_user_id is not null and m.user_id = a.member_user_id)
          )
      )
    )
    and private.marketing_channel_match(a.ft_medium, channel)
    group by 1, 2
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'source', source,
        'medium', medium,
        'kind', case when private.marketing_is_paid(medium) then 'paid' else 'organic' end,
        'line', line,
        'registrations', private.marketing_bucket(regs),
        'approved', private.marketing_bucket(approved)
      )
      order by line, source, medium
    ),
    '[]'::jsonb
  )
  into sources
  from grouped
  where regs > 0 or approved > 0;

  with daily as (
    select day, count(*)::integer as n
    from (
      select (c.email_verified_at at time zone 'Asia/Riyadh')::date as day
      from public.candidates c
      left join public.members m on m.user_id = c.user_id
      where c.email_verified_at >= p_from
        and c.email_verified_at < p_to
        and not private.marketing_excluded(c.email, coalesce(m.is_demo, false))
        and private.marketing_channel_match(c.ft_medium, channel)
      union all
      select (a.created_at at time zone 'Asia/Riyadh')::date as day
      from public.applications a
      where a.created_at >= p_from
        and a.created_at < p_to
        and not private.marketing_excluded(
          a.email,
          exists (
            select 1
            from public.members m
            where m.is_demo = true
              and (
                m.application_id = a.id
                or (a.member_user_id is not null and m.user_id = a.member_user_id)
              )
          )
        )
        and private.marketing_channel_match(a.ft_medium, channel)
    ) u
    group by day
  )
  select
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('day', day, 'registrations', private.marketing_bucket(n))
          order by day
        )
        from daily
        where n >= 5
      ),
      '[]'::jsonb
    ),
    coalesce((select count(*) from daily where n between 1 and 4), 0)
  into days, quiet_days;

  select exists (
    select 1 from public.marketing_campaigns where spend_sar > 0
  ) into spend;

  return jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'channel', channel,
    'funnel', jsonb_build_object(
      'form_sent', private.marketing_bucket(form_sent),
      'email_verified', private.marketing_bucket(email_verified),
      'legacy_applications', private.marketing_bucket(legacy_applications),
      'checklist_complete', private.marketing_bucket(checklist_complete),
      'full_requested', private.marketing_bucket(full_requested),
      'approved', private.marketing_bucket(candidate_approved + legacy_approved),
      'legacy_approved', private.marketing_bucket(legacy_approved)
    ),
    'checklist', checklist,
    'sources', sources,
    'days', days,
    'has_quiet_days', quiet_days > 0,
    'has_spend', spend
  );
end;
$$;

revoke all on function public.marketing_funnel_counts(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.marketing_funnel_counts(timestamptz, timestamptz, text) to authenticated;

comment on function public.marketing_funnel_counts(timestamptz, timestamptz, text) is
  'Staff-only funnel steps 3 to 7, checklist steps, and first-touch counts. Aggregates only. Counts under 5 are lt5.';

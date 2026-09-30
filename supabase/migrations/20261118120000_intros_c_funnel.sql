-- INTROS-C: staff introduction funnel and the deal started tag.
-- Counts are requested, accepted, met, and deal started inside a half-open range.
-- Met is not collected here. INTROS-B owns the per-party meeting answers.
-- This function reads met only when B's relation or columns are already present.
-- Until then the met count is 0. Schema changes here are additive.
-- Deal started is staff only. Who and when are stored on member_intro_deal_audits.
-- No Edge function. No new secret.

alter table public.member_intros
  add column if not exists deal_started_at timestamptz,
  add column if not exists deal_started_by uuid;

alter table public.member_intros drop constraint if exists member_intros_deal_pair;
alter table public.member_intros
  add constraint member_intros_deal_pair check (
    (deal_started_at is null and deal_started_by is null)
    or (deal_started_at is not null and deal_started_by is not null)
  );

create index if not exists member_intros_deal_started_idx
  on public.member_intros (deal_started_at)
  where deal_started_at is not null;

create table if not exists public.member_intro_deal_audits (
  id uuid primary key default gen_random_uuid(),
  intro_id uuid not null references public.member_intros (id) on delete cascade,
  actor_id uuid not null,
  action text not null,
  created_at timestamptz not null default now(),
  constraint member_intro_deal_audits_action check (action in ('deal_started', 'deal_cleared'))
);

create index if not exists member_intro_deal_audits_intro_idx
  on public.member_intro_deal_audits (intro_id, created_at desc);

alter table public.member_intro_deal_audits enable row level security;
alter table public.member_intro_deal_audits force row level security;
revoke all on table public.member_intro_deal_audits from public, anon, authenticated;

drop policy if exists member_intro_deal_audits_select_staff on public.member_intro_deal_audits;
create policy member_intro_deal_audits_select_staff
  on public.member_intro_deal_audits
  for select to authenticated
  using (private.is_staff());

grant select on table public.member_intro_deal_audits to authenticated;

-- Met contract for INTROS-B, checked at read time so either migration can land first.
-- 1. public.member_intro_met(intro_id, met_at) when that relation exists.
-- 2. member_intros.requester_met and member_intros.target_met, text yes / not_yet / no.
--    Optional requester_met_at and target_met_at date the answer.
--    Without those timestamps, a yes answer is dated by decided_at.
-- 3. member_intros.met_at when that nullable timestamp exists on its own.
-- A yes from either party counts the introduction once. Anything else counts 0.

create or replace function private.intro_met_count(p_from timestamptz, p_to timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_from is null or p_to is null or p_from >= p_to then
    return 0;
  end if;

  if to_regclass('public.member_intro_met') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'member_intro_met'
        and column_name = 'intro_id'
    )
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'member_intro_met'
        and column_name = 'met_at'
    )
  then
    execute $q$
      select count(distinct m.intro_id)::int
      from public.member_intro_met m
      join public.member_intros i on i.id = m.intro_id
      where m.met_at >= $1
        and m.met_at < $2
        and not private.sample_subject(i.requester_id)
        and not private.sample_subject(i.target_id)
    $q$
    into v_count
    using p_from, p_to;
    return coalesce(v_count, 0);
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'member_intros'
      and column_name = 'requester_met'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'member_intros'
      and column_name = 'target_met'
  ) then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'member_intros'
        and column_name = 'requester_met_at'
    ) and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'member_intros'
        and column_name = 'target_met_at'
    ) then
      execute $q$
        select count(*)::int
        from public.member_intros i
        where not private.sample_subject(i.requester_id)
          and not private.sample_subject(i.target_id)
          and (
            (
              lower(btrim(coalesce(i.requester_met, ''))) = 'yes'
              and i.requester_met_at >= $1
              and i.requester_met_at < $2
            )
            or (
              lower(btrim(coalesce(i.target_met, ''))) = 'yes'
              and i.target_met_at >= $1
              and i.target_met_at < $2
            )
          )
      $q$
      into v_count
      using p_from, p_to;
      return coalesce(v_count, 0);
    end if;

    execute $q$
      select count(*)::int
      from public.member_intros i
      where not private.sample_subject(i.requester_id)
        and not private.sample_subject(i.target_id)
        and (
          lower(btrim(coalesce(i.requester_met, ''))) = 'yes'
          or lower(btrim(coalesce(i.target_met, ''))) = 'yes'
        )
        and i.decided_at >= $1
        and i.decided_at < $2
    $q$
    into v_count
    using p_from, p_to;
    return coalesce(v_count, 0);
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'member_intros'
      and column_name = 'met_at'
  ) then
    execute $q$
      select count(*)::int
      from public.member_intros i
      where i.met_at >= $1
        and i.met_at < $2
        and not private.sample_subject(i.requester_id)
        and not private.sample_subject(i.target_id)
    $q$
    into v_count
    using p_from, p_to;
    return coalesce(v_count, 0);
  end if;

  return 0;
end;
$$;

revoke all on function private.intro_met_count(timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.staff_intro_funnel(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested integer;
  v_accepted integer;
  v_met integer;
  v_deal integer;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_from is null or p_to is null or p_from >= p_to then
    raise exception 'invalid_range' using errcode = '22023';
  end if;

  select count(*)::int
  into v_requested
  from public.member_intros i
  where i.requested_at >= p_from
    and i.requested_at < p_to
    and not private.sample_subject(i.requester_id)
    and not private.sample_subject(i.target_id);

  select count(*)::int
  into v_accepted
  from public.member_intros i
  where i.status = 'accepted'
    and i.decided_at >= p_from
    and i.decided_at < p_to
    and not private.sample_subject(i.requester_id)
    and not private.sample_subject(i.target_id);

  v_met := private.intro_met_count(p_from, p_to);

  select count(*)::int
  into v_deal
  from public.member_intros i
  where i.deal_started_at >= p_from
    and i.deal_started_at < p_to
    and not private.sample_subject(i.requester_id)
    and not private.sample_subject(i.target_id);

  return jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'requested', coalesce(v_requested, 0),
    'accepted', coalesce(v_accepted, 0),
    'met', coalesce(v_met, 0),
    'deal_started', coalesce(v_deal, 0),
    'updated_at', now()
  );
end;
$$;

revoke all on function public.staff_intro_funnel(timestamptz, timestamptz) from public, anon;
grant execute on function public.staff_intro_funnel(timestamptz, timestamptz) to authenticated;

create or replace function public.staff_list_intro_deals()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'deal_started_at', i.deal_started_at
      )
      order by i.deal_started_at desc
    )
    from public.member_intros i
    where i.deal_started_at is not null
      and not private.sample_subject(i.requester_id)
      and not private.sample_subject(i.target_id)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_list_intro_deals() from public, anon;
grant execute on function public.staff_list_intro_deals() to authenticated;

create or replace function public.staff_set_intro_deal(p_intro_id uuid, p_started boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_current timestamptz;
  v_sample boolean;
  v_action text;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_intro_id is null or p_started is null then
    raise exception 'invalid_deal' using errcode = '22023';
  end if;

  select
    i.status,
    i.deal_started_at,
    private.sample_subject(i.requester_id) or private.sample_subject(i.target_id)
  into v_status, v_current, v_sample
  from public.member_intros i
  where i.id = p_intro_id;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_sample then
    raise exception 'sample_blocked' using errcode = '42501';
  end if;

  if v_status is distinct from 'accepted' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_started and v_current is not null then
    return jsonb_build_object('ok', true, 'deal_started', true);
  end if;

  if not p_started and v_current is null then
    return jsonb_build_object('ok', true, 'deal_started', false);
  end if;

  v_action := case when p_started then 'deal_started' else 'deal_cleared' end;

  insert into public.member_intro_deal_audits (intro_id, actor_id, action)
  values (p_intro_id, auth.uid(), v_action);

  if p_started then
    update public.member_intros
    set deal_started_at = now(),
        deal_started_by = auth.uid()
    where id = p_intro_id
      and status = 'accepted'
      and deal_started_at is null;
  else
    update public.member_intros
    set deal_started_at = null,
        deal_started_by = null
    where id = p_intro_id
      and deal_started_at is not null;
  end if;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'deal_started', p_started);
end;
$$;

revoke all on function public.staff_set_intro_deal(uuid, boolean) from public, anon;
grant execute on function public.staff_set_intro_deal(uuid, boolean) to authenticated;

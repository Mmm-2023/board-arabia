-- INTROS-B: weekly introduction suggestions and once-only nudges.
-- Members read only their own suggestion rows. The scheduled function writes
-- them with the service role. Apply after review. Not applied by the authoring agent.

alter table public.member_intros
  add column if not exists pending_nudge_sent_at timestamptz,
  add column if not exists meet_nudge_requester_sent_at timestamptz,
  add column if not exists meet_nudge_target_sent_at timestamptz;

create table if not exists public.intro_suggestions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (user_id) on delete cascade,
  suggested_id uuid not null references public.members (user_id) on delete cascade,
  iso_year integer not null,
  iso_week integer not null,
  rank smallint not null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint intro_suggestions_distinct check (member_id <> suggested_id),
  constraint intro_suggestions_year check (iso_year between 2020 and 2100),
  constraint intro_suggestions_week check (iso_week between 1 and 53),
  constraint intro_suggestions_rank check (rank between 1 and 3),
  constraint intro_suggestions_reason_len check (char_length(btrim(reason)) between 1 and 200),
  constraint intro_suggestions_reason_private check (position('@' in reason) = 0),
  constraint intro_suggestions_member_rank unique (member_id, iso_year, iso_week, rank),
  constraint intro_suggestions_pair unique (member_id, suggested_id, iso_year, iso_week)
);

create index if not exists intro_suggestions_week_idx
  on public.intro_suggestions (iso_year, iso_week);

create index if not exists intro_suggestions_member_idx
  on public.intro_suggestions (member_id, iso_year, iso_week);

alter table public.intro_suggestions enable row level security;
alter table public.intro_suggestions force row level security;
revoke all on table public.intro_suggestions from public, anon, authenticated;
grant select on table public.intro_suggestions to authenticated;

drop policy if exists intro_suggestions_select_own on public.intro_suggestions;
create policy intro_suggestions_select_own
  on public.intro_suggestions
  for select to authenticated
  using (member_id = auth.uid());

create table if not exists public.intro_meet_outcomes (
  intro_id uuid not null references public.member_intros (id) on delete cascade,
  member_id uuid not null references public.members (user_id) on delete cascade,
  outcome text not null,
  updated_at timestamptz not null default now(),
  primary key (intro_id, member_id),
  constraint intro_meet_outcomes_outcome check (outcome in ('yes', 'not_yet', 'no'))
);

alter table public.intro_meet_outcomes enable row level security;
alter table public.intro_meet_outcomes force row level security;
revoke all on table public.intro_meet_outcomes from public, anon, authenticated;
grant select on table public.intro_meet_outcomes to authenticated;

drop policy if exists intro_meet_outcomes_select_own on public.intro_meet_outcomes;
create policy intro_meet_outcomes_select_own
  on public.intro_meet_outcomes
  for select to authenticated
  using (member_id = auth.uid());

create or replace function public.list_my_intro_suggestions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and m.is_demo = false
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id,
      'suggested_id', s.suggested_id,
      'full_name', coalesce(nullif(trim(p.full_name), ''), 'Member'),
      'headline', coalesce(nullif(trim(p.headline), ''), ''),
      'company', coalesce(nullif(trim(p.company), ''), ''),
      'location', coalesce(nullif(trim(p.location), ''), ''),
      'reason', s.reason,
      'rank', s.rank,
      'avatar_style', coalesce(p.avatar_style, 'male'),
      'avatar_path', p.avatar_path
    ) order by s.rank)
    from public.intro_suggestions s
    join public.profiles p on p.user_id = s.suggested_id
    join public.members suggested on suggested.user_id = s.suggested_id
    where s.member_id = auth.uid()
      and s.iso_year = extract(isoyear from timezone('UTC', now()))::integer
      and s.iso_week = extract(week from timezone('UTC', now()))::integer
      and suggested.is_demo = false
      and suggested.status in ('invited', 'active')
      and not private.sample_subject(s.suggested_id)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_my_intro_suggestions() from public, anon;
grant execute on function public.list_my_intro_suggestions() to authenticated;

create or replace function public.record_intro_meet(p_intro_id uuid, p_outcome text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party uuid;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and m.is_demo = false
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_outcome is null or p_outcome not in ('yes', 'not_yet', 'no') then
    raise exception 'invalid_outcome' using errcode = '22023';
  end if;

  select auth.uid() into v_party
  from public.member_intros i
  where i.id = p_intro_id
    and i.status = 'accepted'
    and i.decided_at is not null
    and i.decided_at <= (now() - interval '7 days')
    and (i.requester_id = auth.uid() or i.target_id = auth.uid());

  if v_party is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if private.sample_subject(auth.uid()) or exists (
    select 1
    from public.member_intros i
    where i.id = p_intro_id
      and (private.sample_subject(i.requester_id) or private.sample_subject(i.target_id))
  ) then
    raise exception 'sample_blocked' using errcode = '42501';
  end if;

  insert into public.intro_meet_outcomes (intro_id, member_id, outcome)
  values (p_intro_id, auth.uid(), p_outcome)
  on conflict (intro_id, member_id) do update
    set outcome = excluded.outcome,
        updated_at = now();

  return jsonb_build_object('outcome', p_outcome);
end;
$$;

revoke all on function public.record_intro_meet(uuid, text) from public, anon;
grant execute on function public.record_intro_meet(uuid, text) to authenticated;

create or replace function public.list_my_intros()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(payload order by sort_at desc)
    from (
      select
        i.requested_at as sort_at,
        jsonb_build_object(
          'id', i.id,
          'kind', 'member',
          'direction', case when i.requester_id = auth.uid() then 'outgoing' else 'incoming' end,
          'status', i.status,
          'title', coalesce(nullif(trim(p.full_name), ''), 'Member'),
          'detail', concat_ws(
            ' · ',
            nullif(trim(p.headline), ''),
            nullif(trim(p.company), ''),
            nullif(trim(p.location), '')
          ),
          'reason', i.reason,
          'is_demo', private.sample_subject(i.requester_id) or private.sample_subject(i.target_id),
          'subject_id', case when i.requester_id = auth.uid() then i.target_id else i.requester_id end,
          'avatar_style', coalesce(p.avatar_style, 'male'),
          'avatar_path', p.avatar_path,
          'ask_desk', i.ask_desk,
          'desk_status', i.desk_status,
          'created_at', i.requested_at,
          'decided_at', i.decided_at,
          'meet_due', (
            i.status = 'accepted'
            and i.decided_at is not null
            and i.decided_at <= (now() - interval '7 days')
          ),
          'meet_outcome', (
            select o.outcome
            from public.intro_meet_outcomes o
            where o.intro_id = i.id
              and o.member_id = auth.uid()
          )
        ) as payload
      from public.member_intros i
      join public.profiles p
        on p.user_id = case
          when i.requester_id = auth.uid() then i.target_id
          else i.requester_id
        end
      where i.requester_id = auth.uid()
         or i.target_id = auth.uid()

      union all

      select
        i.requested_at,
        jsonb_build_object(
          'id', i.id,
          'kind', 'mandate',
          'direction', 'outgoing',
          'status', i.status,
          'title', m.sector || ' · ' || m.deal_type,
          'detail', m.geography,
          'reason', '',
          'is_demo', m.is_demo,
          'subject_id', m.id,
          'created_at', i.requested_at
        )
      from public.mandate_intros i
      join public.mandates m on m.id = i.mandate_id
      where i.member_id = auth.uid()

      union all

      select
        i.requested_at,
        jsonb_build_object(
          'id', i.id,
          'kind', 'real_estate',
          'direction', 'outgoing',
          'status', i.status,
          'title', o.sector || ' · ' || o.city,
          'detail', o.asset_class,
          'reason', '',
          'is_demo', o.is_demo,
          'subject_id', o.id,
          'created_at', i.requested_at
        )
      from public.re_opportunity_intros i
      join public.re_opportunities o on o.id = i.opportunity_id
      where i.member_id = auth.uid()

      union all

      select
        i.requested_at,
        jsonb_build_object(
          'id', i.id,
          'kind', 'partner',
          'direction', 'outgoing',
          'status', i.status,
          'title', t.name,
          'detail', t.city,
          'reason', '',
          'is_demo', t.is_demo,
          'subject_id', t.id,
          'created_at', i.requested_at
        )
      from public.re_partner_intros i
      join public.re_partners t on t.id = i.partner_id
      where i.member_id = auth.uid()
    ) listed
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_my_intros() from public, anon;
grant execute on function public.list_my_intros() to authenticated;

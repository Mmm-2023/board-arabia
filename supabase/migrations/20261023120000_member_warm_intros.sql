-- Member-to-member warm intros, and one list that also includes
-- mandate and real estate unlock requests.
-- Sample and example ids are rejected here. This migration does not delete
-- the test majlis, the sample intro request, or any demo seed row.
-- No Edge function change. No new secret.

create table if not exists public.member_intros (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.members (user_id) on delete cascade,
  target_id uuid not null references public.members (user_id) on delete cascade,
  reason text not null,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint member_intros_status check (status in ('pending', 'accepted', 'declined')),
  constraint member_intros_distinct check (requester_id <> target_id),
  constraint member_intros_reason_len check (char_length(btrim(reason)) between 1 and 280),
  constraint member_intros_reason_private check (position('@' in reason) = 0),
  constraint member_intros_pair unique (requester_id, target_id)
);

alter table public.member_intros drop constraint if exists member_intros_status;
alter table public.member_intros
  add constraint member_intros_status check (status in ('pending', 'accepted', 'declined'));

alter table public.member_intros drop constraint if exists member_intros_distinct;
alter table public.member_intros
  add constraint member_intros_distinct check (requester_id <> target_id);

alter table public.member_intros drop constraint if exists member_intros_reason_len;
alter table public.member_intros
  add constraint member_intros_reason_len check (char_length(btrim(reason)) between 1 and 280);

alter table public.member_intros drop constraint if exists member_intros_reason_private;
alter table public.member_intros
  add constraint member_intros_reason_private check (position('@' in reason) = 0);

alter table public.member_intros drop constraint if exists member_intros_pair;
alter table public.member_intros
  add constraint member_intros_pair unique (requester_id, target_id);

create index if not exists member_intros_target_idx
  on public.member_intros (target_id);

create index if not exists member_intros_requester_idx
  on public.member_intros (requester_id);

alter table public.member_intros enable row level security;
alter table public.member_intros force row level security;
revoke all on table public.member_intros from public, anon, authenticated;

-- True for sample directory cards, demo members, and demo deal rows.
create or replace function private.sample_subject(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from public.directory_entries d where d.id = p_id)
    or exists (select 1 from public.members m where m.user_id = p_id and m.is_demo)
    or exists (select 1 from public.mandates m where m.id = p_id and m.is_demo)
    or exists (select 1 from public.re_opportunities o where o.id = p_id and o.is_demo)
    or exists (select 1 from public.re_partners t where t.id = p_id and t.is_demo)
    or exists (select 1 from public.rooms r where r.id = p_id and r.is_demo);
$$;

revoke all on function private.sample_subject(uuid) from public, anon, authenticated;

create or replace function public.request_member_intro(p_target_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  current_status text;
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

  if p_target_id is null or p_target_id = auth.uid() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if private.sample_subject(auth.uid()) or private.sample_subject(p_target_id) then
    raise exception 'sample_blocked' using errcode = '42501';
  end if;

  if char_length(v_reason) < 1
    or char_length(v_reason) > 280
    or position('@' in v_reason) > 0
    or v_reason ~ '\+?[0-9][[:space:]0-9()-]{7,}'
  then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.members m
    where m.user_id = p_target_id
      and m.is_demo = false
      and m.status in ('invited', 'active')
      and m.seat in ('ksa', 'intl')
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  insert into public.member_intros (requester_id, target_id, reason, status)
  values (auth.uid(), p_target_id, v_reason, 'pending')
  on conflict (requester_id, target_id) do nothing;

  select i.status into current_status
  from public.member_intros i
  where i.requester_id = auth.uid()
    and i.target_id = p_target_id;

  return jsonb_build_object('status', current_status);
end;
$$;

revoke all on function public.request_member_intro(uuid, text) from public, anon;
grant execute on function public.request_member_intro(uuid, text) to authenticated;

create or replace function public.respond_member_intro(p_intro_id uuid, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  next_status text;
  v_requester uuid;
  v_target uuid;
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

  if p_decision = 'accepted' then
    next_status := 'accepted';
  elsif p_decision = 'declined' then
    next_status := 'declined';
  else
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  select i.requester_id, i.target_id
    into v_requester, v_target
  from public.member_intros i
  where i.id = p_intro_id
    and i.target_id = auth.uid()
    and i.status = 'pending';

  if v_target is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if private.sample_subject(v_requester) or private.sample_subject(v_target) then
    raise exception 'sample_blocked' using errcode = '42501';
  end if;

  update public.member_intros
  set status = next_status,
      decided_at = now()
  where id = p_intro_id
    and target_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('status', next_status);
end;
$$;

revoke all on function public.respond_member_intro(uuid, text) from public, anon;
grant execute on function public.respond_member_intro(uuid, text) to authenticated;

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
          'created_at', i.requested_at
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

create or replace function public.staff_list_all_intros()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not private.is_staff() then
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
          'direction', 'outgoing',
          'status', i.status,
          'title', coalesce(nullif(trim(target_profile.full_name), ''), 'Member'),
          'detail', 'Requested by ' || coalesce(nullif(trim(requester_profile.full_name), ''), 'Member'),
          'reason', i.reason,
          'is_demo', private.sample_subject(i.requester_id) or private.sample_subject(i.target_id),
          'subject_id', i.target_id,
          'created_at', i.requested_at
        ) as payload
      from public.member_intros i
      left join public.profiles requester_profile on requester_profile.user_id = i.requester_id
      left join public.profiles target_profile on target_profile.user_id = i.target_id

      union all

      select
        i.requested_at,
        jsonb_build_object(
          'id', i.id,
          'kind', 'mandate',
          'direction', 'outgoing',
          'status', i.status,
          'title', m.company_name,
          'detail', m.sector || ' · ' || m.deal_type || '. Requested by ' || coalesce(nullif(trim(p.full_name), ''), 'Member'),
          'reason', '',
          'is_demo', m.is_demo,
          'subject_id', m.id,
          'created_at', i.requested_at
        )
      from public.mandate_intros i
      join public.mandates m on m.id = i.mandate_id
      left join public.profiles p on p.user_id = i.member_id

      union all

      select
        i.requested_at,
        jsonb_build_object(
          'id', i.id,
          'kind', 'real_estate',
          'direction', 'outgoing',
          'status', i.status,
          'title', o.counterparty_name,
          'detail', o.sector || ' · ' || o.city || '. Requested by ' || coalesce(nullif(trim(p.full_name), ''), 'Member'),
          'reason', '',
          'is_demo', o.is_demo,
          'subject_id', o.id,
          'created_at', i.requested_at
        )
      from public.re_opportunity_intros i
      join public.re_opportunities o on o.id = i.opportunity_id
      left join public.profiles p on p.user_id = i.member_id

      union all

      select
        i.requested_at,
        jsonb_build_object(
          'id', i.id,
          'kind', 'partner',
          'direction', 'outgoing',
          'status', i.status,
          'title', t.name,
          'detail', t.city || '. Requested by ' || coalesce(nullif(trim(p.full_name), ''), 'Member'),
          'reason', '',
          'is_demo', t.is_demo,
          'subject_id', t.id,
          'created_at', i.requested_at
        )
      from public.re_partner_intros i
      join public.re_partners t on t.id = i.partner_id
      left join public.profiles p on p.user_id = i.member_id
    ) listed
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_list_all_intros() from public, anon;
grant execute on function public.staff_list_all_intros() to authenticated;

-- Existing unlock RPCs stay. They now refuse sample ids before any write.
create or replace function public.request_mandate_intro(p_mandate_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  visible boolean;
  current_status text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.members m
    where m.user_id = auth.uid()
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if private.sample_subject(p_mandate_id) then
    raise exception 'sample_blocked' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.mandates m
    where m.id = p_mandate_id
      and m.published
      and m.is_demo = false
  ) into visible;

  if not visible then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  insert into public.mandate_intros (mandate_id, member_id, status)
  values (p_mandate_id, auth.uid(), 'pending')
  on conflict (mandate_id, member_id) do nothing;

  select status into current_status
  from public.mandate_intros
  where mandate_id = p_mandate_id
    and member_id = auth.uid();

  return jsonb_build_object('status', current_status);
end;
$$;

revoke all on function public.request_mandate_intro(uuid) from public, anon;
grant execute on function public.request_mandate_intro(uuid) to authenticated;

create or replace function public.staff_decide_mandate_intro(
  p_intro_id uuid,
  p_decision text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  next_status text;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_decision = 'approved' then
    next_status := 'approved';
  elsif p_decision = 'declined' then
    next_status := 'declined';
  else
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.mandate_intros i
    join public.mandates m on m.id = i.mandate_id
    where i.id = p_intro_id
      and (m.is_demo or private.sample_subject(m.id))
  ) then
    raise exception 'sample_blocked' using errcode = '42501';
  end if;

  update public.mandate_intros
  set status = next_status,
      decided_at = now(),
      decided_by = auth.uid()
  where id = p_intro_id
    and status = 'pending';

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'status', next_status);
end;
$$;

revoke all on function public.staff_decide_mandate_intro(uuid, text) from public, anon;
grant execute on function public.staff_decide_mandate_intro(uuid, text) to authenticated;

create or replace function public.request_re_opportunity_intro(p_opportunity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  visible boolean;
  new_id uuid;
  current_status text;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and m.seat in ('ksa', 'intl')
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if private.sample_subject(p_opportunity_id) then
    raise exception 'sample_blocked' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.re_opportunities o
    where o.id = p_opportunity_id
      and o.published
      and o.is_demo = false
  ) into visible;

  if not visible then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  insert into public.re_opportunity_intros (opportunity_id, member_id, status)
  values (p_opportunity_id, auth.uid(), 'pending')
  on conflict (opportunity_id, member_id) do nothing
  returning id into new_id;

  if new_id is not null then
    perform private.note_re_intro_admin_alert(new_id);
  end if;

  select i.status into current_status
  from public.re_opportunity_intros i
  where i.opportunity_id = p_opportunity_id
    and i.member_id = auth.uid();

  return jsonb_build_object('status', current_status);
end;
$$;

revoke all on function public.request_re_opportunity_intro(uuid) from public, anon;
grant execute on function public.request_re_opportunity_intro(uuid) to authenticated;

create or replace function public.staff_decide_re_opportunity_intro(
  p_intro_id uuid,
  p_decision text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  next_status text;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_decision = 'approved' then
    next_status := 'approved';
  elsif p_decision = 'declined' then
    next_status := 'declined';
  else
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.re_opportunity_intros i
    join public.re_opportunities o on o.id = i.opportunity_id
    where i.id = p_intro_id
      and (o.is_demo or private.sample_subject(o.id))
  ) then
    raise exception 'sample_blocked' using errcode = '42501';
  end if;

  update public.re_opportunity_intros
  set status = next_status,
      decided_at = now(),
      decided_by = auth.uid()
  where id = p_intro_id
    and status = 'pending';

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'status', next_status);
end;
$$;

revoke all on function public.staff_decide_re_opportunity_intro(uuid, text) from public, anon;
grant execute on function public.staff_decide_re_opportunity_intro(uuid, text) to authenticated;

create or replace function public.request_re_partner_intro(p_partner_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  visible boolean;
  new_id uuid;
  current_status text;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and m.seat in ('ksa', 'intl')
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if private.sample_subject(p_partner_id) then
    raise exception 'sample_blocked' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.re_partners t
    where t.id = p_partner_id
      and t.published
      and t.is_demo = false
  ) into visible;

  if not visible then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  insert into public.re_partner_intros (partner_id, member_id, status)
  values (p_partner_id, auth.uid(), 'pending')
  on conflict (partner_id, member_id) do nothing
  returning id into new_id;

  if new_id is not null then
    perform private.note_re_intro_admin_alert(new_id);
  end if;

  select i.status into current_status
  from public.re_partner_intros i
  where i.partner_id = p_partner_id
    and i.member_id = auth.uid();

  return jsonb_build_object('status', current_status);
end;
$$;

revoke all on function public.request_re_partner_intro(uuid) from public, anon;
grant execute on function public.request_re_partner_intro(uuid) to authenticated;

create or replace function public.staff_decide_re_partner_intro(
  p_intro_id uuid,
  p_decision text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  next_status text;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_decision = 'approved' then
    next_status := 'approved';
  elsif p_decision = 'declined' then
    next_status := 'declined';
  else
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.re_partner_intros i
    join public.re_partners t on t.id = i.partner_id
    where i.id = p_intro_id
      and (t.is_demo or private.sample_subject(t.id))
  ) then
    raise exception 'sample_blocked' using errcode = '42501';
  end if;

  update public.re_partner_intros
  set status = next_status,
      decided_at = now(),
      decided_by = auth.uid()
  where id = p_intro_id
    and status = 'pending';

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'status', next_status);
end;
$$;

revoke all on function public.staff_decide_re_partner_intro(uuid, text) from public, anon;
grant execute on function public.staff_decide_re_partner_intro(uuid, text) to authenticated;

-- Home activity keeps the existing mandate and majlis rows and adds warm intros.
-- The detail line does not name the other member, and it carries no contact fields.
create or replace function public.list_member_home_activity()
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

  return (
    select coalesce(jsonb_agg(to_jsonb(item) order by item.happened_at desc), '[]'::jsonb)
    from (
      select
        id,
        kind,
        label,
        detail,
        happened_at,
        href,
        is_demo
      from (
        select
          i.id::text as id,
          'intro'::text as kind,
          case i.status
            when 'pending' then 'Intro requested'
            when 'approved' then 'Intro approved'
            else 'Intro declined'
          end as label,
          (m.sector || ' · ' || m.deal_type) as detail,
          i.requested_at as happened_at,
          '/dashboard/mandates'::text as href,
          m.is_demo as is_demo
        from public.mandate_intros i
        join public.mandates m on m.id = i.mandate_id
        where i.member_id = auth.uid()

        union all

        select
          i.id::text,
          'intro'::text,
          case i.status
            when 'pending' then 'Intro requested'
            when 'accepted' then 'Intro approved'
            else 'Intro declined'
          end,
          case
            when i.requester_id = auth.uid() then 'Warm introduction you requested'
            else 'Warm introduction to you'
          end,
          coalesce(i.decided_at, i.requested_at),
          '/dashboard/people/intros'::text,
          private.sample_subject(i.requester_id) or private.sample_subject(i.target_id)
        from public.member_intros i
        where i.requester_id = auth.uid()
           or i.target_id = auth.uid()

        union all

        select
          e.id::text,
          'majlis'::text,
          case
            when e.host_member_id = auth.uid() then 'Majlis you are hosting'
            when r.status = 'waitlist' then 'Majlis waitlist'
            else 'Majlis registration'
          end,
          (e.title || ' · ' || e.region),
          r.registered_at,
          ('/dashboard/majlis?event=' || e.id::text),
          false
        from public.majlis_rsvps r
        join public.majlis_events e on e.id = r.event_id
        where r.member_id = auth.uid()
          and r.status in ('registered', 'waitlist')
          and e.status in ('published', 'pending_approval')

        union all

        select
          e.id::text,
          'majlis'::text,
          'Majlis you are hosting'::text,
          (e.title || ' · ' || e.region),
          e.created_at,
          ('/dashboard/majlis?event=' || e.id::text),
          false
        from public.majlis_events e
        where e.host_member_id = auth.uid()
          and e.status in ('published', 'pending_approval')
          and not exists (
            select 1
            from public.majlis_rsvps r
            where r.event_id = e.id
              and r.member_id = auth.uid()
              and r.status in ('registered', 'waitlist')
          )
      ) events
      order by happened_at desc
      limit 5
    ) item
  );
end;
$$;

revoke all on function public.list_member_home_activity() from public, anon;
grant execute on function public.list_member_home_activity() to authenticated;

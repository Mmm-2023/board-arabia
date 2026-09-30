-- INTROS-A: contact details after accept, desk-assisted intros, monthly limit.
-- Contacts are returned only by list_accepted_intro_contacts, and only when
-- the caller is one of the two parties on an accepted intro.
-- Pending, declined, and any other member receive no contact fields.
-- Admin mail stays on the existing Edge path. No mailbox is stored here.
-- Apply after review. Not applied by the authoring agent.

alter table public.profiles
  add column if not exists calendar_url text;

alter table public.profiles drop constraint if exists profiles_calendar_url_check;
alter table public.profiles
  add constraint profiles_calendar_url_check check (
    calendar_url is null
    or (
      char_length(calendar_url) <= 500
      and calendar_url ~ '^https://'
      and position('@' in calendar_url) = 0
    )
  );

grant select (calendar_url) on table public.profiles to authenticated;
grant update (calendar_url) on table public.profiles to authenticated;

alter table public.member_intros
  add column if not exists ask_desk boolean not null default false,
  add column if not exists desk_status text,
  add column if not exists desk_note text,
  add column if not exists desk_sent_at timestamptz,
  add column if not exists desk_sent_by uuid,
  add column if not exists desk_notified_at timestamptz;

alter table public.member_intros drop constraint if exists member_intros_desk_status;
alter table public.member_intros
  add constraint member_intros_desk_status check (
    desk_status is null or desk_status in ('queued', 'sent')
  );

alter table public.member_intros drop constraint if exists member_intros_desk_note_len;
alter table public.member_intros
  add constraint member_intros_desk_note_len check (
    desk_note is null or char_length(desk_note) <= 280
  );

alter table public.member_intros drop constraint if exists member_intros_desk_pair;
alter table public.member_intros
  add constraint member_intros_desk_pair check (
    (ask_desk = false and desk_status is null)
    or ask_desk = true
  );

create table if not exists public.intro_quota_settings (
  id boolean primary key default true,
  monthly_limit integer not null default 5,
  updated_at timestamptz not null default now(),
  constraint intro_quota_settings_one_row check (id),
  constraint intro_quota_settings_monthly_limit check (monthly_limit between 1 and 100)
);

insert into public.intro_quota_settings (id, monthly_limit)
values (true, 5)
on conflict (id) do nothing;

alter table public.intro_quota_settings enable row level security;
alter table public.intro_quota_settings force row level security;
revoke all on table public.intro_quota_settings from public, anon, authenticated;

create table if not exists public.member_intro_desk_audits (
  id uuid primary key default gen_random_uuid(),
  intro_id uuid not null references public.member_intros (id) on delete cascade,
  actor_id uuid not null,
  action text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint member_intro_desk_audits_action check (action = 'intro_sent'),
  constraint member_intro_desk_audits_note_len check (char_length(note) <= 280)
);

create index if not exists member_intro_desk_audits_intro_idx
  on public.member_intro_desk_audits (intro_id, created_at desc);

alter table public.member_intro_desk_audits enable row level security;
alter table public.member_intro_desk_audits force row level security;
revoke all on table public.member_intro_desk_audits from public, anon, authenticated;

drop policy if exists member_intro_desk_audits_select_staff on public.member_intro_desk_audits;
create policy member_intro_desk_audits_select_staff
  on public.member_intro_desk_audits
  for select to authenticated
  using (private.is_staff());

grant select on table public.member_intro_desk_audits to authenticated;

create or replace function private.riyadh_month_start(p_at timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select date_trunc('month', timezone('Asia/Riyadh', p_at)) at time zone 'Asia/Riyadh';
$$;

revoke all on function private.riyadh_month_start(timestamptz) from public, anon, authenticated;

create or replace function private.intro_allowance_for(p_member uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base integer;
  v_extra integer := 0;
begin
  select s.monthly_limit into v_base
  from public.intro_quota_settings s
  where s.id;

  v_base := coalesce(v_base, 5);

  select coalesce(p.intro_credits, 0) into v_extra
  from public.members m
  join public.sponsor_seat_packages seat on seat.member_id = m.user_id
  join public.sponsor_packages p on p.slug = seat.package_slug
  where m.user_id = p_member
    and m.seat = 'sponsor'
    and m.is_demo = false;

  return v_base + coalesce(v_extra, 0);
end;
$$;

revoke all on function private.intro_allowance_for(uuid) from public, anon, authenticated;

drop function if exists public.request_member_intro(uuid, text);

create or replace function public.request_member_intro(
  p_target_id uuid,
  p_reason text,
  p_ask_desk boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  current_status text;
  v_used integer;
  v_allowance integer;
  v_start timestamptz;
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

  select i.status into current_status
  from public.member_intros i
  where i.requester_id = auth.uid()
    and i.target_id = p_target_id;

  if current_status is not null then
    return jsonb_build_object('status', current_status);
  end if;

  v_start := private.riyadh_month_start(now());
  select count(*)::int into v_used
  from public.member_intros i
  where i.requester_id = auth.uid()
    and i.requested_at >= v_start
    and i.requested_at < (v_start + interval '1 month');

  v_allowance := private.intro_allowance_for(auth.uid());
  if v_used >= v_allowance then
    raise exception 'intro_limit' using errcode = 'P0001';
  end if;

  insert into public.member_intros (requester_id, target_id, reason, status, ask_desk)
  values (auth.uid(), p_target_id, v_reason, 'pending', coalesce(p_ask_desk, false));

  return jsonb_build_object('status', 'pending');
end;
$$;

revoke all on function public.request_member_intro(uuid, text, boolean) from public, anon;
grant execute on function public.request_member_intro(uuid, text, boolean) to authenticated;

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
  v_ask boolean;
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

  select i.requester_id, i.target_id, i.ask_desk
    into v_requester, v_target, v_ask
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
      decided_at = now(),
      desk_status = case
        when next_status = 'accepted' and v_ask then 'queued'
        else desk_status
      end
  where id = p_intro_id
    and target_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'status', next_status,
    'desk_queued', next_status = 'accepted' and coalesce(v_ask, false)
  );
end;
$$;

revoke all on function public.respond_member_intro(uuid, text) from public, anon;
grant execute on function public.respond_member_intro(uuid, text) to authenticated;

create or replace function public.list_accepted_intro_contacts()
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
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'intro_id', i.id,
      'email', nullif(btrim(other_member.email), ''),
      'linkedin_url', case
        when other_profile.linkedin_url ~ '^https://' then other_profile.linkedin_url
        else null
      end,
      'phone', nullif(btrim(other_profile.phone), ''),
      'calendar_url', case
        when other_profile.calendar_url ~ '^https://' then other_profile.calendar_url
        else null
      end
    )))
    from public.member_intros i
    join public.members other_member
      on other_member.user_id = case
        when i.requester_id = auth.uid() then i.target_id
        else i.requester_id
      end
    left join public.profiles other_profile
      on other_profile.user_id = other_member.user_id
    where i.status = 'accepted'
      and (i.requester_id = auth.uid() or i.target_id = auth.uid())
      and other_member.is_demo = false
      and not private.sample_subject(other_member.user_id)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_accepted_intro_contacts() from public, anon;
grant execute on function public.list_accepted_intro_contacts() to authenticated;

create or replace function public.my_intro_quota()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base integer;
  v_allowance integer;
  v_used integer;
  v_start timestamptz;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select s.monthly_limit into v_base
  from public.intro_quota_settings s
  where s.id;
  v_base := coalesce(v_base, 5);
  v_allowance := private.intro_allowance_for(auth.uid());
  v_start := private.riyadh_month_start(now());

  select count(*)::int into v_used
  from public.member_intros i
  where i.requester_id = auth.uid()
    and i.requested_at >= v_start
    and i.requested_at < (v_start + interval '1 month');

  return jsonb_build_object(
    'used', v_used,
    'base', v_base,
    'allowance', v_allowance,
    'remaining', greatest(0, v_allowance - v_used)
  );
end;
$$;

revoke all on function public.my_intro_quota() from public, anon;
grant execute on function public.my_intro_quota() to authenticated;

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
          'detail', '',
          'requester_name', coalesce(nullif(trim(requester_profile.full_name), ''), 'Member'),
          'target_name', coalesce(nullif(trim(target_profile.full_name), ''), 'Member'),
          'reason', i.reason,
          'is_demo', private.sample_subject(i.requester_id) or private.sample_subject(i.target_id),
          'subject_id', i.target_id,
          'avatar_style', coalesce(target_profile.avatar_style, 'male'),
          'avatar_path', target_profile.avatar_path,
          'ask_desk', i.ask_desk,
          'desk_status', i.desk_status,
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
          'detail', m.sector || ' · ' || m.deal_type,
          'requester_name', coalesce(nullif(trim(p.full_name), ''), 'Member'),
          'reason', '',
          'is_demo', m.is_demo,
          'subject_id', m.id,
          'avatar_style', coalesce(p.avatar_style, 'male'),
          'avatar_path', p.avatar_path,
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
          'detail', o.sector || ' · ' || o.city,
          'requester_name', coalesce(nullif(trim(p.full_name), ''), 'Member'),
          'reason', '',
          'is_demo', o.is_demo,
          'subject_id', o.id,
          'avatar_style', coalesce(p.avatar_style, 'male'),
          'avatar_path', p.avatar_path,
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
          'detail', t.city,
          'requester_name', coalesce(nullif(trim(p.full_name), ''), 'Member'),
          'reason', '',
          'is_demo', t.is_demo,
          'subject_id', t.id,
          'avatar_style', coalesce(p.avatar_style, 'male'),
          'avatar_path', p.avatar_path,
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

create or replace function public.staff_list_desk_intros()
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
    select jsonb_agg(jsonb_build_object(
      'id', i.id,
      'requester_name', coalesce(nullif(trim(requester_profile.full_name), ''), 'Member'),
      'target_name', coalesce(nullif(trim(target_profile.full_name), ''), 'Member'),
      'reason', i.reason,
      'desk_status', i.desk_status,
      'desk_note', coalesce(i.desk_note, ''),
      'is_demo', private.sample_subject(i.requester_id) or private.sample_subject(i.target_id),
      'created_at', i.requested_at
    ) order by case when i.desk_status = 'queued' then 0 else 1 end, i.decided_at desc nulls last)
    from public.member_intros i
    left join public.profiles requester_profile on requester_profile.user_id = i.requester_id
    left join public.profiles target_profile on target_profile.user_id = i.target_id
    where i.ask_desk
      and i.status = 'accepted'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_list_desk_intros() from public, anon;
grant execute on function public.staff_list_desk_intros() to authenticated;

create or replace function public.staff_mark_desk_intro_sent(
  p_intro_id uuid,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := btrim(coalesce(p_note, ''));
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if char_length(v_note) > 280 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.member_intros i
    where i.id = p_intro_id
      and (private.sample_subject(i.requester_id) or private.sample_subject(i.target_id))
  ) then
    raise exception 'sample_blocked' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.member_intros i
    where i.id = p_intro_id
      and i.ask_desk
      and i.status = 'accepted'
      and i.desk_status = 'queued'
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  insert into public.member_intro_desk_audits (intro_id, actor_id, action, note)
  values (p_intro_id, auth.uid(), 'intro_sent', v_note);

  update public.member_intros
  set desk_status = 'sent',
      desk_note = nullif(v_note, ''),
      desk_sent_at = now(),
      desk_sent_by = auth.uid()
  where id = p_intro_id
    and ask_desk
    and status = 'accepted'
    and desk_status = 'queued';

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'status', 'sent');
end;
$$;

revoke all on function public.staff_mark_desk_intro_sent(uuid, text) from public, anon;
grant execute on function public.staff_mark_desk_intro_sent(uuid, text) to authenticated;

create or replace function public.staff_get_intro_monthly_limit()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select s.monthly_limit into v_limit
  from public.intro_quota_settings s
  where s.id;

  return jsonb_build_object('monthly_limit', coalesce(v_limit, 5));
end;
$$;

revoke all on function public.staff_get_intro_monthly_limit() from public, anon;
grant execute on function public.staff_get_intro_monthly_limit() to authenticated;

create or replace function public.staff_set_intro_monthly_limit(p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid_limit' using errcode = '22023';
  end if;

  update public.intro_quota_settings
  set monthly_limit = p_limit,
      updated_at = now()
  where id = true;

  return jsonb_build_object('monthly_limit', p_limit);
end;
$$;

revoke all on function public.staff_set_intro_monthly_limit(integer) from public, anon;
grant execute on function public.staff_set_intro_monthly_limit(integer) to authenticated;

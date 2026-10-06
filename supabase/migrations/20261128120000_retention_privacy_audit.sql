-- Directory hide, member data download, due diligence 30-day retention, and the staff access log.
-- 20261127120000_staff_aal2_private_files.sql is applied live. This file sorts after it.
-- private.is_staff() already requires aal2. Apply this file only after that migration.
-- Factory does not apply migrations.

-- ---------------------------------------------------------------------------
-- Staff access log. Insert-only from server code. aal2 staff may read.
-- ---------------------------------------------------------------------------

create table if not exists public.staff_access_log (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null,
  member_id uuid,
  object_type text not null,
  object_id uuid,
  action text not null default 'read',
  created_at timestamptz not null default now(),
  constraint staff_access_log_action_check check (action = 'read'),
  constraint staff_access_log_object_type_check check (char_length(btrim(object_type)) between 1 and 80)
);

comment on table public.staff_access_log is
  'Staff reads of one member record or a member-shared file. Insert-only. Readable by aal2 staff. Kept 13 months.';

create index if not exists staff_access_log_member_idx
  on public.staff_access_log (member_id, created_at desc);

create index if not exists staff_access_log_created_idx
  on public.staff_access_log (created_at);

alter table public.staff_access_log enable row level security;
alter table public.staff_access_log force row level security;

revoke all on table public.staff_access_log from public, anon, authenticated;
grant select on table public.staff_access_log to authenticated;
grant insert on table public.staff_access_log to service_role;

drop policy if exists staff_access_log_select_staff on public.staff_access_log;
create policy staff_access_log_select_staff
  on public.staff_access_log
  for select
  to authenticated
  using (private.is_staff());

create or replace function private.log_staff_access(
  p_staff uuid,
  p_member uuid,
  p_object_type text,
  p_object_id uuid,
  p_action text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_staff is null or p_object_type is null or btrim(p_object_type) = '' then
    return;
  end if;
  if p_action is distinct from 'read' then
    return;
  end if;
  insert into public.staff_access_log (staff_user_id, member_id, object_type, object_id, action)
  values (p_staff, p_member, left(btrim(p_object_type), 80), p_object_id, 'read');
end;
$$;

revoke all on function private.log_staff_access(uuid, uuid, text, uuid, text)
  from public, anon, authenticated, service_role;

-- Replaces the empty body from 20261127120000. Staff reads of a shared row log here.
create or replace function private.note_staff_shared_read(p_table text, p_row_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid;
begin
  if p_table is null or p_row_id is null then
    return;
  end if;
  if not private.is_staff() then
    return;
  end if;
  if p_table = 'due_diligence_reports' then
    select r.member_id into v_member from public.due_diligence_reports r where r.id = p_row_id;
  elsif p_table = 'due_diligence_decks' then
    select d.member_id into v_member from public.due_diligence_decks d where d.id = p_row_id;
  elsif p_table = 'due_diligence_jobs' then
    select j.member_id into v_member from public.due_diligence_jobs j where j.id = p_row_id;
  elsif p_table = 'ai_tool_jobs' then
    select j.member_id into v_member from public.ai_tool_jobs j where j.id = p_row_id;
  elsif p_table = 'ai_tool_outputs' then
    select o.member_id into v_member from public.ai_tool_outputs o where o.id = p_row_id;
  elsif p_table = 'ai_tool_notes' then
    select n.member_id into v_member from public.ai_tool_notes n where n.id = p_row_id;
  else
    return;
  end if;
  if v_member is null then
    return;
  end if;
  perform private.log_staff_access(auth.uid(), v_member, p_table, p_row_id, 'read');
end;
$$;

comment on function private.note_staff_shared_read(text, uuid) is
  'Writes one staff_access_log row when aal2 staff read a member-shared due diligence or AI row.';

revoke all on function private.note_staff_shared_read(text, uuid) from public, anon, authenticated;

-- Edge functions call this with the service role after they have already checked aal2 and the share.
create or replace function public.record_staff_shared_read(
  p_staff uuid,
  p_table text,
  p_row_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid;
  v_shared boolean;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_staff is null or p_table is null or p_row_id is null then
    return;
  end if;
  if not exists (
    select 1
    from public.staff_users s
    where s.user_id = p_staff
      and s.role in ('staff', 'master')
  ) then
    return;
  end if;
  if p_table = 'due_diligence_reports' then
    select r.member_id, r.shared_with_admin_at is not null into v_member, v_shared
    from public.due_diligence_reports r where r.id = p_row_id;
  elsif p_table = 'due_diligence_decks' then
    select d.member_id, d.shared_with_admin_at is not null into v_member, v_shared
    from public.due_diligence_decks d where d.id = p_row_id;
  elsif p_table = 'due_diligence_jobs' then
    select j.member_id, j.shared_with_admin_at is not null into v_member, v_shared
    from public.due_diligence_jobs j where j.id = p_row_id;
  elsif p_table = 'ai_tool_jobs' then
    select j.member_id, j.shared_with_admin_at is not null into v_member, v_shared
    from public.ai_tool_jobs j where j.id = p_row_id;
  elsif p_table = 'ai_tool_outputs' then
    select o.member_id, o.shared_with_admin_at is not null into v_member, v_shared
    from public.ai_tool_outputs o where o.id = p_row_id;
  elsif p_table = 'ai_tool_notes' then
    select n.member_id, n.shared_with_admin_at is not null into v_member, v_shared
    from public.ai_tool_notes n where n.id = p_row_id;
  else
    return;
  end if;
  if v_member is null or v_shared is distinct from true then
    return;
  end if;
  perform private.log_staff_access(p_staff, v_member, p_table, p_row_id, 'read');
end;
$$;

revoke all on function public.record_staff_shared_read(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.record_staff_shared_read(uuid, text, uuid) to service_role;

create or replace function public.staff_read_membership_request(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  person jsonb;
  notes jsonb;
  events jsonb;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select to_jsonb(c) into person
  from public.candidates c
  where c.user_id = p_user_id;
  if person is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at), '[]'::jsonb) into notes
  from public.candidate_notes n
  where n.candidate_user_id = p_user_id;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]'::jsonb) into events
  from public.candidate_events e
  where e.candidate_user_id = p_user_id;
  perform private.log_staff_access(auth.uid(), p_user_id, 'membership_request', p_user_id, 'read');
  return jsonb_build_object('candidate', person, 'notes', notes, 'events', events);
end;
$$;

revoke all on function public.staff_read_membership_request(uuid) from public, anon;
grant execute on function public.staff_read_membership_request(uuid) to authenticated;

create or replace function public.staff_read_member(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  found jsonb;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'user_id', m.user_id,
    'email', m.email,
    'seat', m.seat,
    'status', m.status,
    'directory_hidden', coalesce(m.directory_hidden, false),
    'full_name', coalesce(nullif(trim(p.full_name), ''), 'Member')
  ) into found
  from public.members m
  left join public.profiles p on p.user_id = m.user_id
  where m.user_id = p_user_id;
  if found is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.log_staff_access(auth.uid(), p_user_id, 'member', p_user_id, 'read');
  return found;
end;
$$;

revoke all on function public.staff_read_member(uuid) from public, anon;
grant execute on function public.staff_read_member(uuid) to authenticated;

create or replace function public.staff_read_desk_intro(p_intro_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  found jsonb;
  requester uuid;
  target uuid;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', i.id,
    'requester_id', i.requester_id,
    'target_id', i.target_id,
    'status', i.status,
    'requester_hidden', coalesce(requester_member.directory_hidden, false),
    'target_hidden', coalesce(target_member.directory_hidden, false),
    'requester_name', coalesce(nullif(trim(requester_profile.full_name), ''), 'Member'),
    'target_name', coalesce(nullif(trim(target_profile.full_name), ''), 'Member')
  ), i.requester_id, i.target_id
  into found, requester, target
  from public.member_intros i
  join public.members requester_member on requester_member.user_id = i.requester_id
  join public.members target_member on target_member.user_id = i.target_id
  left join public.profiles requester_profile on requester_profile.user_id = i.requester_id
  left join public.profiles target_profile on target_profile.user_id = i.target_id
  where i.id = p_intro_id
    and i.ask_desk;
  if found is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.log_staff_access(auth.uid(), requester, 'desk_intro', p_intro_id, 'read');
  perform private.log_staff_access(auth.uid(), target, 'desk_intro', p_intro_id, 'read');
  return found;
end;
$$;

revoke all on function public.staff_read_desk_intro(uuid) from public, anon;
grant execute on function public.staff_read_desk_intro(uuid) to authenticated;

create or replace function public.staff_read_shared_item(p_table text, p_row_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_table not in (
    'due_diligence_reports',
    'due_diligence_decks',
    'due_diligence_jobs',
    'ai_tool_jobs',
    'ai_tool_outputs',
    'ai_tool_notes'
  ) or p_row_id is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  execute format(
    'select member_id from public.%I where id = $1 and shared_with_admin_at is not null',
    p_table
  ) into v_member using p_row_id;
  if v_member is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.note_staff_shared_read(p_table, p_row_id);
  return jsonb_build_object('object_type', p_table, 'object_id', p_row_id, 'member_id', v_member);
end;
$$;

revoke all on function public.staff_read_shared_item(text, uuid) from public, anon;
grant execute on function public.staff_read_shared_item(text, uuid) to authenticated;

create or replace function public.staff_list_access_log(p_member_id uuid)
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
  if p_member_id is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', l.id,
      'object_type', l.object_type,
      'object_id', l.object_id,
      'action', l.action,
      'at', l.created_at,
      'actor_name', case
        when nullif(btrim(p.full_name), '') is null then null
        when position('@' in btrim(p.full_name)) > 0 then null
        else btrim(p.full_name)
      end,
      'actor_role', case s.role
        when 'master' then 'Master'
        when 'staff' then 'Admin'
        else null
      end
    ) order by l.created_at desc)
    from (
      select id, staff_user_id, object_type, object_id, action, created_at
      from public.staff_access_log
      where member_id = p_member_id
      order by created_at desc
      limit 200
    ) l
    left join public.staff_users s on s.user_id = l.staff_user_id
    left join public.profiles p on p.user_id = l.staff_user_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_list_access_log(uuid) from public, anon;
grant execute on function public.staff_list_access_log(uuid) to authenticated;

-- Intro desk list reads log each person on the row. Hidden members stay in this list.
create or replace function public.staff_list_desk_intros()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  for rec in
    select i.id, i.requester_id, i.target_id
    from public.member_intros i
    where i.ask_desk
      and i.status = 'accepted'
  loop
    perform private.log_staff_access(auth.uid(), rec.requester_id, 'desk_intro', rec.id, 'read');
    perform private.log_staff_access(auth.uid(), rec.target_id, 'desk_intro', rec.id, 'read');
  end loop;

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

-- ---------------------------------------------------------------------------
-- Directory hide. Owner sets it. Other members do not see the row.
-- ---------------------------------------------------------------------------

alter table public.members add column if not exists directory_hidden boolean not null default false;
alter table public.members add column if not exists is_demo boolean not null default false;
alter table public.members add column if not exists application_id uuid;
alter table public.members add column if not exists left_at timestamptz;
alter table public.members add column if not exists legal_hold boolean not null default false;
alter table public.members add column if not exists anonymised_at timestamptz;

comment on column public.members.directory_hidden is
  'When true, list_directory omits this member for other members. Admin can still introduce them.';

create or replace function public.set_directory_hidden(p_hidden boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_hidden is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.members
  set directory_hidden = p_hidden
  where user_id = auth.uid()
    and status in ('invited', 'active');
  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return jsonb_build_object('directory_hidden', p_hidden);
end;
$$;

revoke all on function public.set_directory_hidden(boolean) from public, anon;
grant execute on function public.set_directory_hidden(boolean) to authenticated;

create or replace function public.own_directory_visibility()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  hidden boolean;
begin
  if auth.uid() is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select m.directory_hidden into hidden
  from public.members m
  where m.user_id = auth.uid()
    and m.status in ('invited', 'active');
  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return jsonb_build_object('directory_hidden', coalesce(hidden, false));
end;
$$;

revoke all on function public.own_directory_visibility() from public, anon;
grant execute on function public.own_directory_visibility() to authenticated;

create or replace function public.list_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  real_n int;
  show_demo boolean;
begin
  if not private.can_read_member_room() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select count(*)::int into real_n
  from public.members m
  where m.is_demo = false
    and m.status in ('invited', 'active')
    and m.seat in ('ksa', 'intl')
    and (coalesce(m.directory_hidden, false) = false or m.user_id = auth.uid());

  show_demo := private.demo_rows_visible('directory', real_n);

  return coalesce((
    select jsonb_agg(payload order by demo_flag, sort_order, sort_name)
    from (
      select
        false as demo_flag,
        0 as sort_order,
        lower(coalesce(p.full_name, '')) as sort_name,
        jsonb_build_object(
          'id', m.user_id,
          'is_demo', false,
          'full_name', coalesce(nullif(trim(p.full_name), ''), 'Member'),
          'headline', coalesce(p.headline, ''),
          'company', coalesce(p.company, ''),
          'location', coalesce(p.location, ''),
          'sector', coalesce(p.sector_tags[1], ''),
          'sectors', coalesce(to_jsonb(p.sector_tags), '[]'::jsonb),
          'vision_themes', coalesce(to_jsonb(p.vision_themes), '[]'::jsonb),
          'availability', p.availability,
          'seat', m.seat,
          'preferred_partner', (m.seat = 'sponsor'),
          'portrait_asset', null,
          'avatar_path', p.avatar_path,
          'avatar_style', coalesce(p.avatar_style, 'male'),
          'membership_status', m.status
        ) as payload
      from public.members m
      join public.profiles p on p.user_id = m.user_id
      where m.is_demo = false
        and m.status in ('invited', 'active')
        and m.seat in ('ksa', 'intl', 'sponsor')
        and (coalesce(m.directory_hidden, false) = false or m.user_id = auth.uid())
      union all
      select
        true,
        d.sort_order,
        lower(d.full_name),
        jsonb_build_object(
          'id', d.id,
          'is_demo', true,
          'full_name', d.full_name,
          'headline', d.headline,
          'company', d.company,
          'location', d.location,
          'sector', d.sector,
          'sectors', jsonb_build_array(d.sector),
          'vision_themes', coalesce(to_jsonb(d.vision_themes), '[]'::jsonb),
          'availability', d.availability,
          'seat', d.seat,
          'preferred_partner', false,
          'portrait_asset', d.portrait_asset,
          'avatar_path', null,
          'avatar_style', 'male',
          'membership_status', null
        )
      from public.directory_entries d
      where d.is_demo
        and show_demo
    ) listed
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_directory() from public, anon;
grant execute on function public.list_directory() to authenticated;

-- ---------------------------------------------------------------------------
-- Download my data. Owner only. Once per hour. No other member contact
-- unless that introduction is already accepted.
-- ---------------------------------------------------------------------------

create table if not exists public.data_download_requests (
  member_id uuid primary key,
  requested_at timestamptz not null default now()
);

comment on table public.data_download_requests is
  'Last successful download time for the once-per-hour limit. Not readable by clients.';

alter table public.data_download_requests enable row level security;
alter table public.data_download_requests force row level security;

revoke all on table public.data_download_requests from public, anon, authenticated;

create or replace function public.download_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile jsonb;
  application jsonb;
  introductions jsonb;
  tier_history jsonb;
  consents jsonb;
  ai_jobs jsonb;
  ai_reports jsonb;
  dd_jobs jsonb;
  dd_reports jsonb;
  tier_csv text;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  insert into public.data_download_requests (member_id, requested_at)
  values (auth.uid(), now())
  on conflict (member_id) do nothing;

  if not found then
    update public.data_download_requests
    set requested_at = now()
    where member_id = auth.uid()
      and requested_at <= now() - interval '1 hour';
    if not found then
      raise exception 'rate_limited' using errcode = '42501';
    end if;
  end if;

  profile := (
    select to_jsonb(p)
    from public.profiles p
    where p.user_id = auth.uid()
  );

  application := (
    select to_jsonb(a)
    from public.applications a
    join public.members m on m.application_id = a.id
    where m.user_id = auth.uid()
  );

  introductions := (
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', i.id,
      'status', i.status,
      'direction', case when i.requester_id = auth.uid() then 'outgoing' else 'incoming' end,
      'reason', case when i.requester_id = auth.uid() then i.reason else null end,
      'other_name', coalesce(nullif(trim(other_profile.full_name), ''), 'Member'),
      'email', case when i.status = 'accepted' then nullif(btrim(other_member.email), '') else null end,
      'phone', case when i.status = 'accepted' then nullif(btrim(other_profile.phone), '') else null end
    ))), '[]'::jsonb)
    from public.member_intros i
    join public.members other_member
      on other_member.user_id = case
        when i.requester_id = auth.uid() then i.target_id
        else i.requester_id
      end
    left join public.profiles other_profile on other_profile.user_id = other_member.user_id
    where i.requester_id = auth.uid() or i.target_id = auth.uid()
  );

  tier_history := (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id,
      'before_tiers', a.before_tiers,
      'after_tiers', a.after_tiers,
      'created_at', a.created_at
    ) order by a.created_at), '[]'::jsonb)
    from public.member_tier_audits a
    where a.member_user_id = auth.uid()
  );

  consents := (
    select coalesce(jsonb_build_object(
      'ai_tools', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id,
          'tool_key', c.tool_key,
          'accepted_at', c.accepted_at
        ))
        from public.ai_tool_consents c
        where c.member_id = auth.uid()
      ), '[]'::jsonb),
      'cookies', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', cl.id,
          'choice', cl.choice,
          'created_at', cl.created_at
        ))
        from public.consent_log cl
        where cl.user_id = auth.uid()
      ), '[]'::jsonb)
    ), '{}'::jsonb)
  );

  ai_jobs := (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', j.id,
      'tool_key', j.tool_key,
      'status', j.status,
      'file_name', j.file_name,
      'created_at', j.created_at,
      'shared_with_admin', j.shared_with_admin_at is not null
    )), '[]'::jsonb)
    from public.ai_tool_jobs j
    where j.member_id = auth.uid()
  );

  ai_reports := (
    select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
    from public.ai_tool_outputs o
    where o.member_id = auth.uid()
  );

  dd_jobs := (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', j.id,
      'deck_id', j.deck_id,
      'status', j.status,
      'created_at', j.created_at,
      'shared_with_admin', j.shared_with_admin_at is not null
    )), '[]'::jsonb)
    from public.due_diligence_jobs j
    where j.member_id = auth.uid()
  );

  dd_reports := (
    select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
    from public.due_diligence_reports r
    where r.member_id = auth.uid()
  );

  tier_csv := (
    select coalesce(string_agg(
      a.id::text || ',' || coalesce(array_to_string(a.before_tiers, '|'), '') || ',' || coalesce(array_to_string(a.after_tiers, '|'), '') || ',' || a.created_at::text,
      E'\n' order by a.created_at
    ), '')
    from public.member_tier_audits a
    where a.member_user_id = auth.uid()
  );

  return jsonb_build_object(
    'profile', coalesce(profile, '{}'::jsonb),
    'member', (
      select jsonb_build_object(
        'user_id', m.user_id,
        'email', m.email,
        'seat', m.seat,
        'status', m.status,
        'directory_hidden', coalesce(m.directory_hidden, false)
      )
      from public.members m
      where m.user_id = auth.uid()
    ),
    'application', coalesce(application, '{}'::jsonb),
    'introductions', introductions,
    'tier_history', tier_history,
    'tier_history_csv', 'id,before,after,at' || E'\n' || tier_csv,
    'consents', consents,
    'ai_jobs', ai_jobs,
    'ai_reports', ai_reports,
    'due_diligence_jobs', dd_jobs,
    'due_diligence_reports', dd_reports
  );
end;
$$;

revoke all on function public.download_my_data() from public, anon;
grant execute on function public.download_my_data() to authenticated;

comment on function public.download_my_data() is
  'Owner-only JSON export. Once per hour. Accepted introductions include only the contact the caller already sees.';

-- ---------------------------------------------------------------------------
-- Due diligence deck hint flag. Default off. Sasha flips dd_retention_copy.
-- ---------------------------------------------------------------------------

create table if not exists public.ai_tool_settings (
  id boolean primary key default true,
  retention_days integer not null default 30,
  updated_at timestamptz not null default now(),
  constraint ai_tool_settings_one_row check (id),
  constraint ai_tool_settings_days check (retention_days between 1 and 3650)
);

insert into public.ai_tool_settings (id, retention_days)
values (true, 30)
on conflict (id) do nothing;

alter table public.ai_tool_settings
  add column if not exists dd_retention_copy boolean not null default false;

comment on column public.ai_tool_settings.dd_retention_copy is
  'Flag name dd_retention_copy. Default false keeps the current deck hint. True adds Deleted automatically after 30 days. Set with set_dd_retention_copy.';

create or replace function public.read_dd_retention_copy()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select s.dd_retention_copy
    from public.ai_tool_settings s
    where s.id
  ), false);
$$;

revoke all on function public.read_dd_retention_copy() from public, anon;
grant execute on function public.read_dd_retention_copy() to authenticated;

create or replace function public.set_dd_retention_copy(p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_staff() or p_on is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.ai_tool_settings
  set dd_retention_copy = p_on,
      updated_at = now()
  where id = true;
  return jsonb_build_object('dd_retention_copy', p_on);
end;
$$;

revoke all on function public.set_dd_retention_copy(boolean) from public, anon;
grant execute on function public.set_dd_retention_copy(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Retention. Same 30-day setting for due diligence decks, jobs, and reports.
-- Staff access log follows the 13-month consent_log rule.
-- The 7-day, 120-day, 12-month, 24-month, and 13-month consent rules stay.
-- ---------------------------------------------------------------------------

create table if not exists public.due_diligence_file_purge (
  storage_path text primary key,
  created_at timestamptz not null default now(),
  constraint due_diligence_file_purge_path_check check (
    char_length(storage_path) between 3 and 300
    and storage_path !~ '[[:cntrl:]]'
    and position('..' in storage_path) = 0
  )
);

comment on table public.due_diligence_file_purge is
  'Deck storage paths queued by retention_sweep_plan. The retention-sweep Edge function deletes the objects.';

alter table public.due_diligence_decks
  add column if not exists created_at timestamptz not null default now();
alter table public.due_diligence_jobs
  add column if not exists created_at timestamptz not null default now();
alter table public.due_diligence_jobs
  add column if not exists deck_id uuid;
alter table public.due_diligence_reports
  add column if not exists created_at timestamptz not null default now();
alter table public.due_diligence_reports
  add column if not exists deck_id uuid;
alter table public.due_diligence_reports
  add column if not exists job_id uuid;
alter table public.ai_tool_consents
  add column if not exists job_id uuid;
alter table public.ai_tool_outputs
  add column if not exists shared_with_admin_at timestamptz;
alter table public.ai_tool_jobs
  add column if not exists shared_with_admin_at timestamptz;
alter table public.ai_tool_jobs
  add column if not exists created_at timestamptz not null default now();
alter table public.ai_tool_jobs
  add column if not exists storage_path text;
alter table public.ai_tool_jobs
  add column if not exists file_name text;
alter table public.ai_tool_jobs
  add column if not exists tool_key text;

create or replace function public.retention_sweep_plan(p_apply boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, private
as $$
declare
  unverified uuid[];
  never_submitted uuid[];
  decided uuid[];
  applications uuid[];
  members uuid[];
  invites uuid[];
  reminders uuid[];
  consent_ids uuid[];
  all_ids uuid[];
  event_count int := 0;
  cache_count int := 0;
  returned_count int := 0;
  uid uuid;
  invite_id uuid;
  retention_days int := 30;
  ai_jobs uuid[] := '{}';
  ai_due_files text[] := '{}';
  ai_queued_files text[] := '{}';
  ai_files text[] := '{}';
  dd_decks uuid[] := '{}';
  dd_jobs uuid[] := '{}';
  dd_reports uuid[] := '{}';
  dd_due_files text[] := '{}';
  dd_queued_files text[] := '{}';
  dd_files text[] := '{}';
  access_ids uuid[] := '{}';
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(array_agg(user_id), '{}') into unverified
  from (
    select c.user_id
    from public.candidates c
    where c.request_state = 'open'
      and c.email_verified_at is null
      and c.created_at < now() - interval '7 days'
      and not exists (select 1 from public.members m where m.user_id = c.user_id)
      and not exists (select 1 from public.staff_users s where s.user_id = c.user_id)
    order by c.created_at
    limit 500
  ) doomed;

  select coalesce(array_agg(user_id), '{}') into never_submitted
  from (
    select c.user_id
    from public.candidates c
    where c.request_state = 'open'
      and c.email_verified_at is not null
      and c.created_at < now() - interval '120 days'
      and not exists (select 1 from public.members m where m.user_id = c.user_id)
      and not exists (select 1 from public.staff_users s where s.user_id = c.user_id)
    order by c.created_at
    limit 500
  ) doomed;

  select coalesce(array_agg(user_id), '{}') into decided
  from (
    select c.user_id
    from public.candidates c
    where c.request_state in ('declined', 'closed')
      and c.decided_at is not null
      and c.decided_at < now() - interval '12 months'
      and not exists (select 1 from public.members m where m.user_id = c.user_id)
      and not exists (select 1 from public.staff_users s where s.user_id = c.user_id)
    order by c.decided_at
    limit 500
  ) doomed;

  select coalesce(array_agg(user_id), '{}') into reminders
  from (
    select c.user_id
    from public.candidates c
    where c.request_state = 'open'
      and c.email_verified_at is not null
      and c.retention_reminded_at is null
      and c.created_at <= now() - interval '90 days'
      and c.created_at > now() - interval '120 days'
      and not exists (select 1 from public.members m where m.user_id = c.user_id)
    order by c.created_at
    limit 200
  ) due;

  select coalesce(array_agg(id), '{}') into applications
  from (
    select a.id
    from public.applications a
    where a.status in ('rejected', 'declined')
      and a.decision_at is not null
      and a.decision_at < now() - interval '12 months'
      and not exists (select 1 from public.members m where m.application_id = a.id)
    order by a.decision_at
    limit 500
  ) old_apps;

  select coalesce(array_agg(user_id), '{}') into members
  from (
    select m.user_id
    from public.members m
    where m.left_at is not null
      and m.left_at < now() - interval '24 months'
      and m.legal_hold = false
      and m.anonymised_at is null
    order by m.left_at
    limit 500
  ) gone;

  select coalesce(array_agg(id), '{}') into consent_ids
  from (
    select cl.id
    from public.consent_log cl
    where cl.created_at < now() - interval '13 months'
    order by cl.created_at
    limit 2000
  ) old_consent;

  select coalesce(array_agg(c.invite_token_id), '{}') into invites
  from public.candidates c
  where c.user_id = any(unverified)
    and c.invite_token_id is not null
    and c.request_state = 'open'
    and c.email_verified_at is null
    and exists (
      select 1 from public.member_invites i
      where i.id = c.invite_token_id
        and i.status = 'applied'
    );

  select s.retention_days into retention_days
  from public.ai_tool_settings s
  where s.id;
  if retention_days is null or retention_days < 1 then
    retention_days := 30;
  end if;

  select coalesce(array_agg(due.id), '{}'), coalesce(array_agg(due.storage_path), '{}')
    into ai_jobs, ai_due_files
  from (
    select j.id, j.storage_path
    from public.ai_tool_jobs j
    where j.created_at < now() - make_interval(days => retention_days)
    order by j.created_at
    limit 500
  ) due;

  select coalesce(array_agg(q.storage_path), '{}') into ai_queued_files
  from (
    select storage_path
    from public.ai_tool_file_purge
    order by created_at
    limit 500
  ) q;

  select coalesce(array_agg(distinct path), '{}') into ai_files
  from (
    select unnest(coalesce(ai_due_files, '{}'::text[]) || coalesce(ai_queued_files, '{}'::text[])) as path
  ) paths
  where path is not null and path <> '';

  select coalesce(array_agg(due.id), '{}'), coalesce(array_agg(due.storage_path), '{}')
    into dd_decks, dd_due_files
  from (
    select d.id, d.storage_path
    from public.due_diligence_decks d
    where d.created_at < now() - make_interval(days => retention_days)
    order by d.created_at
    limit 500
  ) due;

  select coalesce(array_agg(due.id), '{}') into dd_jobs
  from (
    select j.id
    from public.due_diligence_jobs j
    where j.created_at < now() - make_interval(days => retention_days)
    order by j.created_at
    limit 500
  ) due;

  select coalesce(array_agg(due.id), '{}') into dd_reports
  from (
    select r.id
    from public.due_diligence_reports r
    where r.created_at < now() - make_interval(days => retention_days)
    order by r.created_at
    limit 500
  ) due;

  select coalesce(array_agg(q.storage_path), '{}') into dd_queued_files
  from (
    select storage_path
    from public.due_diligence_file_purge
    order by created_at
    limit 500
  ) q;

  select coalesce(array_agg(distinct path), '{}') into dd_files
  from (
    select unnest(coalesce(dd_due_files, '{}'::text[]) || coalesce(dd_queued_files, '{}'::text[])) as path
  ) paths
  where path is not null and path <> '';

  select coalesce(array_agg(id), '{}') into access_ids
  from (
    select l.id
    from public.staff_access_log l
    where l.created_at < now() - interval '13 months'
    order by l.created_at
    limit 2000
  ) old_access;

  all_ids := unverified || never_submitted || decided;

  select count(*)::int into event_count
  from public.candidate_events e
  where e.candidate_user_id = any(all_ids);

  if to_regclass('public.marketing_stats_cache') is not null then
    execute $cache$
      select count(*)::int from public.marketing_stats_cache
      where created_at < now() - interval '24 hours'
    $cache$ into cache_count;
  end if;

  if p_apply then
    insert into public.ai_tool_file_purge (storage_path)
    select distinct path
    from unnest(coalesce(ai_due_files, '{}'::text[])) as path
    where path is not null and path <> ''
    on conflict (storage_path) do nothing;

    delete from public.ai_tool_outputs where job_id = any(coalesce(ai_jobs, '{}'::uuid[]));
    delete from public.ai_tool_notes where job_id = any(coalesce(ai_jobs, '{}'::uuid[]));
    delete from public.ai_tool_consents where job_id = any(coalesce(ai_jobs, '{}'::uuid[]));
    delete from public.ai_tool_jobs where id = any(coalesce(ai_jobs, '{}'::uuid[]));

    insert into public.due_diligence_file_purge (storage_path)
    select distinct path
    from unnest(coalesce(dd_due_files, '{}'::text[])) as path
    where path is not null and path <> ''
    on conflict (storage_path) do nothing;

    delete from public.due_diligence_reports
    where id = any(coalesce(dd_reports, '{}'::uuid[]))
      or deck_id = any(coalesce(dd_decks, '{}'::uuid[]))
      or job_id = any(coalesce(dd_jobs, '{}'::uuid[]));
    delete from public.due_diligence_jobs
    where id = any(coalesce(dd_jobs, '{}'::uuid[]))
      or deck_id = any(coalesce(dd_decks, '{}'::uuid[]));
    delete from public.due_diligence_decks
    where id = any(coalesce(dd_decks, '{}'::uuid[]));

    delete from public.staff_access_log
    where id = any(coalesce(access_ids, '{}'::uuid[]));

    foreach uid in array unverified loop
      select c.invite_token_id into invite_id
      from public.candidates c
      where c.user_id = uid
        and c.request_state = 'open'
        and c.email_verified_at is null;
      if invite_id is not null and private.return_applied_invite(invite_id) then
        returned_count := returned_count + 1;
      end if;
    end loop;

    insert into public.retention_posthog_queue (analytics_id)
    select distinct c.analytics_id
    from public.candidates c
    where c.user_id = any(all_ids)
      and c.analytics_id is not null
      and position('@' in c.analytics_id) = 0
    on conflict (analytics_id) do nothing;

    delete from public.candidate_events where candidate_user_id = any(all_ids);
    delete from public.candidate_notes where candidate_user_id = any(all_ids);
    delete from auth.users u
    where u.id = any(all_ids)
      and not exists (select 1 from public.members m where m.user_id = u.id)
      and not exists (select 1 from public.staff_users s where s.user_id = u.id);

    delete from public.applications a
    where a.id = any(applications);

    update public.members m
    set email = 'retired+' || m.user_id::text || '@example.com',
        anonymised_at = now()
    where m.user_id = any(members);

    update auth.users u
    set email = 'retired+' || u.id::text || '@example.com',
        raw_user_meta_data = '{}'::jsonb
    where u.id = any(members);

    update public.profiles p
    set full_name = 'Retired member',
        headline = null,
        company = null,
        location = null,
        linkedin_url = null,
        bio = null,
        phone = null,
        investable_capacity_usd = null,
        fo_aum_usd = null,
        turnover_usd = null
    where p.user_id = any(members);

    perform public.purge_expired_consent_log();

    if to_regclass('public.marketing_stats_cache') is not null then
      execute $cache$
        delete from public.marketing_stats_cache
        where created_at < now() - interval '24 hours'
      $cache$;
    end if;
  end if;

  return jsonb_build_object(
    'unverified', to_jsonb(unverified),
    'never_submitted', to_jsonb(never_submitted),
    'decided', to_jsonb(decided),
    'applications', to_jsonb(applications),
    'members', to_jsonb(members),
    'invites', to_jsonb(invites),
    'reminders', to_jsonb(reminders),
    'consent', to_jsonb(consent_ids),
    'events', event_count,
    'cache', cache_count,
    'invites_returned', returned_count,
    'ai_tool_jobs', to_jsonb(ai_jobs),
    'ai_tool_files', to_jsonb(ai_files),
    'ai_tool_retention_days', retention_days,
    'dd_decks', to_jsonb(dd_decks),
    'dd_jobs', to_jsonb(dd_jobs),
    'dd_reports', to_jsonb(dd_reports),
    'dd_files', to_jsonb(dd_files),
    'staff_access_log', to_jsonb(access_ids)
  );
end;
$$;

revoke all on function public.retention_sweep_plan(boolean) from public, anon, authenticated;
grant execute on function public.retention_sweep_plan(boolean) to service_role;

comment on function public.retention_sweep_plan(boolean) is
  'Retention plan. p_apply false lists rows. p_apply true deletes unverified sign-ups at 7 days, confirmed accounts that never submit at 120 days, declined or closed requests and legacy applications at 12 months, anonymises members 24 months after left_at, and purges consent_log and staff_access_log at 13 months. It also queues AI tool files and due diligence decks older than the retention setting and deletes those jobs, outputs, consents, notes, decks, and reports. candidate_events and candidate_notes go with the candidate. Members and staff are not deleted. Decline does not return a peer invite. Storage files are removed by the retention-sweep Edge function.';

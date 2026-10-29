-- Boardroom fields: roles held, open to new seats, expertise.
-- Apply after 20270107120000. Do not apply this file from the app, from CI,
-- or against a live database.
-- No Edge function. No mail.
-- public.re_board_roles is a different table (real estate seats). Do not alter it.
--
-- FW8 can read these lists later. This file does not match seats.
-- profile_board_roles: user_id, organisation, role, org_type, position
-- profile_boardroom: user_id, open_to_seats, seat_types, seat_where, expertise
-- private.board_seat_match_fields(uuid) returns board_seat_type and
-- board_seat_where as text. Both are empty unless open_to_seats is true and
-- that list has a value. The staff list below reads that helper.

create or replace function private.board_role_titles()
returns text[]
language sql
immutable
security definer
set search_path = ''
as $$
  select array[
    'Chair',
    'Vice chair',
    'Independent director',
    'Non-executive director',
    'Committee chair',
    'Adviser'
  ]::text[];
$$;

create or replace function private.board_org_types()
returns text[]
language sql
immutable
security definer
set search_path = ''
as $$
  select array[
    'Listed',
    'Private',
    'Family business',
    'Government or semi-government',
    'Non-profit'
  ]::text[];
$$;

create or replace function private.board_seat_types()
returns text[]
language sql
immutable
security definer
set search_path = ''
as $$
  select array[
    'Chair',
    'Independent director',
    'Non-executive director',
    'Committee: Audit',
    'Committee: Risk',
    'Committee: Nomination and remuneration',
    'Adviser'
  ]::text[];
$$;

create or replace function private.board_seat_where()
returns text[]
language sql
immutable
security definer
set search_path = ''
as $$
  select array[
    'Saudi Arabia',
    'GCC',
    'International'
  ]::text[];
$$;

create or replace function private.board_expertise()
returns text[]
language sql
immutable
security definer
set search_path = ''
as $$
  select array[
    'Governance',
    'Audit and risk',
    'M&A',
    'Capital markets and IPO',
    'Family business and succession',
    'Strategy',
    'Turnaround',
    'Digital and AI',
    'ESG',
    'Regulation and compliance',
    'Islamic finance',
    'Real estate development',
    'People and remuneration'
  ]::text[];
$$;

create or replace function private.board_org_ok(p_text text)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select p_text is not null
    and p_text = pg_catalog.btrim(p_text)
    and pg_catalog.char_length(p_text) between 1 and 120
    and pg_catalog.strpos(p_text, '@') = 0
    and p_text !~ '\+[0-9]'
    and pg_catalog.char_length(pg_catalog.regexp_replace(p_text, '[^0-9]', '', 'g')) < 8;
$$;

create or replace function private.text_list_ok(p_items text[], p_allowed text[], p_max integer)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select p_items is not null
    and p_allowed is not null
    and coalesce(pg_catalog.cardinality(p_items), 0) <= p_max
    and p_items <@ p_allowed
    and (
      select count(*) from pg_catalog.unnest(p_items) as item
    ) = (
      select count(distinct item) from pg_catalog.unnest(p_items) as item
    );
$$;

revoke all on function private.board_role_titles() from public, anon, authenticated, service_role;
revoke all on function private.board_org_types() from public, anon, authenticated, service_role;
revoke all on function private.board_seat_types() from public, anon, authenticated, service_role;
revoke all on function private.board_seat_where() from public, anon, authenticated, service_role;
revoke all on function private.board_expertise() from public, anon, authenticated, service_role;
revoke all on function private.board_org_ok(text) from public, anon, authenticated, service_role;
revoke all on function private.text_list_ok(text[], text[], integer) from public, anon, authenticated, service_role;

create table if not exists public.profile_board_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  organisation text not null,
  role text not null,
  org_type text not null,
  position smallint not null,
  constraint profile_board_roles_position_check check (position between 1 and 5),
  constraint profile_board_roles_user_position unique (user_id, position),
  constraint profile_board_roles_organisation_check check (private.board_org_ok(organisation)),
  constraint profile_board_roles_role_check check (role = any (private.board_role_titles())),
  constraint profile_board_roles_org_type_check check (org_type = any (private.board_org_types()))
);

comment on table public.profile_board_roles is
  'Boards a member sits on. At most 5. Organisation is plain text, at most 120, with no email or phone pattern. Owner writes go through save_my_board_roles.';

create index if not exists profile_board_roles_user_idx
  on public.profile_board_roles (user_id, position);

create table if not exists public.profile_boardroom (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  open_to_seats boolean not null default false,
  seat_types text[] not null default '{}',
  seat_where text[] not null default '{}',
  expertise text[] not null default '{}',
  updated_at timestamptz not null default pg_catalog.now(),
  constraint profile_boardroom_seat_types_check check (
    private.text_list_ok(seat_types, private.board_seat_types(), 7)
  ),
  constraint profile_boardroom_seat_where_check check (
    private.text_list_ok(seat_where, private.board_seat_where(), 3)
  ),
  constraint profile_boardroom_expertise_check check (
    private.text_list_ok(expertise, private.board_expertise(), 5)
  ),
  constraint profile_boardroom_open_check check (
    open_to_seats
    or (
      coalesce(pg_catalog.cardinality(seat_types), 0) = 0
      and coalesce(pg_catalog.cardinality(seat_where), 0) = 0
    )
  )
);

comment on table public.profile_boardroom is
  'Open to new seats, seat types, where, and expertise. Fixed lists. Not now stores no seat types and no where. Owner writes go through save_my_board_focus.';

alter table public.profile_board_roles enable row level security;
alter table public.profile_board_roles force row level security;
alter table public.profile_boardroom enable row level security;
alter table public.profile_boardroom force row level security;

revoke all on table public.profile_board_roles from public, anon, authenticated, service_role;
revoke all on table public.profile_boardroom from public, anon, authenticated, service_role;

create or replace function private.assert_boardroom_owner()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  v_user := auth.uid();
  if v_user is null or private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.members m
    where m.user_id = v_user
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.profiles p
    where p.user_id = v_user
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return v_user;
end;
$$;

revoke all on function private.assert_boardroom_owner() from public, anon, authenticated, service_role;

comment on function private.assert_boardroom_owner() is
  'Caller must be an invited or active member with a profile, and not staff. Staff cannot write boardroom fields.';

create or replace function private.member_boardroom_card(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'board_roles', coalesce(roles.payload, '[]'::jsonb),
    'open_to_board_seats', coalesce(b.open_to_seats, false),
    'seat_types', coalesce(pg_catalog.to_jsonb(b.seat_types), '[]'::jsonb),
    'seat_where', coalesce(pg_catalog.to_jsonb(b.seat_where), '[]'::jsonb),
    'expertise', coalesce(pg_catalog.to_jsonb(b.expertise), '[]'::jsonb)
  )
  from (select p_user as user_id) seed
  left join public.profile_boardroom b on b.user_id = seed.user_id
  left join lateral (
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'role', r.role,
        'org_type', r.org_type,
        'organisation', r.organisation
      )
      order by r.position
    ) as payload
    from public.profile_board_roles r
    where r.user_id = seed.user_id
  ) roles on true;
$$;

create or replace function private.demo_boardroom_card(p_sort integer)
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when p_sort = 1 then pg_catalog.jsonb_build_object(
      'board_roles', pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'role', 'Chair',
          'org_type', 'Private',
          'organisation', 'Example Holdings'
        )
      ),
      'open_to_board_seats', true,
      'seat_types', pg_catalog.jsonb_build_array('Independent director'),
      'seat_where', pg_catalog.jsonb_build_array('Saudi Arabia', 'GCC'),
      'expertise', pg_catalog.jsonb_build_array('Governance', 'Strategy')
    )
    else pg_catalog.jsonb_build_object(
      'board_roles', '[]'::jsonb,
      'open_to_board_seats', false,
      'seat_types', '[]'::jsonb,
      'seat_where', '[]'::jsonb,
      'expertise', '[]'::jsonb
    )
  end;
$$;

create or replace function private.board_seat_match_fields(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_open boolean;
  v_types text[];
  v_where text[];
begin
  select b.open_to_seats, b.seat_types, b.seat_where
    into v_open, v_types, v_where
  from public.profile_boardroom b
  where b.user_id = p_user;

  if not found or coalesce(v_open, false) is not true then
    return pg_catalog.jsonb_build_object('board_seat_type', '', 'board_seat_where', '');
  end if;

  return pg_catalog.jsonb_build_object(
    'board_seat_type', coalesce(v_types[1], ''),
    'board_seat_where', coalesce(v_where[1], '')
  );
end;
$$;

revoke all on function private.member_boardroom_card(uuid) from public, anon, authenticated, service_role;
revoke all on function private.demo_boardroom_card(integer) from public, anon, authenticated, service_role;
revoke all on function private.board_seat_match_fields(uuid) from public, anon, authenticated, service_role;

comment on function private.board_seat_match_fields(uuid) is
  'board_seat_type and board_seat_where for the completeness row and the admin chip. Empty text unless Open is Yes and that list has a value. No contact fields.';

create or replace function private.touch_profile_updated(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set updated_at = pg_catalog.now()
  where user_id = p_user;
end;
$$;

revoke all on function private.touch_profile_updated(uuid) from public, anon, authenticated, service_role;

create or replace function public.get_my_boardroom()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_region text;
  v_board text;
  v_reviewed text[];
  v_card jsonb;
begin
  v_user := private.assert_boardroom_owner();

  select a.region, a.board_seats, a.reviewed_fields
    into v_region, v_board, v_reviewed
  from public.member_application_answers a
  where a.member_id = v_user;

  v_reviewed := coalesce(v_reviewed, '{}'::text[]);
  if v_region is not null and 'region' = any (v_reviewed) then
    v_region := null;
  end if;
  if v_region is not null and v_region not in ('ksa_gcc', 'intl') then
    v_region := null;
  end if;
  if v_board is not null and 'board_seats' = any (v_reviewed) then
    v_board := null;
  end if;
  v_board := nullif(pg_catalog.btrim(coalesce(v_board, '')), '');
  v_card := private.member_boardroom_card(v_user);

  return v_card || pg_catalog.jsonb_build_object(
    'roles', coalesce(v_card -> 'board_roles', '[]'::jsonb),
    'open_to_seats', coalesce((v_card ->> 'open_to_board_seats')::boolean, false),
    'application_region', v_region,
    'application_board_seats', v_board
  );
end;
$$;

revoke all on function public.get_my_boardroom() from public, anon;
grant execute on function public.get_my_boardroom() to authenticated;

comment on function public.get_my_boardroom() is
  'Caller board roles, open seats, expertise, and unread application region and board seats text. Not anon. Not staff.';

create or replace function public.save_my_board_roles(p_roles jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_item jsonb;
  v_org text;
  v_role text;
  v_type text;
  v_clean jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  v_user := private.assert_boardroom_owner();
  if p_roles is null or pg_catalog.jsonb_typeof(p_roles) <> 'array' then
    raise exception 'boardroom_invalid' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(p_roles) > 5 then
    raise exception 'boardroom_limit' using errcode = '22023';
  end if;

  for v_item in
    select value from pg_catalog.jsonb_array_elements(p_roles)
  loop
    if pg_catalog.jsonb_typeof(v_item) <> 'object' then
      raise exception 'boardroom_invalid' using errcode = '22023';
    end if;
    v_org := pg_catalog.btrim(coalesce(v_item ->> 'organisation', ''));
    v_role := pg_catalog.btrim(coalesce(v_item ->> 'role', ''));
    v_type := pg_catalog.btrim(coalesce(v_item ->> 'org_type', ''));
    if pg_catalog.strpos(v_org, '@') > 0
       or v_org ~ '\+[0-9]'
       or pg_catalog.char_length(pg_catalog.regexp_replace(v_org, '[^0-9]', '', 'g')) >= 8
    then
      raise exception 'boardroom_contact' using errcode = '23514';
    end if;
    if not private.board_org_ok(v_org)
       or v_role <> all (private.board_role_titles())
       or v_type <> all (private.board_org_types())
    then
      raise exception 'boardroom_invalid' using errcode = '22023';
    end if;
    v_clean := v_clean || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('organisation', v_org, 'role', v_role, 'org_type', v_type)
    );
    v_count := v_count + 1;
  end loop;

  delete from public.profile_board_roles where user_id = v_user;
  insert into public.profile_board_roles (user_id, organisation, role, org_type, position)
  select v_user,
    item ->> 'organisation',
    item ->> 'role',
    item ->> 'org_type',
    ord::smallint
  from pg_catalog.jsonb_array_elements(v_clean) with ordinality as listed(item, ord);
  perform private.touch_profile_updated(v_user);
  return pg_catalog.jsonb_build_object('ok', true, 'count', v_count);
end;
$$;

revoke all on function public.save_my_board_roles(jsonb) from public, anon;
grant execute on function public.save_my_board_roles(jsonb) to authenticated;

comment on function public.save_my_board_roles(jsonb) is
  'Replaces the caller board roles. At most 5. Rejects email and phone patterns. Staff and other members cannot write.';

create or replace function public.save_my_board_focus(
  p_open boolean,
  p_seat_types text[],
  p_seat_where text[],
  p_expertise text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_open boolean;
  v_types text[];
  v_where text[];
  v_expertise text[];
begin
  v_user := private.assert_boardroom_owner();
  v_open := coalesce(p_open, false);
  v_types := coalesce(p_seat_types, '{}'::text[]);
  v_where := coalesce(p_seat_where, '{}'::text[]);
  v_expertise := coalesce(p_expertise, '{}'::text[]);
  if not v_open then
    v_types := '{}'::text[];
    v_where := '{}'::text[];
  end if;
  if coalesce(pg_catalog.cardinality(v_expertise), 0) > 5
     or coalesce(pg_catalog.cardinality(v_types), 0) > 7
     or coalesce(pg_catalog.cardinality(v_where), 0) > 3
  then
    raise exception 'boardroom_limit' using errcode = '22023';
  end if;
  if not private.text_list_ok(v_types, private.board_seat_types(), 7)
     or not private.text_list_ok(v_where, private.board_seat_where(), 3)
     or not private.text_list_ok(v_expertise, private.board_expertise(), 5)
  then
    raise exception 'boardroom_invalid' using errcode = '22023';
  end if;

  insert into public.profile_boardroom (
    user_id, open_to_seats, seat_types, seat_where, expertise, updated_at
  ) values (
    v_user, v_open, v_types, v_where, v_expertise, pg_catalog.now()
  )
  on conflict (user_id) do update
  set open_to_seats = excluded.open_to_seats,
      seat_types = excluded.seat_types,
      seat_where = excluded.seat_where,
      expertise = excluded.expertise,
      updated_at = excluded.updated_at;
  perform private.touch_profile_updated(v_user);
  return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.save_my_board_focus(boolean, text[], text[], text[]) from public, anon;
grant execute on function public.save_my_board_focus(boolean, text[], text[], text[]) to authenticated;

comment on function public.save_my_board_focus(boolean, text[], text[], text[]) is
  'Saves open to seats, seat types, where, and expertise for the caller. Not now clears seat types and where. Staff cannot write.';

create or replace function public.list_directory()
returns pg_catalog.jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  real_n pg_catalog.int4;
  show_demo pg_catalog.bool;
begin
  if not private.can_read_member_room() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select pg_catalog.count(*)::pg_catalog.int4 into real_n
  from public.members m
  where m.is_demo = false
    and m.status in ('invited', 'active')
    and m.seat in ('ksa', 'intl')
    and (coalesce(m.directory_hidden, false) = false or m.user_id = auth.uid());

  show_demo := private.demo_rows_visible('directory', real_n);
  if private.is_sponsor(auth.uid()) and not private.is_staff() then
    show_demo := false;
  end if;

  return coalesce((
    select pg_catalog.jsonb_agg(payload order by demo_flag, sort_order, sort_name)
    from (
      select
        false as demo_flag,
        0 as sort_order,
        pg_catalog.lower(coalesce(p.full_name, '')) as sort_name,
        pg_catalog.jsonb_build_object(
          'id', m.user_id,
          'is_demo', false,
          'full_name', coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'Member'),
          'headline', coalesce(p.headline, ''),
          'company', coalesce(p.company, ''),
          'location', coalesce(p.location, ''),
          'city_key', coalesce(nullif(pg_catalog.btrim(coalesce(p.city_key, '')), ''), private.city_key_from_location(p.location), ''),
          'about', pg_catalog.left(coalesce(p.bio, ''), 400),
          'sector', coalesce(p.sector_tags[1], ''),
          'sectors', coalesce(pg_catalog.to_jsonb(p.sector_tags), '[]'::pg_catalog.jsonb),
          'vision_themes', coalesce(pg_catalog.to_jsonb(p.vision_themes), '[]'::pg_catalog.jsonb),
          'availability', p.availability,
          'seat', m.seat,
          'preferred_partner', private.is_sponsor(m.user_id),
          'portrait_asset', null,
          'avatar_path', p.avatar_path,
          'avatar_style', coalesce(p.avatar_style, 'male'),
          'membership_status', m.status
        ) || private.member_boardroom_card(m.user_id) as payload
      from public.members m
      join public.profiles p on p.user_id = m.user_id
      where m.is_demo = false
        and m.status in ('invited', 'active')
        and m.seat in ('ksa', 'intl', 'sponsor')
        and (coalesce(m.directory_hidden, false) = false or m.user_id = auth.uid())
        and private.caller_sees_member_card(m.user_id)
      union all
      select
        true,
        d.sort_order,
        pg_catalog.lower(d.full_name),
        pg_catalog.jsonb_build_object(
          'id', d.id,
          'is_demo', true,
          'full_name', d.full_name,
          'headline', d.headline,
          'company', d.company,
          'location', d.location,
          'city_key', coalesce(private.city_key_from_location(d.location), ''),
          'about', case
            when d.sort_order = 1 then 'Example. Independent chair across family holdings.'
            else ''
          end,
          'sector', d.sector,
          'sectors', pg_catalog.jsonb_build_array(d.sector),
          'vision_themes', coalesce(pg_catalog.to_jsonb(d.vision_themes), '[]'::pg_catalog.jsonb),
          'availability', d.availability,
          'seat', d.seat,
          'preferred_partner', false,
          'portrait_asset', d.portrait_asset,
          'avatar_path', null,
          'avatar_style', 'male',
          'membership_status', null
        ) || private.demo_boardroom_card(d.sort_order)
      from public.directory_entries d
      where d.is_demo
        and show_demo
    ) listed
  ), '[]'::pg_catalog.jsonb);
end;
$$;

revoke all on function public.list_directory() from public, anon;
grant execute on function public.list_directory() to authenticated;

comment on function public.list_directory() is
  'Directory cards for a permitted viewer. Boardroom fields use the same hidden and partner rules. No email, phone, or turnover.';

-- Same staff list as 20270107120000, with the two board seat keys filled.
-- Empty text means the chip is off. Help and looking for stay null for PF-7.

create or replace function public.staff_list_profiles()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return coalesce((
    select pg_catalog.jsonb_agg(q.row_json order by q.updated_at desc nulls last, q.display_name asc)
    from (
      select
        pg_catalog.jsonb_build_object(
          'member_id', m.user_id,
          'display_name', coalesce(nullif(pg_catalog.btrim(p.full_name), ''::text), 'Name not set'),
          'seat_label', case m.seat
            when 'ksa' then 'Saudi Arabia'
            when 'intl' then 'International'
            when 'sponsor' then 'Partner'
            else 'Unknown seat'
          end,
          'status', m.status,
          'has_photo', coalesce(pg_catalog.btrim(p.avatar_path), ''::text) <> ''::text,
          'title', nullif(pg_catalog.btrim(p.headline), ''::text),
          'organisation', nullif(pg_catalog.btrim(p.company), ''::text),
          'city_key', nullif(pg_catalog.btrim(p.city_key), ''::text),
          'sector_count', coalesce(pg_catalog.cardinality(p.sector_tags), 0),
          'availability_set', coalesce(pg_catalog.btrim(p.availability), ''::text) <> ''::text,
          'theme_count', coalesce(pg_catalog.cardinality(p.vision_themes), 0),
          'profile_updated_at', p.updated_at,
          'open_suggestion', null::text,
          'open_request', null::text,
          'help_with', null::text,
          'looking_for', null::text,
          'board_seat_type', coalesce(private.board_seat_match_fields(m.user_id) ->> 'board_seat_type', ''),
          'board_seat_where', coalesce(private.board_seat_match_fields(m.user_id) ->> 'board_seat_where', '')
        ) as row_json,
        p.updated_at,
        coalesce(nullif(pg_catalog.btrim(p.full_name), ''::text), 'Name not set') as display_name
      from public.members m
      left join public.profiles p on p.user_id = m.user_id
      where m.status in ('invited', 'active', 'suspended')
        and m.is_demo = false
        and m.anonymised_at is null
        and not private.sample_subject(m.user_id)
        and not exists (
          select 1
          from public.staff_users s
          where s.user_id = m.user_id
        )
    ) q
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_list_profiles() from public, anon;
grant execute on function public.staff_list_profiles() to authenticated;

comment on function public.staff_list_profiles() is
  'Admin list of member profile status. Board seat match text comes from private.board_seat_match_fields. No email, phone, or other contact fields. The list read is not logged.';

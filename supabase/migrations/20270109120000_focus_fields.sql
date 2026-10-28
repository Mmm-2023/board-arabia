-- Focus fields: can help with, looking for, languages, and the one-line texts.
-- Apply after 20270108120000. Do not apply this file from the app, from CI,
-- or against a live database.
-- No new table. profiles already has row security enabled and forced.
-- Owner writes stay on profiles_update_own (user_id = auth.uid()).
-- This file does not replace that policy and does not grant anon.
-- Free-text lines are stored for the card only. They are not match keys.
-- list_directory returns chips and lines to a permitted viewer, with the
-- same hidden and partner rules as 20270108120000.

create or replace function private.focus_can_help()
returns text[]
language sql
immutable
security definer
set search_path = ''
as $$
  select array[
    'Board experience',
    'Co-investment',
    'Deal introductions',
    'Market entry into Saudi Arabia',
    'GCC partners',
    'Family office peers',
    'Talent and executives',
    'Government and regulatory know-how'
  ]::text[];
$$;

create or replace function private.focus_looking_for()
returns text[]
language sql
immutable
security definer
set search_path = ''
as $$
  select array[
    'Board seat',
    'Co-investors',
    'Deal flow',
    'Advisers',
    'Capital for my company',
    'Partners in a sector',
    'Peers to compare notes'
  ]::text[];
$$;

create or replace function private.focus_languages()
returns text[]
language sql
immutable
security definer
set search_path = ''
as $$
  select array[
    'Arabic',
    'English',
    'French',
    'Urdu',
    'Hindi',
    'Other'
  ]::text[];
$$;

create or replace function private.focus_line_ok(p_text text)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select p_text is null
    or (
      p_text = pg_catalog.btrim(p_text)
      and pg_catalog.char_length(p_text) between 1 and 140
      and pg_catalog.strpos(p_text, '@') = 0
      and not exists (
        select 1
        from pg_catalog.regexp_matches(
          p_text,
          '\+?[0-9][0-9[:space:]().-]{6,}',
          'g'
        ) as hit(piece)
        where pg_catalog.char_length(pg_catalog.regexp_replace(hit.piece[1], '[^0-9]', '', 'g')) >= 8
      )
    );
$$;

revoke all on function private.focus_can_help() from public, anon, authenticated, service_role;
revoke all on function private.focus_looking_for() from public, anon, authenticated, service_role;
revoke all on function private.focus_languages() from public, anon, authenticated, service_role;
revoke all on function private.focus_line_ok(text) from public, anon, authenticated, service_role;

alter table public.profiles
  add column if not exists can_help_with text[] not null default '{}',
  add column if not exists can_help_line text,
  add column if not exists looking_for text[] not null default '{}',
  add column if not exists looking_for_line text,
  add column if not exists languages text[] not null default '{}';

alter table public.profiles drop constraint if exists profiles_can_help_ok;
alter table public.profiles
  add constraint profiles_can_help_ok
  check (private.text_list_ok(can_help_with, private.focus_can_help(), 3));

alter table public.profiles drop constraint if exists profiles_looking_for_ok;
alter table public.profiles
  add constraint profiles_looking_for_ok
  check (private.text_list_ok(looking_for, private.focus_looking_for(), 3));

alter table public.profiles drop constraint if exists profiles_languages_ok;
alter table public.profiles
  add constraint profiles_languages_ok
  check (private.text_list_ok(languages, private.focus_languages(), 6));

alter table public.profiles drop constraint if exists profiles_can_help_line_ok;
alter table public.profiles
  add constraint profiles_can_help_line_ok
  check (private.focus_line_ok(can_help_line));

alter table public.profiles drop constraint if exists profiles_looking_for_line_ok;
alter table public.profiles
  add constraint profiles_looking_for_line_ok
  check (private.focus_line_ok(looking_for_line));

comment on column public.profiles.can_help_with is
  'Up to 3 chips from private.focus_can_help(). Not free text.';
comment on column public.profiles.looking_for is
  'Up to 3 chips from private.focus_looking_for(). Not free text.';
comment on column public.profiles.languages is
  'Languages the member works in. Fixed list. Not used for matching.';
comment on column public.profiles.can_help_line is
  'Optional line, at most 140 characters. No email or phone pattern. Not a match key.';
comment on column public.profiles.looking_for_line is
  'Optional line, at most 140 characters. No email or phone pattern. Not a match key.';

grant select (can_help_with, can_help_line, looking_for, looking_for_line, languages)
  on table public.profiles to authenticated;
grant select (can_help_with, looking_for)
  on table public.profiles to service_role;

create or replace function private.assert_focus_owner()
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

revoke all on function private.assert_focus_owner() from public, anon, authenticated, service_role;

comment on function private.assert_focus_owner() is
  'Caller must be an invited or active member with a profile, and not staff.';

create or replace function public.save_my_focus(
  p_can_help text[],
  p_can_help_line text,
  p_looking_for text[],
  p_looking_for_line text,
  p_languages text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_help text[];
  v_looking text[];
  v_languages text[];
  v_help_line text;
  v_looking_line text;
begin
  v_user := private.assert_focus_owner();
  v_help := coalesce(p_can_help, '{}'::text[]);
  v_looking := coalesce(p_looking_for, '{}'::text[]);
  v_languages := coalesce(p_languages, '{}'::text[]);
  v_help_line := nullif(pg_catalog.btrim(coalesce(p_can_help_line, '')), '');
  v_looking_line := nullif(pg_catalog.btrim(coalesce(p_looking_for_line, '')), '');
  if coalesce(pg_catalog.cardinality(v_help), 0) > 3
     or coalesce(pg_catalog.cardinality(v_looking), 0) > 3
     or coalesce(pg_catalog.cardinality(v_languages), 0) > 6
  then
    raise exception 'focus_limit' using errcode = '22023';
  end if;
  if not private.text_list_ok(v_help, private.focus_can_help(), 3)
     or not private.text_list_ok(v_looking, private.focus_looking_for(), 3)
     or not private.text_list_ok(v_languages, private.focus_languages(), 6)
  then
    raise exception 'focus_invalid' using errcode = '22023';
  end if;
  if not private.focus_line_ok(v_help_line) or not private.focus_line_ok(v_looking_line) then
    raise exception 'focus_contact' using errcode = '23514';
  end if;

  update public.profiles
  set can_help_with = v_help,
      can_help_line = v_help_line,
      looking_for = v_looking,
      looking_for_line = v_looking_line,
      languages = v_languages
  where user_id = v_user;
  return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.save_my_focus(text[], text, text[], text, text[]) from public, anon;
grant execute on function public.save_my_focus(text[], text, text[], text, text[]) to authenticated;

comment on function public.save_my_focus(text[], text, text[], text, text[]) is
  'Saves the caller focus chips and optional lines. Staff and other members cannot write. Lines are not match keys.';

create or replace function private.member_focus_card(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'can_help_with', coalesce(pg_catalog.to_jsonb(p.can_help_with), '[]'::jsonb),
    'looking_for', coalesce(pg_catalog.to_jsonb(p.looking_for), '[]'::jsonb),
    'can_help_line', coalesce(p.can_help_line, ''),
    'looking_for_line', coalesce(p.looking_for_line, ''),
    'languages', coalesce(pg_catalog.to_jsonb(p.languages), '[]'::jsonb)
  )
  from (select p_user as user_id) seed
  left join public.profiles p on p.user_id = seed.user_id;
$$;

create or replace function private.demo_focus_card(p_sort integer)
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when p_sort = 1 then pg_catalog.jsonb_build_object(
      'can_help_with', pg_catalog.jsonb_build_array('Deal introductions', 'Board experience'),
      'looking_for', pg_catalog.jsonb_build_array('Board seat'),
      'can_help_line', 'Example. Introductions to operators in this sector.',
      'looking_for_line', 'Example. A board seat with a family company.',
      'languages', pg_catalog.jsonb_build_array('English', 'Arabic')
    )
    else pg_catalog.jsonb_build_object(
      'can_help_with', '[]'::jsonb,
      'looking_for', '[]'::jsonb,
      'can_help_line', '',
      'looking_for_line', '',
      'languages', '[]'::jsonb
    )
  end;
$$;

revoke all on function private.member_focus_card(uuid) from public, anon, authenticated, service_role;
revoke all on function private.demo_focus_card(integer) from public, anon, authenticated, service_role;

comment on function private.member_focus_card(uuid) is
  'Focus chips and lines for one member. No contact fields.';

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
        ) || private.member_boardroom_card(m.user_id) || private.member_focus_card(m.user_id) as payload
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
        ) || private.demo_boardroom_card(d.sort_order) || private.demo_focus_card(d.sort_order)
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
  'Directory cards for a permitted viewer. Focus chips and lines use the same hidden and partner rules. No email, phone, or turnover.';

-- First chip only. Lines stay off this list.

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
          'help_with', nullif(p.can_help_with[1], ''),
          'looking_for', nullif(p.looking_for[1], ''),
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
  'Admin list of member profile status. help_with and looking_for are the first chip, or null. Lines are not included. No email, phone, or other contact fields. The list read is not logged.';

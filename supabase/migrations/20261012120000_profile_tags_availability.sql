-- Profile availability and tags for the directory.
-- Members still update only their own profile row. profiles_update_own
-- already requires user_id = auth.uid(). This migration does not replace it.
-- Column grants are what let that same member read and write the new fields.
-- Example directory rows gain availability and Vision 2030 themes so filters
-- have something to match. No rows are deleted.

create or replace function private.profile_tags_allowed(tags text[], allowed text[], max_n integer)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    tags is not null
    and max_n >= 0
    and cardinality(tags) <= max_n
    and tags <@ allowed
    and cardinality(tags) = (
      select count(*)
      from unnest(tags) as item
      where item is not null and char_length(btrim(item)) > 0
    )
    and cardinality(tags) = (
      select count(distinct item)
      from unnest(tags) as item
    );
$$;

revoke all on function private.profile_tags_allowed(text[], text[], integer) from public, anon;
grant execute on function private.profile_tags_allowed(text[], text[], integer) to authenticated, service_role;

create or replace function private.profile_sector_tags()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'Energy transition',
    'Health',
    'Tourism',
    'Financial services',
    'Logistics',
    'Mining',
    'Digital infrastructure',
    'Food security'
  ]::text[];
$$;

revoke all on function private.profile_sector_tags() from public, anon;
grant execute on function private.profile_sector_tags() to authenticated, service_role;

create or replace function private.profile_vision_themes()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'Vibrant society',
    'Thriving economy',
    'Ambitious nation',
    'Quality of life',
    'Health transformation',
    'Housing',
    'Financial sector development',
    'Industrial development and logistics',
    'Renewable energy',
    'Tourism',
    'Food security',
    'Localization'
  ]::text[];
$$;

revoke all on function private.profile_vision_themes() from public, anon;
grant execute on function private.profile_vision_themes() to authenticated, service_role;

alter table public.profiles
  add column if not exists availability text,
  add column if not exists sector_tags text[] not null default '{}',
  add column if not exists vision_themes text[] not null default '{}';

alter table public.profiles drop constraint if exists profiles_availability_check;
alter table public.profiles
  add constraint profiles_availability_check
  check (availability is null or availability in ('open', 'selective', 'at_capacity'));

alter table public.profiles drop constraint if exists profiles_sector_tags_ok;
alter table public.profiles
  add constraint profiles_sector_tags_ok
  check (private.profile_tags_allowed(sector_tags, private.profile_sector_tags(), 3));

alter table public.profiles drop constraint if exists profiles_vision_themes_ok;
alter table public.profiles
  add constraint profiles_vision_themes_ok
  check (private.profile_tags_allowed(vision_themes, private.profile_vision_themes(), 3));

grant select (availability, sector_tags, vision_themes)
  on table public.profiles to authenticated;

grant update (availability, sector_tags, vision_themes)
  on table public.profiles to authenticated;

alter table public.directory_entries
  add column if not exists availability text,
  add column if not exists vision_themes text[] not null default '{}';

alter table public.directory_entries drop constraint if exists directory_entries_availability_check;
alter table public.directory_entries
  add constraint directory_entries_availability_check
  check (availability is null or availability in ('open', 'selective', 'at_capacity'));

alter table public.directory_entries drop constraint if exists directory_entries_vision_themes_ok;
alter table public.directory_entries
  add constraint directory_entries_vision_themes_ok
  check (private.profile_tags_allowed(vision_themes, private.profile_vision_themes(), 3));

update public.directory_entries
set availability = 'open',
    vision_themes = array['Renewable energy', 'Thriving economy']
where id = 'a1000001-0000-4000-8000-000000000001';

update public.directory_entries
set availability = 'selective',
    vision_themes = array['Health transformation']
where id = 'a1000001-0000-4000-8000-000000000002';

update public.directory_entries
set availability = 'open',
    vision_themes = array['Quality of life']
where id = 'a1000001-0000-4000-8000-000000000003';

update public.directory_entries
set availability = 'at_capacity',
    vision_themes = array['Financial sector development']
where id = 'a1000001-0000-4000-8000-000000000004';

update public.directory_entries
set availability = 'selective',
    vision_themes = array['Industrial development and logistics']
where id = 'a1000001-0000-4000-8000-000000000005';

update public.directory_entries
set availability = 'open',
    vision_themes = array['Thriving economy']
where id = 'a1000001-0000-4000-8000-000000000006';

update public.directory_entries
set availability = 'selective',
    vision_themes = array['Localization']
where id = 'a1000001-0000-4000-8000-000000000007';

update public.directory_entries
set availability = 'at_capacity',
    vision_themes = array['Food security']
where id = 'a1000001-0000-4000-8000-000000000008';

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
    and m.seat in ('ksa', 'intl');

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
          'portrait_asset', null,
          'avatar_path', p.avatar_path
        ) as payload
      from public.members m
      join public.profiles p on p.user_id = m.user_id
      where m.is_demo = false
        and m.status in ('invited', 'active')
        and m.seat in ('ksa', 'intl')
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
          'portrait_asset', d.portrait_asset,
          'avatar_path', null
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

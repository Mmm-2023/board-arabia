-- Sectors, city picklist, and About on the directory card.
-- Apply this file only, and only after 20261209120000.
-- Do not apply it from the app, from CI, or against a live database from this PR.
-- No new table. profiles already has row security enabled and forced.
--
-- Sector list grows in private.profile_sector_tags(). Profiles, mandates, and
-- the application checklist read that list. Max 3 stays.
--
-- city_key is a fixed key or other. location stays the display text.
-- Existing location text is mapped generically: trim, lower case, first comma
-- part, then aliases. Unmatched values become other and keep their text.
-- A known city is stored as the picklist label. No row-specific update.
--
-- About is profiles.bio, at most 400 characters. The new check is NOT VALID
-- so apply does not scan old rows. Validate it after a count. See the handoff.
--
-- list_directory keeps the directory_hidden and partner opt-in rules from
-- 20261207120000. About is only inside that same payload.

create or replace function private.profile_sector_tags()
returns pg_catalog.text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'Energy transition',
    'Health',
    'Tourism',
    'Financial services',
    'Logistics',
    'Mining',
    'Digital infrastructure',
    'Food security',
    'Real estate',
    'Industrials and manufacturing',
    'Technology and telecom',
    'Consumer and retail',
    'Construction and infrastructure',
    'Education',
    'Media and entertainment',
    'Utilities and water'
  ]::pg_catalog.text[];
$$;

revoke all on function private.profile_sector_tags() from public, anon;
grant execute on function private.profile_sector_tags() to authenticated, service_role;

create or replace function private.city_key_from_location(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case token
    when 'riyadh' then 'riyadh'
    when 'riaydh' then 'riyadh'
    when 'jeddah' then 'jeddah'
    when 'jiddah' then 'jeddah'
    when 'jidda' then 'jeddah'
    when 'dammam' then 'dammam_khobar'
    when 'khobar' then 'dammam_khobar'
    when 'al khobar' then 'dammam_khobar'
    when 'dammam and khobar' then 'dammam_khobar'
    when 'makkah' then 'makkah'
    when 'mecca' then 'makkah'
    when 'makka' then 'makkah'
    when 'madinah' then 'madinah'
    when 'medina' then 'madinah'
    when 'madina' then 'madinah'
    when 'al madinah' then 'madinah'
    when 'dubai' then 'dubai'
    when 'abu dhabi' then 'abu_dhabi'
    when 'doha' then 'doha'
    when 'kuwait' then 'kuwait_city'
    when 'kuwait city' then 'kuwait_city'
    when 'manama' then 'manama'
    when 'muscat' then 'muscat'
    when 'masqat' then 'muscat'
    when 'london' then 'london'
    else 'other'
  end
  from (
    select pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        pg_catalog.lower(pg_catalog.btrim(pg_catalog.split_part(pg_catalog.btrim(coalesce(raw, '')), ',', 1))),
        '[-]+',
        ' ',
        'g'
      ),
      '[[:space:]]+',
      ' ',
      'g'
    ) as token
  ) parsed
  where token <> '';
$$;

revoke all on function private.city_key_from_location(text) from public, anon, authenticated;

create or replace function private.city_label(p_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_key
    when 'riyadh' then 'Riyadh'
    when 'jeddah' then 'Jeddah'
    when 'dammam_khobar' then 'Dammam and Khobar'
    when 'makkah' then 'Makkah'
    when 'madinah' then 'Madinah'
    when 'dubai' then 'Dubai'
    when 'abu_dhabi' then 'Abu Dhabi'
    when 'doha' then 'Doha'
    when 'kuwait_city' then 'Kuwait City'
    when 'manama' then 'Manama'
    when 'muscat' then 'Muscat'
    when 'london' then 'London'
    when 'other' then 'Other'
    else ''
  end;
$$;

revoke all on function private.city_label(text) from public, anon, authenticated;

alter table public.profiles
  add column if not exists city_key text;

alter table public.profiles drop constraint if exists profiles_city_key_check;
alter table public.profiles
  add constraint profiles_city_key_check
  check (
    city_key is null
    or city_key in (
      'riyadh',
      'jeddah',
      'dammam_khobar',
      'makkah',
      'madinah',
      'dubai',
      'abu_dhabi',
      'doha',
      'kuwait_city',
      'manama',
      'muscat',
      'london',
      'other'
    )
  );

create or replace function private.profiles_set_city_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.city_key := private.city_key_from_location(new.location);
  return new;
end;
$$;

revoke all on function private.profiles_set_city_key() from public, anon, authenticated;

comment on function private.profiles_set_city_key() is
  'Sets city_key from location on the row being written. Not callable by anon.';

drop trigger if exists profiles_set_city_key on public.profiles;
create trigger profiles_set_city_key
  before insert or update of location on public.profiles
  for each row
  execute function private.profiles_set_city_key();

update public.profiles
set location = case
  when private.city_key_from_location(location) is null then location
  when private.city_key_from_location(location) = 'other' then pg_catalog.btrim(location)
  else private.city_label(private.city_key_from_location(location))
end
where location is not null
  and pg_catalog.btrim(location) <> '';

grant select (city_key) on table public.profiles to authenticated;
grant update (location, city_key) on table public.profiles to authenticated;

alter table public.profiles drop constraint if exists profiles_bio_max_400;
alter table public.profiles
  add constraint profiles_bio_max_400
  check (bio is null or pg_catalog.char_length(bio) <= 400)
  not valid;

comment on constraint profiles_bio_max_400 on public.profiles is
  'About is 400 characters. NOT VALID so existing rows are not scanned at apply.';

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
        ) as payload
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
        )
      from public.directory_entries d
      where d.is_demo
        and show_demo
    ) listed
  ), '[]'::pg_catalog.jsonb);
end;
$$;

revoke all on function public.list_directory() from public, anon;
grant execute on function public.list_directory() to authenticated;

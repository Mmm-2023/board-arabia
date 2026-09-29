-- Sponsor area (W2-C). Prices and entitlements live in sponsor_packages.
-- Seed rows are placeholders. Staff replace them in Settings. Re-running this
-- file does not overwrite a package a staff member has already saved.
-- Sponsors read their own desk through sponsor_desk(). They do not gain
-- select on member rows, profiles, or intro targets.
-- Presented by stays a public label (sponsor_label, already on the majlis
-- views) plus presented_by_member_id, which those views do not expose.

alter table public.majlis_events
  add column if not exists presented_by_member_id uuid;

alter table public.majlis_events
  drop constraint if exists majlis_events_presented_by_member_fkey;

alter table public.majlis_events
  add constraint majlis_events_presented_by_member_fkey
  foreign key (presented_by_member_id) references public.members (user_id) on delete set null;

create index if not exists majlis_events_presented_by_idx
  on public.majlis_events (presented_by_member_id);

create table if not exists public.sponsor_packages (
  slug text primary key,
  name text not null,
  price_label text not null,
  majlis_slots integer not null,
  intro_credits integer not null,
  room_credits integer not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  is_placeholder boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.sponsor_packages drop constraint if exists sponsor_packages_slug_check;
alter table public.sponsor_packages
  add constraint sponsor_packages_slug_check
  check (slug ~ '^[a-z0-9_]{2,40}$');

alter table public.sponsor_packages drop constraint if exists sponsor_packages_name_len;
alter table public.sponsor_packages
  add constraint sponsor_packages_name_len
  check (char_length(trim(name)) between 1 and 80 and position('@' in name) = 0);

alter table public.sponsor_packages drop constraint if exists sponsor_packages_price_len;
alter table public.sponsor_packages
  add constraint sponsor_packages_price_len
  check (char_length(trim(price_label)) between 1 and 80 and position('@' in price_label) = 0);

alter table public.sponsor_packages drop constraint if exists sponsor_packages_slots;
alter table public.sponsor_packages
  add constraint sponsor_packages_slots
  check (majlis_slots between 0 and 24);

alter table public.sponsor_packages drop constraint if exists sponsor_packages_intro_credits;
alter table public.sponsor_packages
  add constraint sponsor_packages_intro_credits
  check (intro_credits between 0 and 500);

alter table public.sponsor_packages drop constraint if exists sponsor_packages_room_credits;
alter table public.sponsor_packages
  add constraint sponsor_packages_room_credits
  check (room_credits between 0 and 500);

create table if not exists public.sponsor_seat_packages (
  member_id uuid primary key references public.members (user_id) on delete cascade,
  package_slug text not null references public.sponsor_packages (slug),
  updated_at timestamptz not null default now()
);

alter table public.sponsor_packages enable row level security;
alter table public.sponsor_packages force row level security;
revoke all on table public.sponsor_packages from public, anon, authenticated;

alter table public.sponsor_seat_packages enable row level security;
alter table public.sponsor_seat_packages force row level security;
revoke all on table public.sponsor_seat_packages from public, anon, authenticated;

-- Entitlement counts below are placeholders, not a price lock.
insert into public.sponsor_packages (
  slug, name, price_label, majlis_slots, intro_credits, room_credits, sort_order, active, is_placeholder
) values
  ('placeholder_a', 'Placeholder package A', 'Placeholder', 1, 2, 0, 1, true, true),
  ('placeholder_b', 'Placeholder package B', 'Placeholder', 2, 4, 1, 2, true, true),
  ('placeholder_c', 'Placeholder package C', 'Placeholder', 4, 8, 2, 3, true, true)
on conflict (slug) do nothing;

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
          'preferred_partner', (m.seat = 'sponsor'),
          'portrait_asset', null,
          'avatar_path', p.avatar_path
        ) as payload
      from public.members m
      join public.profiles p on p.user_id = m.user_id
      where m.is_demo = false
        and m.status in ('invited', 'active')
        and m.seat in ('ksa', 'intl', 'sponsor')
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

create or replace function public.sponsor_desk()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_slug text;
  v_name text;
  v_price text;
  v_placeholder boolean;
  v_slots integer;
  v_intro integer;
  v_room_credits integer;
  v_cat text;
  v_cat_name text;
  v_used integer := 0;
  v_events jsonb := '[]'::jsonb;
  v_approved integer := 0;
  v_pending integer := 0;
  v_declined integer := 0;
  v_rooms integer := 0;
begin
  if v_uid is null or not exists (
    select 1
    from public.members m
    where m.user_id = v_uid
      and m.seat = 'sponsor'
      and m.status in ('invited', 'active')
      and m.is_demo = false
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select
    p.slug, p.name, p.price_label, p.is_placeholder, p.majlis_slots, p.intro_credits, p.room_credits
  into v_slug, v_name, v_price, v_placeholder, v_slots, v_intro, v_room_credits
  from public.sponsor_seat_packages a
  join public.sponsor_packages p on p.slug = a.package_slug
  where a.member_id = v_uid;

  select c.slug, c.name
  into v_cat, v_cat_name
  from public.sponsor_category_seats s
  join public.sponsor_categories c on c.slug = s.category_slug
  where s.member_id = v_uid;

  select count(*)::int
  into v_used
  from public.majlis_events e
  where e.presented_by_member_id = v_uid
    and e.status in ('published', 'hidden');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'title', e.title,
        'starts_at', e.starts_at,
        'ends_at', e.ends_at,
        'region', e.region,
        'presented_by', e.sponsor_label,
        'status', e.status
      )
      order by e.starts_at
    ),
    '[]'::jsonb
  )
  into v_events
  from public.majlis_events e
  where e.presented_by_member_id = v_uid
    and e.status in ('published', 'hidden');

  select
    count(*) filter (where bucket = 'approved')::int,
    count(*) filter (where bucket = 'pending')::int,
    count(*) filter (where bucket = 'declined')::int
  into v_approved, v_pending, v_declined
  from (
    select status as bucket from public.mandate_intros where member_id = v_uid
    union all
    select status from public.re_opportunity_intros where member_id = v_uid
    union all
    select status from public.re_partner_intros where member_id = v_uid
    union all
    select case status when 'accepted' then 'approved' else status end
    from public.member_intros
    where requester_id = v_uid
  ) intros;

  select count(*)::int
  into v_rooms
  from public.rooms r
  where r.owner_member_id = v_uid
    and r.opened_by = 'member'
    and r.is_demo = false
    and r.status in ('open', 'closed');

  return jsonb_build_object(
    'package', case
      when v_slug is null then null
      else jsonb_build_object(
        'slug', v_slug,
        'name', v_name,
        'price_label', v_price,
        'is_placeholder', v_placeholder,
        'majlis_slots', v_slots,
        'intro_credits', v_intro,
        'room_credits', v_room_credits
      )
    end,
    'category', case
      when v_cat is null then null
      else jsonb_build_object('slug', v_cat, 'name', v_cat_name)
    end,
    'majlis', jsonb_build_object(
      'entitled', case when v_slug is null then null else v_slots end,
      'used', v_used,
      'events', v_events
    ),
    'intros', jsonb_build_object(
      'approved', v_approved,
      'pending', v_pending,
      'declined', v_declined
    ),
    'credits', case
      when v_slug is null then null
      else jsonb_build_object(
        'intro_entitled', v_intro,
        'intro_used', v_approved,
        'room_entitled', v_room_credits,
        'room_used', v_rooms
      )
    end
  );
end;
$$;

revoke all on function public.sponsor_desk() from public, anon;
grant execute on function public.sponsor_desk() to authenticated;

create or replace function public.staff_list_sponsor_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_packages jsonb;
  v_categories jsonb;
  v_sponsors jsonb;
  v_presented jsonb;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'slug', p.slug,
        'name', p.name,
        'price_label', p.price_label,
        'majlis_slots', p.majlis_slots,
        'intro_credits', p.intro_credits,
        'room_credits', p.room_credits,
        'sort_order', p.sort_order,
        'active', p.active,
        'is_placeholder', p.is_placeholder
      )
      order by p.sort_order, p.slug
    ),
    '[]'::jsonb
  )
  into v_packages
  from public.sponsor_packages p;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('slug', c.slug, 'name', c.name)
      order by c.name
    ),
    '[]'::jsonb
  )
  into v_categories
  from public.sponsor_categories c;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', m.user_id,
        'email', m.email,
        'status', m.status,
        'label', coalesce(nullif(trim(p.company), ''), nullif(trim(p.full_name), ''), 'Sponsor'),
        'package_slug', a.package_slug,
        'category_slug', s.category_slug,
        'category_name', c.name
      )
      order by lower(coalesce(p.company, p.full_name, m.email))
    ),
    '[]'::jsonb
  )
  into v_sponsors
  from public.members m
  left join public.profiles p on p.user_id = m.user_id
  left join public.sponsor_seat_packages a on a.member_id = m.user_id
  left join public.sponsor_category_seats s on s.member_id = m.user_id
  left join public.sponsor_categories c on c.slug = s.category_slug
  where m.seat = 'sponsor'
    and m.status in ('invited', 'active')
    and m.is_demo = false;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'event_id', e.id,
        'member_id', e.presented_by_member_id
      )
    ),
    '[]'::jsonb
  )
  into v_presented
  from public.majlis_events e
  where e.presented_by_member_id is not null;

  return jsonb_build_object(
    'packages', v_packages,
    'categories', v_categories,
    'sponsors', v_sponsors,
    'presented_by', v_presented
  );
end;
$$;

revoke all on function public.staff_list_sponsor_catalog() from public, anon;
grant execute on function public.staff_list_sponsor_catalog() to authenticated;

create or replace function public.staff_save_sponsor_package(
  p_slug text,
  p_name text,
  p_price_label text,
  p_majlis_slots integer,
  p_intro_credits integer,
  p_room_credits integer,
  p_active boolean,
  p_is_placeholder boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_name text;
  v_price text;
  v_sort integer;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  v_slug := lower(trim(coalesce(p_slug, '')));
  v_name := trim(coalesce(p_name, ''));
  v_price := trim(coalesce(p_price_label, ''));

  if v_slug !~ '^[a-z0-9_]{2,40}$' then
    raise exception 'Use a short package key of letters, numbers, and underscores.' using errcode = '22023';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 or position('@' in v_name) > 0 then
    raise exception 'The package name must be 80 characters or fewer and cannot include an email address.' using errcode = '22023';
  end if;
  if char_length(v_price) < 1 or char_length(v_price) > 80 or position('@' in v_price) > 0 then
    raise exception 'The price label must be 80 characters or fewer and cannot include an email address.' using errcode = '22023';
  end if;
  if p_majlis_slots is null or p_majlis_slots < 0 or p_majlis_slots > 24 then
    raise exception 'Majlis slots must be a whole number from 0 to 24.' using errcode = '22023';
  end if;
  if p_intro_credits is null or p_intro_credits < 0 or p_intro_credits > 500 then
    raise exception 'Intro credits must be a whole number from 0 to 500.' using errcode = '22023';
  end if;
  if p_room_credits is null or p_room_credits < 0 or p_room_credits > 500 then
    raise exception 'Room credits must be a whole number from 0 to 500.' using errcode = '22023';
  end if;
  if p_active is null or p_is_placeholder is null then
    raise exception 'Active and placeholder are required.' using errcode = '22023';
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_sort from public.sponsor_packages;

  insert into public.sponsor_packages (
    slug, name, price_label, majlis_slots, intro_credits, room_credits, sort_order, active, is_placeholder, updated_at
  ) values (
    v_slug, v_name, v_price, p_majlis_slots, p_intro_credits, p_room_credits, v_sort, p_active, p_is_placeholder, now()
  )
  on conflict (slug) do update
    set name = excluded.name,
        price_label = excluded.price_label,
        majlis_slots = excluded.majlis_slots,
        intro_credits = excluded.intro_credits,
        room_credits = excluded.room_credits,
        active = excluded.active,
        is_placeholder = excluded.is_placeholder,
        updated_at = now();

  return jsonb_build_object('ok', true, 'slug', v_slug);
end;
$$;

revoke all on function public.staff_save_sponsor_package(text, text, text, integer, integer, integer, boolean, boolean) from public, anon;
grant execute on function public.staff_save_sponsor_package(text, text, text, integer, integer, integer, boolean, boolean) to authenticated;

create or replace function public.staff_assign_sponsor_package(
  p_member_id uuid,
  p_package_slug text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_member_id is null or not exists (
    select 1
    from public.members m
    where m.user_id = p_member_id
      and m.seat = 'sponsor'
      and m.status in ('invited', 'active')
      and m.is_demo = false
  ) then
    raise exception 'Choose an invited or active sponsor.' using errcode = '22023';
  end if;

  v_slug := nullif(lower(trim(coalesce(p_package_slug, ''))), '');
  if v_slug is null then
    delete from public.sponsor_seat_packages where member_id = p_member_id;
    return jsonb_build_object('ok', true, 'package_slug', null);
  end if;

  if not exists (select 1 from public.sponsor_packages p where p.slug = v_slug) then
    raise exception 'Choose a package from the list.' using errcode = '22023';
  end if;

  insert into public.sponsor_seat_packages (member_id, package_slug, updated_at)
  values (p_member_id, v_slug, now())
  on conflict (member_id) do update
    set package_slug = excluded.package_slug,
        updated_at = now();

  return jsonb_build_object('ok', true, 'package_slug', v_slug);
end;
$$;

revoke all on function public.staff_assign_sponsor_package(uuid, text) from public, anon;
grant execute on function public.staff_assign_sponsor_package(uuid, text) to authenticated;

create or replace function public.staff_set_majlis_presented_by(
  p_event_id uuid,
  p_member_id uuid,
  p_label text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
  v_member uuid;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_event_id is null or not exists (
    select 1 from public.majlis_events e where e.id = p_event_id
  ) then
    raise exception 'Choose a majlis.' using errcode = '22023';
  end if;

  v_member := p_member_id;
  if v_member is not null and not exists (
    select 1
    from public.members m
    where m.user_id = v_member
      and m.seat = 'sponsor'
      and m.status in ('invited', 'active')
      and m.is_demo = false
  ) then
    raise exception 'Presented by must be an invited or active sponsor.' using errcode = '22023';
  end if;

  v_label := nullif(trim(coalesce(p_label, '')), '');
  if v_label is not null and (char_length(v_label) > 120 or position('@' in v_label) > 0) then
    raise exception 'Presented by must be 120 characters or fewer and cannot be an email address.' using errcode = '22023';
  end if;

  if v_member is not null and v_label is null then
    select coalesce(nullif(trim(p.company), ''), nullif(trim(p.full_name), ''), 'Sponsor')
    into v_label
    from public.profiles p
    where p.user_id = v_member;
    v_label := left(nullif(trim(coalesce(v_label, '')), ''), 120);
    if v_label is null or position('@' in v_label) > 0 then
      v_label := 'Sponsor';
    end if;
  end if;

  update public.majlis_events
  set sponsor_label = v_label,
      presented_by_member_id = v_member,
      updated_at = now()
  where id = p_event_id;

  return jsonb_build_object(
    'ok', true,
    'sponsor_label', v_label,
    'presented_by_member_id', v_member
  );
end;
$$;

revoke all on function public.staff_set_majlis_presented_by(uuid, uuid, text) from public, anon;
grant execute on function public.staff_set_majlis_presented_by(uuid, uuid, text) to authenticated;

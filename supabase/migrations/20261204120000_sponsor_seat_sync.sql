-- One sponsor test, seat sync, and honest sponsor credits.
-- private.is_sponsor is the sponsor test. Seat and the sponsor tier stay in step.
-- Adding the sponsor tier moves seat to sponsor, stores prior_seat (ksa or intl),
-- and sets invites to 0/0.
-- Removing it restores that region and the weekly invite wallet to 2/2.
-- The restore sets board.invite_release for this transaction only, which is what
-- guard_invite_wallet requires before invites_remaining may rise.
-- A sponsor seat with no saved region is refused. The region is not guessed.
-- A sponsor seat cannot also hold the Founding tier.
-- The cap counts invited or active non-demo members once each, through the helper.
-- Demo rows stay outside the cap, as they did before.
-- prior_seat is not granted to anon or authenticated.
-- New tables have row security enabled and forced, with no client grants.
-- This file does not rewrite majlis_* or private.majlis_* functions.
-- Safe to run again. It does not update existing member rows.

alter table public.members
  add column if not exists prior_seat text;

alter table public.members drop constraint if exists members_prior_seat_check;
alter table public.members
  add constraint members_prior_seat_check
  check (prior_seat is null or prior_seat in ('ksa', 'intl'));

comment on column public.members.prior_seat is
  'Region saved when the seat moves to sponsor. Not granted on the member select list.';

revoke select (prior_seat) on table public.members from public, anon, authenticated;

create or replace function private.is_sponsor(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members m
    where m.user_id = p_uid
      and (
        m.seat = 'sponsor'
        or 'sponsor' = any (coalesce(m.tiers, '{}'::text[]))
      )
  );
$$;

revoke all on function private.is_sponsor(uuid) from public, anon, authenticated;

comment on function private.is_sponsor(uuid) is
  'True when the seat is sponsor or the tier set includes sponsor. One row, one answer.';

create or replace function private.guard_sponsor_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  taken integer;
  now_sponsor boolean;
  held boolean;
begin
  -- The incoming row is not what private.is_sponsor reads yet.
  -- Other members are counted with the helper, once each.
  now_sponsor := new.seat = 'sponsor'
    or 'sponsor' = any (coalesce(new.tiers, '{}'::text[]));
  if not now_sponsor then
    return new;
  end if;
  if new.status not in ('invited', 'active') then
    return new;
  end if;
  if new.is_demo then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    held := (
      old.seat = 'sponsor'
      or 'sponsor' = any (coalesce(old.tiers, '{}'::text[]))
    )
      and old.status in ('invited', 'active')
      and old.is_demo = false;
    if held then
      return new;
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('board-arabia-seat-sponsor'));

  select count(*)::integer into taken
  from public.members m
  where m.status in ('invited', 'active')
    and m.is_demo = false
    and private.is_sponsor(m.user_id)
    and m.user_id is distinct from new.user_id;

  if taken >= 3 then
    raise exception 'sponsor_cap' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_sponsor_cap() from public, anon, authenticated;

create or replace function public.set_member_tiers(p_user_id uuid, p_tiers text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.members%rowtype;
  before_tiers text[];
  next_tiers text[];
  next_no smallint;
  next_seat text;
  next_prior text;
  next_granted integer;
  next_remaining integer;
  taken int;
  adding_founding boolean;
  will_sponsor boolean;
  already_sponsor boolean;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_tiers is null or cardinality(p_tiers) < 1 then
    raise exception 'invalid_tier' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_tiers) as u(t)
    where u.t is null
      or u.t <> all (private.membership_tier_catalog())
  ) then
    raise exception 'invalid_tier' using errcode = '22023';
  end if;

  if 'founding' = any (p_tiers) and 'member' = any (p_tiers) then
    raise exception 'invalid_combination' using errcode = '22023';
  end if;

  next_tiers := private.normalize_membership_tiers(p_tiers);
  if not private.membership_tiers_valid(next_tiers) then
    raise exception 'invalid_combination' using errcode = '22023';
  end if;

  select * into row
  from public.members
  where user_id = p_user_id
  for update;

  if row.user_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  before_tiers := row.tiers;
  will_sponsor := 'sponsor' = any (next_tiers);
  already_sponsor := row.seat = 'sponsor'
    or 'sponsor' = any (coalesce(before_tiers, array[]::text[]));

  if 'founding' = any (next_tiers)
     and (row.seat = 'sponsor' or will_sponsor) then
    raise exception 'A sponsor seat cannot also hold the Founding tier.'
      using errcode = '22023';
  end if;

  adding_founding := 'founding' = any (next_tiers)
    and (
      not ('founding' = any (before_tiers))
      or row.founding_number is null
    );

  if 'founding' = any (next_tiers)
     and not ('founding' = any (before_tiers))
     and row.seat not in ('ksa', 'intl') then
    raise exception 'no_region' using errcode = '22023';
  end if;

  next_no := case
    when 'founding' = any (next_tiers) then row.founding_number
    else null
  end;

  if adding_founding and row.is_demo = false then
    perform pg_advisory_xact_lock(hashtext('board-arabia-seat-' || row.seat));
    perform pg_advisory_xact_lock(hashtext('board-arabia-founding-number'));

    if row.status in ('invited', 'active') and not ('founding' = any (before_tiers)) then
      taken := private.founding_region_taken(row.seat, row.user_id);
      if taken >= 50 then
        raise exception 'seat_full' using errcode = '23514';
      end if;
    end if;

    if row.founding_number is null then
      next_no := private.next_founding_number();
    end if;
  elsif 'founding' = any (next_tiers) and row.founding_number is not null then
    next_no := row.founding_number;
  elsif not ('founding' = any (next_tiers)) then
    perform pg_advisory_xact_lock(hashtext('board-arabia-founding-number'));
    next_no := null;
  end if;

  if will_sponsor
     and not already_sponsor
     and row.is_demo = false
     and row.status in ('invited', 'active') then
    perform pg_advisory_xact_lock(hashtext('board-arabia-seat-sponsor'));
    select count(*)::int into taken
    from public.members m
    where m.status in ('invited', 'active')
      and m.is_demo = false
      and private.is_sponsor(m.user_id)
      and m.user_id is distinct from row.user_id;
    if taken >= 3 then
      raise exception 'sponsor_cap' using errcode = '23514';
    end if;
  end if;

  next_seat := row.seat;
  next_prior := row.prior_seat;
  next_granted := row.invites_granted;
  next_remaining := row.invites_remaining;

  if will_sponsor and row.seat is distinct from 'sponsor' then
    if row.seat in ('ksa', 'intl') then
      next_prior := row.seat;
    end if;
    next_seat := 'sponsor';
    next_granted := 0;
    next_remaining := 0;
  elsif not will_sponsor and row.seat = 'sponsor' then
    if row.prior_seat is null or row.prior_seat not in ('ksa', 'intl') then
      raise exception 'This sponsor has no saved region. Set the region before removing the Sponsor tier.'
        using errcode = '22023';
    end if;
    next_seat := row.prior_seat;
    next_prior := null;
    next_granted := 2;
    next_remaining := 2;
    perform set_config('board.invite_release', 'on', true);
  end if;

  update public.members
  set tiers = next_tiers,
      founding_number = next_no,
      seat = next_seat,
      prior_seat = next_prior,
      invites_granted = next_granted,
      invites_remaining = next_remaining
  where user_id = p_user_id;

  insert into public.member_tier_audits (member_user_id, actor_id, before_tiers, after_tiers)
  values (p_user_id, auth.uid(), before_tiers, next_tiers);

  return jsonb_build_object(
    'ok', true,
    'tiers', to_jsonb(next_tiers),
    'founding_number', (select m.founding_number from public.members m where m.user_id = p_user_id),
    'seat', next_seat
  );
end;
$$;

revoke all on function public.set_member_tiers(uuid, text[]) from public, anon, service_role;
grant execute on function public.set_member_tiers(uuid, text[]) to authenticated;

comment on function public.set_member_tiers(uuid, text[]) is
  'Staff sets membership tiers. Founding and Member cannot combine. A sponsor seat cannot also hold the Founding tier. Adding Sponsor moves the seat and the invite wallet.';

create or replace function public.claim_sponsor_seat(
  p_user_id uuid,
  p_email text,
  p_invited_by uuid,
  p_full_name text default null,
  p_company text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  taken int;
  v_email text;
  v_name text;
  v_company text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_user_id is null or p_invited_by is null then
    raise exception 'invalid_invite' using errcode = '22023';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if char_length(v_email) < 3
     or char_length(v_email) > 320
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  v_name := nullif(left(trim(coalesce(p_full_name, '')), 200), '');
  v_company := nullif(left(trim(coalesce(p_company, '')), 200), '');

  perform pg_advisory_xact_lock(hashtext('board-arabia-seat-sponsor'));

  if exists (
    select 1 from public.members m
    where m.user_id = p_user_id
      or lower(m.email) = v_email
  ) then
    raise exception 'already_member' using errcode = '23505';
  end if;

  select count(*)::int into taken
  from public.members m
  where m.status in ('invited', 'active')
    and m.is_demo = false
    and private.is_sponsor(m.user_id);

  if taken >= 3 then
    raise exception 'sponsor_cap' using errcode = '23514';
  end if;

  insert into public.members (
    user_id, application_id, email, seat, status, must_set_password, invited_by,
    invites_granted, invites_remaining, is_demo, tiers
  ) values (
    p_user_id,
    null,
    v_email,
    'sponsor',
    'invited',
    true,
    p_invited_by,
    0,
    0,
    false,
    array['sponsor']::text[]
  );

  insert into public.profiles (
    user_id,
    full_name,
    company,
    include_in_public_aggregates,
    capacity_verified
  ) values (
    p_user_id,
    v_name,
    v_company,
    false,
    false
  );
end;
$$;

revoke all on function public.claim_sponsor_seat(uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_sponsor_seat(uuid, text, uuid, text, text)
  to service_role;

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
  v_intro_base integer;
  v_intro_month integer := 0;
  v_month timestamptz;
begin
  if v_uid is null or not exists (
    select 1
    from public.members m
    where m.user_id = v_uid
      and private.is_sponsor(m.user_id)
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

  select s.monthly_limit into v_intro_base
  from public.intro_quota_settings s
  where s.id;
  v_intro_base := coalesce(v_intro_base, 5);
  v_month := private.riyadh_month_start(now());
  select count(*)::int into v_intro_month
  from public.member_intros i
  where i.requester_id = v_uid
    and i.requested_at >= v_month
    and i.requested_at < (v_month + interval '1 month');

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
        'intro_used', v_intro_month,
        'intro_base', v_intro_base,
        'intro_extra', coalesce(v_intro, 0),
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
  where private.is_sponsor(m.user_id)
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
      and private.is_sponsor(m.user_id)
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
      and private.is_sponsor(m.user_id)
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
    and private.is_sponsor(m.user_id)
    and m.is_demo = false;

  return v_base + coalesce(v_extra, 0);
end;
$$;

revoke all on function private.intro_allowance_for(uuid) from public, anon, authenticated;

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

create or replace function public.list_re_opportunities()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  seat text;
begin
  if actor is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if private.is_staff() then
    return private.re_staff_opportunity_inventory();
  end if;

  select m.seat into seat
  from public.members m
  where m.user_id = actor
    and m.status in ('invited', 'active');

  if private.is_sponsor(actor) then
    return private.re_sponsor_opportunities(actor);
  end if;

  if seat in ('ksa', 'intl') then
    return private.re_member_opportunity_feed(actor);
  end if;

  raise exception 'not_allowed' using errcode = '42501';
end;
$$;

revoke all on function public.list_re_opportunities() from public, anon;
grant execute on function public.list_re_opportunities() to authenticated;

create or replace function public.list_re_partners()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  seat text;
begin
  if actor is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if private.is_staff() then
    return private.re_staff_partner_inventory();
  end if;

  select m.seat into seat
  from public.members m
  where m.user_id = actor
    and m.status in ('invited', 'active');

  if private.is_sponsor(actor) then
    return private.re_sponsor_partners(actor);
  end if;

  if seat in ('ksa', 'intl') then
    return private.re_member_partner_feed();
  end if;

  raise exception 'not_allowed' using errcode = '42501';
end;
$$;

revoke all on function public.list_re_partners() from public, anon;
grant execute on function public.list_re_partners() to authenticated;

create or replace function public.staff_assign_sponsor_category(
  p_member_id uuid,
  p_category_slug text
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

  if p_member_id is null then
    raise exception 'invalid_sponsor' using errcode = '22023';
  end if;

  v_slug := nullif(trim(coalesce(p_category_slug, '')), '');
  if v_slug is null then
    delete from public.sponsor_category_seats
    where member_id = p_member_id;
    return jsonb_build_object('ok', true, 'category_slug', null);
  end if;

  if not exists (
    select 1
    from public.members m
    where m.user_id = p_member_id
      and private.is_sponsor(m.user_id)
      and m.status in ('invited', 'active')
      and m.is_demo = false
  ) then
    raise exception 'invalid_sponsor' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.sponsor_categories c
    where c.slug = v_slug
  ) then
    raise exception 'invalid_category' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.sponsor_category_seats s
    where s.category_slug = v_slug
      and s.member_id is distinct from p_member_id
  ) then
    raise exception 'category_taken' using errcode = '23505';
  end if;

  insert into public.sponsor_category_seats (member_id, category_slug)
  values (p_member_id, v_slug)
  on conflict (member_id) do update
    set category_slug = excluded.category_slug;

  return jsonb_build_object('ok', true, 'category_slug', v_slug);
end;
$$;
-- admin_assign_category_end

revoke all on function public.staff_assign_sponsor_category(uuid, text) from public, anon;
grant execute on function public.staff_assign_sponsor_category(uuid, text) to authenticated;

create table if not exists public.sponsor_welcome_dismissals (
  member_id uuid primary key references public.members (user_id) on delete cascade,
  dismissed_at timestamptz not null default now()
);

comment on table public.sponsor_welcome_dismissals is
  'When a sponsor dismissed the first sign-in welcome. Not readable by clients.';

alter table public.sponsor_welcome_dismissals enable row level security;
alter table public.sponsor_welcome_dismissals force row level security;
revoke all on table public.sponsor_welcome_dismissals from public, anon, authenticated;

create table if not exists public.sponsor_handovers (
  member_id uuid primary key references public.members (user_id) on delete cascade,
  handed_over_at timestamptz not null,
  actor_id uuid not null
);

comment on table public.sponsor_handovers is
  'When admin recorded that sponsor sign-in steps were handed over. Not readable by clients.';

alter table public.sponsor_handovers enable row level security;
alter table public.sponsor_handovers force row level security;
revoke all on table public.sponsor_handovers from public, anon, authenticated;

create or replace function public.own_sponsor_welcome()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_at timestamptz;
begin
  if auth.uid() is null
     or not private.is_sponsor(auth.uid())
     or not exists (
       select 1
       from public.members m
       where m.user_id = auth.uid()
         and m.status in ('invited', 'active')
         and m.is_demo = false
     ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select d.dismissed_at into v_at
  from public.sponsor_welcome_dismissals d
  where d.member_id = auth.uid();

  return jsonb_build_object('dismissed', v_at is not null, 'dismissed_at', v_at);
end;
$$;

revoke all on function public.own_sponsor_welcome() from public, anon;
grant execute on function public.own_sponsor_welcome() to authenticated;

create or replace function public.dismiss_sponsor_welcome()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not private.is_sponsor(auth.uid())
     or not exists (
       select 1
       from public.members m
       where m.user_id = auth.uid()
         and m.status in ('invited', 'active')
         and m.is_demo = false
     ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  insert into public.sponsor_welcome_dismissals (member_id, dismissed_at)
  values (auth.uid(), now())
  on conflict (member_id) do update
    set dismissed_at = excluded.dismissed_at;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.dismiss_sponsor_welcome() from public, anon;
grant execute on function public.dismiss_sponsor_welcome() to authenticated;

create or replace function public.staff_sponsor_handovers()
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
      'member_id', h.member_id,
      'handed_over_at', h.handed_over_at
    ))
    from public.sponsor_handovers h
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_sponsor_handovers() from public, anon;
grant execute on function public.staff_sponsor_handovers() to authenticated;

create or replace function public.mark_sponsor_handed_over(p_member_id uuid, p_handed boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_member_id is null or p_handed is null or not exists (
    select 1
    from public.members m
    where m.user_id = p_member_id
      and m.status in ('invited', 'active')
      and m.is_demo = false
      and private.is_sponsor(m.user_id)
  ) then
    raise exception 'Choose an invited or active sponsor.' using errcode = '22023';
  end if;

  if p_handed then
    insert into public.sponsor_handovers (member_id, handed_over_at, actor_id)
    values (p_member_id, now(), auth.uid())
    on conflict (member_id) do update
      set handed_over_at = excluded.handed_over_at,
          actor_id = excluded.actor_id;
  else
    delete from public.sponsor_handovers where member_id = p_member_id;
  end if;

  return jsonb_build_object('ok', true, 'handed', p_handed);
end;
$$;

revoke all on function public.mark_sponsor_handed_over(uuid, boolean) from public, anon;
grant execute on function public.mark_sponsor_handed_over(uuid, boolean) to authenticated;

comment on function public.mark_sponsor_handed_over(uuid, boolean) is
  'Staff at aal2 records that sponsor sign-in steps were handed over. private.is_staff requires aal2.';

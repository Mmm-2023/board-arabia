-- RE7 board and NED real estate roles.
-- Separate from capital opportunities.
-- Member reads go through the security definer list.
-- Locked JSON has no organisation, seat terms, or desk contact.
-- Demo rows stay while real published roles are below the threshold.
-- Apply on the live project later. This change does not apply the migration and does not deploy.
-- Edge redeploy: request-re-intro (changed). No new Edge function.
--
-- Order: after 20261122120000_re_appetite.sql.

alter table public.demo_thresholds
  add column if not exists re_board_roles_real int not null default 3;

alter table public.demo_thresholds drop constraint if exists demo_thresholds_nonneg;

alter table public.demo_thresholds
  add constraint demo_thresholds_nonneg check (
    directory_real >= 0
    and mandates_real >= 0
    and rooms_real >= 0
    and partners_real >= 0
    and re_opportunities_real >= 0
    and re_partners_real >= 0
    and re_board_roles_real >= 0
  );

create or replace function private.demo_rows_visible(p_surface text, p_real_count int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p_real_count < (
      select case p_surface
        when 'directory' then directory_real
        when 'mandates' then mandates_real
        when 'rooms' then rooms_real
        when 'partners' then partners_real
        when 're_opportunities' then re_opportunities_real
        when 're_partners' then re_partners_real
        when 're_board_roles' then re_board_roles_real
        else null
      end
      from public.demo_thresholds
      where id = 1
    ),
    false
  );
$$;

revoke all on function private.demo_rows_visible(text, int) from public, anon, authenticated;

create table if not exists public.re_board_roles (
  id uuid primary key default gen_random_uuid(),
  is_demo boolean not null default false,
  published boolean not null default false,
  seat_kind text not null,
  title text not null,
  sector text not null,
  capacity text not null,
  city text not null,
  asset_class text not null,
  organisation_name text not null,
  terms text not null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text not null,
  narrative text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint re_board_roles_seat_kind check (seat_kind in ('developer', 'propco')),
  constraint re_board_roles_asset_class check (asset_class in (
    'residential',
    'hospitality',
    'office',
    'retail',
    'industrial/logistics',
    'mixed-use',
    'land bank',
    'student housing',
    'healthcare RE'
  )),
  constraint re_board_roles_city check (city in (
    'Riyadh',
    'Makkah',
    'Madinah',
    'Eastern Province',
    'Asir',
    'Tabuk',
    'Qassim',
    'Ha''il',
    'Northern Borders',
    'Jazan',
    'Najran',
    'Al Bahah',
    'Al Jawf',
    'Jeddah',
    'NEOM',
    'Red Sea',
    'Qiddiya',
    'Diriyah',
    'ROSHN',
    'other'
  )),
  constraint re_board_roles_title_len check (char_length(title) between 1 and 160),
  constraint re_board_roles_sector_len check (char_length(sector) between 1 and 120),
  constraint re_board_roles_capacity_len check (char_length(capacity) between 1 and 160),
  constraint re_board_roles_organisation_len check (char_length(organisation_name) between 1 and 200),
  constraint re_board_roles_terms_len check (char_length(terms) between 1 and 400),
  constraint re_board_roles_narrative_len check (char_length(narrative) between 1 and 2000),
  constraint re_board_roles_contact_name_len check (char_length(contact_name) between 1 and 120),
  constraint re_board_roles_contact_phone_len check (char_length(contact_phone) between 1 and 40),
  constraint re_board_roles_sort_order check (sort_order >= 0),
  constraint re_board_roles_contact_email check (
    lower(contact_email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint re_board_roles_demo_mailbox check (
    is_demo = false or lower(contact_email) ~ '@example\.com$'
  ),
  constraint re_board_roles_title_clear check (
    position('@' in title) = 0
    and position(lower(organisation_name) in lower(title)) = 0
  ),
  constraint re_board_roles_sector_clear check (
    position('@' in sector) = 0
    and position(lower(organisation_name) in lower(sector)) = 0
  ),
  constraint re_board_roles_capacity_clear check (
    position('@' in capacity) = 0
    and position(lower(organisation_name) in lower(capacity)) = 0
  )
);

create table if not exists public.re_board_role_intros (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.re_board_roles (id) on delete cascade,
  member_id uuid not null references public.members (user_id) on delete cascade,
  status text not null,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  constraint re_board_role_intros_status check (status in ('pending', 'approved', 'declined')),
  constraint re_board_role_intros_unique unique (role_id, member_id)
);

create index if not exists re_board_role_intros_member_idx
  on public.re_board_role_intros (member_id);

alter table public.re_board_roles enable row level security;
alter table public.re_board_roles force row level security;
revoke all on table public.re_board_roles from public, anon, authenticated;

alter table public.re_board_role_intros enable row level security;
alter table public.re_board_role_intros force row level security;
revoke all on table public.re_board_role_intros from public, anon, authenticated;

-- locked_re_board_role_json
create or replace function private.re_board_role_locked_json(
  p_id uuid,
  p_is_demo boolean,
  p_seat_kind text,
  p_title text,
  p_sector text,
  p_capacity text,
  p_city text,
  p_asset_class text,
  p_intro_status text
) returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_id,
    'is_demo', p_is_demo,
    'seat_kind', p_seat_kind,
    'title', p_title,
    'sector', p_sector,
    'capacity', p_capacity,
    'city', p_city,
    'asset_class', p_asset_class,
    'unlocked', false,
    'access', 'locked',
    'intro_status', p_intro_status
  );
$$;
-- end_locked_re_board_role_json

revoke all on function private.re_board_role_locked_json(uuid, boolean, text, text, text, text, text, text, text)
  from public, anon, authenticated;

create or replace function private.re_board_role_open_json(
  p_id uuid,
  p_is_demo boolean,
  p_seat_kind text,
  p_title text,
  p_sector text,
  p_capacity text,
  p_city text,
  p_asset_class text,
  p_organisation_name text,
  p_terms text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_narrative text
) returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_id,
    'is_demo', p_is_demo,
    'seat_kind', p_seat_kind,
    'title', p_title,
    'sector', p_sector,
    'capacity', p_capacity,
    'city', p_city,
    'asset_class', p_asset_class,
    'unlocked', true,
    'access', 'intro',
    'intro_status', 'approved',
    'organisation_name', p_organisation_name,
    'terms', p_terms,
    'contact_name', p_contact_name,
    'contact_email', p_contact_email,
    'contact_phone', p_contact_phone,
    'narrative', p_narrative
  );
$$;

revoke all on function private.re_board_role_open_json(
  uuid, boolean, text, text, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;

create or replace function private.re_board_role_inventory_json(
  p_id uuid,
  p_is_demo boolean,
  p_seat_kind text,
  p_title text,
  p_sector text,
  p_capacity text,
  p_city text,
  p_asset_class text,
  p_organisation_name text,
  p_terms text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_narrative text,
  p_published boolean,
  p_sort_order integer
) returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_id,
    'is_demo', p_is_demo,
    'seat_kind', p_seat_kind,
    'title', p_title,
    'sector', p_sector,
    'capacity', p_capacity,
    'city', p_city,
    'asset_class', p_asset_class,
    'unlocked', true,
    'access', 'inventory',
    'intro_status', null,
    'organisation_name', p_organisation_name,
    'terms', p_terms,
    'contact_name', p_contact_name,
    'contact_email', p_contact_email,
    'contact_phone', p_contact_phone,
    'narrative', p_narrative,
    'published', p_published,
    'sort_order', p_sort_order
  );
$$;

revoke all on function private.re_board_role_inventory_json(
  uuid, boolean, text, text, text, text, text, text, text, text, text, text, text, text, boolean, integer
) from public, anon, authenticated;

-- member_board_role_feed_begin
create or replace function private.re_member_board_role_feed(p_member uuid)
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
  if auth.uid() is distinct from p_member
     or not exists (
       select 1
       from public.members m
       where m.user_id = p_member
         and m.seat in ('ksa', 'intl')
         and m.status in ('invited', 'active')
     ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select count(*)::int into real_n
  from public.re_board_roles
  where is_demo = false
    and published = true;

  show_demo := private.demo_rows_visible('re_board_roles', real_n);

  return coalesce((
    select jsonb_agg(payload order by sort_order, created_at)
    from (
      select
        r.sort_order,
        r.created_at,
        case
          when i.status = 'approved' then private.re_board_role_open_json(
            r.id,
            r.is_demo,
            r.seat_kind,
            r.title,
            r.sector,
            r.capacity,
            r.city,
            r.asset_class,
            r.organisation_name,
            r.terms,
            r.contact_name,
            r.contact_email,
            r.contact_phone,
            r.narrative
          )
-- member_board_role_locked_call_begin
          else private.re_board_role_locked_json(
            r.id,
            r.is_demo,
            r.seat_kind,
            r.title,
            r.sector,
            r.capacity,
            r.city,
            r.asset_class,
            i.status
          )
-- member_board_role_locked_call_end
        end as payload
      from public.re_board_roles r
      left join public.re_board_role_intros i
        on i.role_id = r.id
       and i.member_id = p_member
      where r.published
        and (r.is_demo = false or show_demo)
    ) listed
  ), '[]'::jsonb);
end;
$$;
-- member_board_role_feed_end

revoke all on function private.re_member_board_role_feed(uuid) from public, anon, authenticated;

create or replace function private.re_staff_board_role_inventory()
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
    select jsonb_agg(payload order by sort_order, created_at)
    from (
      select
        r.sort_order,
        r.created_at,
        private.re_board_role_inventory_json(
          r.id,
          r.is_demo,
          r.seat_kind,
          r.title,
          r.sector,
          r.capacity,
          r.city,
          r.asset_class,
          r.organisation_name,
          r.terms,
          r.contact_name,
          r.contact_email,
          r.contact_phone,
          r.narrative,
          r.published,
          r.sort_order
        ) as payload
      from public.re_board_roles r
    ) listed
  ), '[]'::jsonb);
end;
$$;

revoke all on function private.re_staff_board_role_inventory() from public, anon, authenticated;

create or replace function public.list_re_board_roles()
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
    return private.re_staff_board_role_inventory();
  end if;

  select m.seat into seat
  from public.members m
  where m.user_id = actor
    and m.status in ('invited', 'active');

  if seat in ('ksa', 'intl') then
    return private.re_member_board_role_feed(actor);
  end if;

  raise exception 'not_allowed' using errcode = '42501';
end;
$$;

revoke all on function public.list_re_board_roles() from public, anon;
grant execute on function public.list_re_board_roles() to authenticated;

create or replace function public.request_re_board_role_intro(p_role_id uuid)
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

  if private.sample_subject(p_role_id) then
    raise exception 'sample_blocked' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.re_board_roles r
    where r.id = p_role_id
      and r.published
      and r.is_demo = false
  ) into visible;

  if not visible then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  insert into public.re_board_role_intros (role_id, member_id, status)
  values (p_role_id, auth.uid(), 'pending')
  on conflict (role_id, member_id) do nothing
  returning id into new_id;

  if new_id is not null then
    perform private.note_re_intro_admin_alert(new_id);
  end if;

  select i.status into current_status
  from public.re_board_role_intros i
  where i.role_id = p_role_id
    and i.member_id = auth.uid();

  return jsonb_build_object('status', current_status);
end;
$$;

revoke all on function public.request_re_board_role_intro(uuid) from public, anon;
grant execute on function public.request_re_board_role_intro(uuid) to authenticated;

create or replace function public.staff_list_re_board_role_intros()
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
      'status', i.status,
      'title', r.title,
      'seat_kind', r.seat_kind,
      'sector', r.sector,
      'city', r.city,
      'asset_class', r.asset_class,
      'organisation_name', r.organisation_name,
      'member_name', coalesce(nullif(trim(p.full_name), ''), 'Member')
    ) order by i.requested_at)
    from public.re_board_role_intros i
    join public.re_board_roles r on r.id = i.role_id
    left join public.profiles p on p.user_id = i.member_id
    where i.status = 'pending'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_list_re_board_role_intros() from public, anon;
grant execute on function public.staff_list_re_board_role_intros() to authenticated;

create or replace function public.staff_decide_re_board_role_intro(
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
    from public.re_board_role_intros i
    join public.re_board_roles r on r.id = i.role_id
    where i.id = p_intro_id
      and (r.is_demo or private.sample_subject(r.id))
  ) then
    raise exception 'sample_blocked' using errcode = '42501';
  end if;

  update public.re_board_role_intros
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

revoke all on function public.staff_decide_re_board_role_intro(uuid, text) from public, anon;
grant execute on function public.staff_decide_re_board_role_intro(uuid, text) to authenticated;

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
    or exists (select 1 from public.re_board_roles b where b.id = p_id and b.is_demo)
    or exists (select 1 from public.rooms r where r.id = p_id and r.is_demo);
$$;

revoke all on function private.sample_subject(uuid) from public, anon, authenticated;

-- Fictional example seats. Names are not real companies or people.
insert into public.re_board_roles (
  id, is_demo, published, seat_kind, title, sector, capacity, city, asset_class,
  organisation_name, terms, contact_name, contact_email, contact_phone, narrative, sort_order
) values
  (
    'b3000001-0000-4000-8000-000000000001',
    true, true,
    'developer',
    'Independent director',
    'Housing',
    'One independent seat. Four meetings a year.',
    'Riyadh',
    'residential',
    'Safa Court Developer',
    'Independent seat. The appointment stays in the Safa Court Developer brief.',
    'Lina S.',
    'lina.role@example.com',
    'Desk extension 6101',
    'Safa Court Developer is a fictional example. This seat is an illustration, not a live appointment.',
    1
  ),
  (
    'b3000001-0000-4000-8000-000000000002',
    true, true,
    'propco',
    'Non-executive director',
    'Hospitality',
    'One non-executive seat. Quarterly meetings.',
    'Makkah',
    'hospitality',
    'Hadi Shore Hold',
    'Non-executive seat. The appointment stays in the Hadi Shore Hold brief.',
    'Nada Q.',
    'nada.role@example.com',
    'Desk extension 6102',
    'Hadi Shore Hold is a fictional example. This seat is an illustration, not a live appointment.',
    2
  ),
  (
    'b3000001-0000-4000-8000-000000000003',
    true, true,
    'propco',
    'Board observer',
    'Logistics',
    'One observer seat. Six meetings a year.',
    'Eastern Province',
    'industrial/logistics',
    'Yarda Freight Desk',
    'Observer seat. The appointment stays in the Yarda Freight Desk brief.',
    'Tariq Y.',
    'tariq.role@example.com',
    'Desk extension 6103',
    'Yarda Freight Desk is a fictional example. This seat is an illustration, not a live appointment.',
    3
  )
on conflict (id) do nothing;

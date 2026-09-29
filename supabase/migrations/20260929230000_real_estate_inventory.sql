-- Real estate opportunities, partners, redaction, and a fictional demo seed.
-- Apply on the live Supabase project (SQL editor or supabase db push).
-- The agent does not apply this file and does not deploy Edge functions.
-- No Edge function in this change set needs a deploy.
--
-- Order: after 20260929220000_member_invite_reminder.sql.
--
-- The schema had no sponsor category table and no Real estate category.
-- This migration adds public.sponsor_categories and the real_estate row.
-- RE partners reference that category only.
--
-- Demo rows are fictional content. is_demo is true. Mailboxes are example.com.
-- They are not Auth users and do not take a sponsor seat.
-- Demos stay while the real published count is below public.demo_thresholds.
-- At the threshold, the server returns real rows only.
--
-- Blur is not a privilege. Founding seats (ksa, intl) receive the clear
-- summary until that member has an approved intro. Staff (admin) and master
-- manage every row. A sponsor reads only its own surfaces.

alter table public.demo_thresholds
  add column if not exists re_opportunities_real int not null default 5,
  add column if not exists re_partners_real int not null default 3;

alter table public.demo_thresholds drop constraint if exists demo_thresholds_nonneg;
alter table public.demo_thresholds
  add constraint demo_thresholds_nonneg check (
    directory_real >= 0
    and mandates_real >= 0
    and rooms_real >= 0
    and partners_real >= 0
    and re_opportunities_real >= 0
    and re_partners_real >= 0
  );

-- demo_rows_visible_re_begin
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
        else null
      end
      from public.demo_thresholds
      where id = 1
    ),
    false
  );
$$;
-- demo_rows_visible_re_end

revoke all on function private.demo_rows_visible(text, int) from public, anon, authenticated;

create table if not exists public.sponsor_categories (
  slug text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  constraint sponsor_categories_slug check (slug ~ '^[a-z0-9_]+$'),
  constraint sponsor_categories_name_len check (char_length(name) between 1 and 80)
);

insert into public.sponsor_categories (slug, name)
values ('real_estate', 'Real estate')
on conflict (slug) do nothing;

create table if not exists public.sponsor_category_seats (
  member_id uuid primary key references public.members (user_id) on delete cascade,
  category_slug text not null references public.sponsor_categories (slug),
  created_at timestamptz not null default now(),
  constraint sponsor_category_seats_one_holder unique (category_slug)
);

create table if not exists public.re_opportunities (
  id uuid primary key default gen_random_uuid(),
  is_demo boolean not null default false,
  published boolean not null default false,
  sector text not null,
  city text not null,
  asset_class text not null,
  capital_role text not null,
  ticket_band text not null,
  one_liner text not null,
  sponsor_member_id uuid references public.members (user_id) on delete set null,
  counterparty_name text not null,
  terms text not null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text not null,
  narrative text not null,
  foreign_ownership_path text not null,
  escrow_off_plan text not null,
  title_clarity text not null,
  white_land_exposure text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint re_opportunities_asset_class check (asset_class in (
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
  constraint re_opportunities_city check (city in (
    'Riyadh',
    'Jeddah',
    'NEOM',
    'Red Sea',
    'Qiddiya',
    'Diriyah',
    'ROSHN',
    'other'
  )),
  constraint re_opportunities_capital_role check (capital_role in (
    'equity',
    'mezzanine',
    'sukuk/REIT',
    'JV partner',
    'land contribution',
    'offtake',
    'operator'
  )),
  constraint re_opportunities_ticket_band check (ticket_band in (
    'Under $10m',
    '$10-25m',
    '$25-50m',
    '$50-100m',
    '$100m and above'
  )),
  constraint re_opportunities_foreign_ownership_path check (foreign_ownership_path in (
    'designated_zone',
    'saudi_vehicle',
    'not_available',
    'not_stated'
  )),
  constraint re_opportunities_escrow_off_plan check (escrow_off_plan in (
    'in_place',
    'not_off_plan',
    'not_stated'
  )),
  constraint re_opportunities_title_clarity check (title_clarity in (
    'clear',
    'in_review',
    'not_stated'
  )),
  constraint re_opportunities_white_land_exposure check (white_land_exposure in (
    'none',
    'exposed',
    'not_stated'
  )),
  constraint re_opportunities_sector_len check (char_length(sector) between 1 and 120),
  constraint re_opportunities_one_liner_len check (char_length(one_liner) between 1 and 280),
  constraint re_opportunities_counterparty_len check (char_length(counterparty_name) between 1 and 200),
  constraint re_opportunities_terms_len check (char_length(terms) between 1 and 400),
  constraint re_opportunities_narrative_len check (char_length(narrative) between 1 and 2000),
  constraint re_opportunities_contact_name_len check (char_length(contact_name) between 1 and 120),
  constraint re_opportunities_contact_phone_len check (char_length(contact_phone) between 1 and 40),
  constraint re_opportunities_sort_order check (sort_order >= 0),
  constraint re_opportunities_contact_email check (
    lower(contact_email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint re_opportunities_demo_mailbox check (
    is_demo = false or lower(contact_email) ~ '@example\.com$'
  ),
  constraint re_opportunities_demo_unassigned check (
    is_demo = false or sponsor_member_id is null
  ),
  constraint re_opportunities_sector_clear check (
    position('@' in sector) = 0
    and position(lower(counterparty_name) in lower(sector)) = 0
  ),
  constraint re_opportunities_one_liner_clear check (
    position('@' in one_liner) = 0
    and position(lower(counterparty_name) in lower(one_liner)) = 0
  )
);

create index if not exists re_opportunities_sponsor_idx
  on public.re_opportunities (sponsor_member_id);

create table if not exists public.re_opportunity_intros (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.re_opportunities (id) on delete cascade,
  member_id uuid not null references public.members (user_id) on delete cascade,
  status text not null,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  constraint re_opportunity_intros_status check (status in ('pending', 'approved', 'declined')),
  constraint re_opportunity_intros_unique unique (opportunity_id, member_id)
);

create index if not exists re_opportunity_intros_member_idx
  on public.re_opportunity_intros (member_id);

create table if not exists public.re_partners (
  id uuid primary key default gen_random_uuid(),
  is_demo boolean not null default false,
  published boolean not null default false,
  category_slug text not null references public.sponsor_categories (slug),
  name text not null,
  kind text not null,
  blurb text not null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint re_partners_real_estate check (category_slug = 'real_estate'),
  constraint re_partners_kind check (kind in (
    'law',
    'valuation',
    'project finance',
    'developer',
    'broker'
  )),
  constraint re_partners_name_len check (char_length(name) between 1 and 120),
  constraint re_partners_blurb_len check (char_length(blurb) between 1 and 400),
  constraint re_partners_contact_name_len check (char_length(contact_name) between 1 and 120),
  constraint re_partners_contact_phone_len check (char_length(contact_phone) between 1 and 40),
  constraint re_partners_sort_order check (sort_order >= 0),
  constraint re_partners_contact_email check (
    lower(contact_email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint re_partners_demo_mailbox check (
    is_demo = false or lower(contact_email) ~ '@example\.com$'
  ),
  constraint re_partners_blurb_clear check (
    position('@' in blurb) = 0
    and position(lower(contact_email) in lower(blurb)) = 0
    and position(lower(contact_name) in lower(blurb)) = 0
  )
);

create index if not exists re_partners_category_idx
  on public.re_partners (category_slug);

alter table public.sponsor_categories enable row level security;
alter table public.sponsor_categories force row level security;
revoke all on table public.sponsor_categories from public, anon, authenticated;

alter table public.sponsor_category_seats enable row level security;
alter table public.sponsor_category_seats force row level security;
revoke all on table public.sponsor_category_seats from public, anon, authenticated;

alter table public.re_opportunities enable row level security;
alter table public.re_opportunities force row level security;
revoke all on table public.re_opportunities from public, anon, authenticated;

alter table public.re_opportunity_intros enable row level security;
alter table public.re_opportunity_intros force row level security;
revoke all on table public.re_opportunity_intros from public, anon, authenticated;

alter table public.re_partners enable row level security;
alter table public.re_partners force row level security;
revoke all on table public.re_partners from public, anon, authenticated;

-- locked_re_opportunity_json
create or replace function private.re_opportunity_locked_json(
  p_id uuid,
  p_is_demo boolean,
  p_sector text,
  p_city text,
  p_asset_class text,
  p_capital_role text,
  p_ticket_band text,
  p_one_liner text,
  p_foreign_ownership_path text,
  p_escrow_off_plan text,
  p_title_clarity text,
  p_white_land_exposure text,
  p_intro_status text
) returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_id,
    'is_demo', p_is_demo,
    'sector', p_sector,
    'city', p_city,
    'asset_class', p_asset_class,
    'capital_role', p_capital_role,
    'ticket_band', p_ticket_band,
    'one_liner', p_one_liner,
    'foreign_ownership_path', p_foreign_ownership_path,
    'escrow_off_plan', p_escrow_off_plan,
    'title_clarity', p_title_clarity,
    'white_land_exposure', p_white_land_exposure,
    'unlocked', false,
    'access', 'locked',
    'intro_status', p_intro_status
  );
$$;
-- end_locked_re_opportunity_json

revoke all on function private.re_opportunity_locked_json(
  uuid, boolean, text, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;

create or replace function private.re_opportunity_open_json(
  p_id uuid,
  p_is_demo boolean,
  p_sector text,
  p_city text,
  p_asset_class text,
  p_capital_role text,
  p_ticket_band text,
  p_one_liner text,
  p_foreign_ownership_path text,
  p_escrow_off_plan text,
  p_title_clarity text,
  p_white_land_exposure text,
  p_counterparty_name text,
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
    'sector', p_sector,
    'city', p_city,
    'asset_class', p_asset_class,
    'capital_role', p_capital_role,
    'ticket_band', p_ticket_band,
    'one_liner', p_one_liner,
    'foreign_ownership_path', p_foreign_ownership_path,
    'escrow_off_plan', p_escrow_off_plan,
    'title_clarity', p_title_clarity,
    'white_land_exposure', p_white_land_exposure,
    'unlocked', true,
    'access', 'intro',
    'intro_status', 'approved',
    'counterparty_name', p_counterparty_name,
    'terms', p_terms,
    'contact_name', p_contact_name,
    'contact_email', p_contact_email,
    'contact_phone', p_contact_phone,
    'narrative', p_narrative
  );
$$;

revoke all on function private.re_opportunity_open_json(
  uuid, boolean, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;

create or replace function private.re_opportunity_inventory_json(
  p_id uuid,
  p_is_demo boolean,
  p_sector text,
  p_city text,
  p_asset_class text,
  p_capital_role text,
  p_ticket_band text,
  p_one_liner text,
  p_foreign_ownership_path text,
  p_escrow_off_plan text,
  p_title_clarity text,
  p_white_land_exposure text,
  p_counterparty_name text,
  p_terms text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_narrative text,
  p_published boolean,
  p_sponsor_member_id uuid
) returns jsonb
language sql
immutable
set search_path = public
as $$
  select private.re_opportunity_open_json(
    p_id,
    p_is_demo,
    p_sector,
    p_city,
    p_asset_class,
    p_capital_role,
    p_ticket_band,
    p_one_liner,
    p_foreign_ownership_path,
    p_escrow_off_plan,
    p_title_clarity,
    p_white_land_exposure,
    p_counterparty_name,
    p_terms,
    p_contact_name,
    p_contact_email,
    p_contact_phone,
    p_narrative
  ) || jsonb_build_object(
    'access', 'inventory',
    'intro_status', null,
    'published', p_published,
    'sponsor_member_id', p_sponsor_member_id
  );
$$;

revoke all on function private.re_opportunity_inventory_json(
  uuid, boolean, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, uuid
) from public, anon, authenticated;

-- locked_re_partner_json
create or replace function private.re_partner_locked_json(
  p_id uuid,
  p_is_demo boolean,
  p_category_slug text,
  p_name text,
  p_kind text,
  p_blurb text
) returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_id,
    'is_demo', p_is_demo,
    'category_slug', p_category_slug,
    'name', p_name,
    'kind', p_kind,
    'blurb', p_blurb,
    'unlocked', false,
    'access', 'locked'
  );
$$;
-- end_locked_re_partner_json

revoke all on function private.re_partner_locked_json(uuid, boolean, text, text, text, text)
  from public, anon, authenticated;

create or replace function private.re_partner_inventory_json(
  p_id uuid,
  p_is_demo boolean,
  p_category_slug text,
  p_name text,
  p_kind text,
  p_blurb text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_published boolean
) returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_id,
    'is_demo', p_is_demo,
    'category_slug', p_category_slug,
    'name', p_name,
    'kind', p_kind,
    'blurb', p_blurb,
    'unlocked', true,
    'access', 'inventory',
    'contact_name', p_contact_name,
    'contact_email', p_contact_email,
    'contact_phone', p_contact_phone,
    'published', p_published
  );
$$;

revoke all on function private.re_partner_inventory_json(
  uuid, boolean, text, text, text, text, text, text, text, boolean
) from public, anon, authenticated;

-- member_opportunity_feed_begin
create or replace function private.re_member_opportunity_feed(p_member uuid)
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
  from public.re_opportunities
  where is_demo = false
    and published = true;

  show_demo := private.demo_rows_visible('re_opportunities', real_n);

  return coalesce((
    select jsonb_agg(payload order by sort_order, created_at)
    from (
      select
        o.sort_order,
        o.created_at,
        case
-- member_open_call_begin
          when i.status = 'approved' then private.re_opportunity_open_json(
            o.id,
            o.is_demo,
            o.sector,
            o.city,
            o.asset_class,
            o.capital_role,
            o.ticket_band,
            o.one_liner,
            o.foreign_ownership_path,
            o.escrow_off_plan,
            o.title_clarity,
            o.white_land_exposure,
            o.counterparty_name,
            o.terms,
            o.contact_name,
            o.contact_email,
            o.contact_phone,
            o.narrative
          )
-- member_open_call_end
-- member_locked_call_begin
          else private.re_opportunity_locked_json(
            o.id,
            o.is_demo,
            o.sector,
            o.city,
            o.asset_class,
            o.capital_role,
            o.ticket_band,
            o.one_liner,
            o.foreign_ownership_path,
            o.escrow_off_plan,
            o.title_clarity,
            o.white_land_exposure,
            i.status
          )
-- member_locked_call_end
        end as payload
      from public.re_opportunities o
      left join public.re_opportunity_intros i
        on i.opportunity_id = o.id
       and i.member_id = p_member
      where o.published
        and (o.is_demo = false or show_demo)
    ) listed
  ), '[]'::jsonb);
end;
$$;
-- member_opportunity_feed_end

revoke all on function private.re_member_opportunity_feed(uuid) from public, anon, authenticated;

-- sponsor_opportunities_begin
create or replace function private.re_sponsor_opportunities(p_member uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from p_member
     or not exists (
       select 1
       from public.members m
       where m.user_id = p_member
         and m.seat = 'sponsor'
         and m.status in ('invited', 'active')
     ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(payload order by sort_order, created_at)
    from (
      select
        o.sort_order,
        o.created_at,
        private.re_opportunity_inventory_json(
          o.id,
          o.is_demo,
          o.sector,
          o.city,
          o.asset_class,
          o.capital_role,
          o.ticket_band,
          o.one_liner,
          o.foreign_ownership_path,
          o.escrow_off_plan,
          o.title_clarity,
          o.white_land_exposure,
          o.counterparty_name,
          o.terms,
          o.contact_name,
          o.contact_email,
          o.contact_phone,
          o.narrative,
          o.published,
          o.sponsor_member_id
        ) as payload
      from public.re_opportunities o
      where o.sponsor_member_id = p_member
        and o.is_demo = false
    ) listed
  ), '[]'::jsonb);
end;
$$;
-- sponsor_opportunities_end

revoke all on function private.re_sponsor_opportunities(uuid) from public, anon, authenticated;

-- staff_opportunity_inventory_begin
create or replace function private.re_staff_opportunity_inventory()
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
        o.sort_order,
        o.created_at,
        private.re_opportunity_inventory_json(
          o.id,
          o.is_demo,
          o.sector,
          o.city,
          o.asset_class,
          o.capital_role,
          o.ticket_band,
          o.one_liner,
          o.foreign_ownership_path,
          o.escrow_off_plan,
          o.title_clarity,
          o.white_land_exposure,
          o.counterparty_name,
          o.terms,
          o.contact_name,
          o.contact_email,
          o.contact_phone,
          o.narrative,
          o.published,
          o.sponsor_member_id
        ) as payload
      from public.re_opportunities o
    ) listed
  ), '[]'::jsonb);
end;
$$;
-- staff_opportunity_inventory_end

revoke all on function private.re_staff_opportunity_inventory() from public, anon, authenticated;

-- member_partner_feed_begin
create or replace function private.re_member_partner_feed()
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
  if not exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and m.seat in ('ksa', 'intl')
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select count(*)::int into real_n
  from public.re_partners
  where is_demo = false
    and published = true;

  show_demo := private.demo_rows_visible('re_partners', real_n);

  return coalesce((
    select jsonb_agg(
      private.re_partner_locked_json(
        t.id,
        t.is_demo,
        t.category_slug,
        t.name,
        t.kind,
        t.blurb
      )
      order by t.sort_order, t.created_at
    )
    from public.re_partners t
    where t.published
      and (t.is_demo = false or show_demo)
  ), '[]'::jsonb);
end;
$$;
-- member_partner_feed_end

revoke all on function private.re_member_partner_feed() from public, anon, authenticated;

-- sponsor_partners_begin
create or replace function private.re_sponsor_partners(p_member uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from p_member
     or not exists (
       select 1
       from public.members m
       where m.user_id = p_member
         and m.seat = 'sponsor'
         and m.status in ('invited', 'active')
     ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      private.re_partner_inventory_json(
        t.id,
        t.is_demo,
        t.category_slug,
        t.name,
        t.kind,
        t.blurb,
        t.contact_name,
        t.contact_email,
        t.contact_phone,
        t.published
      )
      order by t.sort_order, t.created_at
    )
    from public.re_partners t
    where t.is_demo = false
      and t.published
      and t.category_slug = (
        select s.category_slug
        from public.sponsor_category_seats s
        where s.member_id = p_member
      )
  ), '[]'::jsonb);
end;
$$;
-- sponsor_partners_end

revoke all on function private.re_sponsor_partners(uuid) from public, anon, authenticated;

-- staff_partner_inventory_begin
create or replace function private.re_staff_partner_inventory()
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
    select jsonb_agg(
      private.re_partner_inventory_json(
        t.id,
        t.is_demo,
        t.category_slug,
        t.name,
        t.kind,
        t.blurb,
        t.contact_name,
        t.contact_email,
        t.contact_phone,
        t.published
      )
      order by t.sort_order, t.created_at
    )
    from public.re_partners t
  ), '[]'::jsonb);
end;
$$;
-- staff_partner_inventory_end

revoke all on function private.re_staff_partner_inventory() from public, anon, authenticated;

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

  if seat = 'sponsor' then
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

  if seat = 'sponsor' then
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

-- ADMIN_ALERT_TODO
-- Call site for the notify-admin hook.
-- A separate PR (admin request email alerts, not yet merged) owns that hook.
-- Do not depend on it. This function sends no mail.
create or replace function private.note_re_intro_admin_alert(p_intro_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- ADMIN_ALERT_TODO: invoke the notify-admin hook for p_intro_id here.
  -- That hook is not merged. Do not send mail from this function.
  if p_intro_id is null then
    return;
  end if;
end;
$$;

revoke all on function private.note_re_intro_admin_alert(uuid) from public, anon, authenticated;

create or replace function public.request_re_opportunity_intro(p_opportunity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  real_n int;
  show_demo boolean;
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

  select count(*)::int into real_n
  from public.re_opportunities
  where is_demo = false
    and published = true;

  show_demo := private.demo_rows_visible('re_opportunities', real_n);

  select exists (
    select 1
    from public.re_opportunities o
    where o.id = p_opportunity_id
      and o.published
      and (o.is_demo = false or show_demo)
  ) into visible;

  if not visible then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  insert into public.re_opportunity_intros (opportunity_id, member_id, status)
  values (p_opportunity_id, auth.uid(), 'pending')
  on conflict (opportunity_id, member_id) do nothing
  returning id into new_id;

  -- ADMIN_ALERT_TODO call site. See private.note_re_intro_admin_alert.
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

create or replace function public.staff_list_re_opportunity_intros()
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
      'sector', o.sector,
      'city', o.city,
      'asset_class', o.asset_class,
      'counterparty_name', o.counterparty_name,
      'member_name', coalesce(nullif(trim(p.full_name), ''), 'Member')
    ) order by i.requested_at)
    from public.re_opportunity_intros i
    join public.re_opportunities o on o.id = i.opportunity_id
    left join public.profiles p on p.user_id = i.member_id
    where i.status = 'pending'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_list_re_opportunity_intros() from public, anon;
grant execute on function public.staff_list_re_opportunity_intros() to authenticated;

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

-- admin_save_opportunity_begin
create or replace function public.staff_save_re_opportunity(
  p_id uuid,
  p_published boolean,
  p_sector text,
  p_city text,
  p_asset_class text,
  p_capital_role text,
  p_ticket_band text,
  p_one_liner text,
  p_sponsor_member_id uuid,
  p_counterparty_name text,
  p_terms text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_narrative text,
  p_foreign_ownership_path text,
  p_escrow_off_plan text,
  p_title_clarity text,
  p_white_land_exposure text,
  p_sort_order integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_demo boolean;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_sponsor_member_id is not null and not exists (
    select 1
    from public.members m
    where m.user_id = p_sponsor_member_id
      and m.seat = 'sponsor'
      and m.status in ('invited', 'active')
      and m.is_demo = false
  ) then
    raise exception 'invalid_sponsor' using errcode = '22023';
  end if;

  if p_id is not null then
    select o.is_demo into v_demo
    from public.re_opportunities o
    where o.id = p_id;
    if v_demo is true then
      raise exception 'demo_locked' using errcode = '42501';
    end if;
  end if;

  if p_id is null then
    insert into public.re_opportunities (
      is_demo,
      published,
      sector,
      city,
      asset_class,
      capital_role,
      ticket_band,
      one_liner,
      sponsor_member_id,
      counterparty_name,
      terms,
      contact_name,
      contact_email,
      contact_phone,
      narrative,
      foreign_ownership_path,
      escrow_off_plan,
      title_clarity,
      white_land_exposure,
      sort_order
    ) values (
      false,
      coalesce(p_published, false),
      trim(p_sector),
      trim(p_city),
      trim(p_asset_class),
      trim(p_capital_role),
      trim(p_ticket_band),
      trim(p_one_liner),
      p_sponsor_member_id,
      trim(p_counterparty_name),
      trim(p_terms),
      trim(p_contact_name),
      lower(trim(p_contact_email)),
      trim(p_contact_phone),
      trim(p_narrative),
      trim(p_foreign_ownership_path),
      trim(p_escrow_off_plan),
      trim(p_title_clarity),
      trim(p_white_land_exposure),
      coalesce(p_sort_order, 0)
    )
    returning id into v_id;
  else
    insert into public.re_opportunities (
      id,
      is_demo,
      published,
      sector,
      city,
      asset_class,
      capital_role,
      ticket_band,
      one_liner,
      sponsor_member_id,
      counterparty_name,
      terms,
      contact_name,
      contact_email,
      contact_phone,
      narrative,
      foreign_ownership_path,
      escrow_off_plan,
      title_clarity,
      white_land_exposure,
      sort_order
    ) values (
      p_id,
      false,
      coalesce(p_published, false),
      trim(p_sector),
      trim(p_city),
      trim(p_asset_class),
      trim(p_capital_role),
      trim(p_ticket_band),
      trim(p_one_liner),
      p_sponsor_member_id,
      trim(p_counterparty_name),
      trim(p_terms),
      trim(p_contact_name),
      lower(trim(p_contact_email)),
      trim(p_contact_phone),
      trim(p_narrative),
      trim(p_foreign_ownership_path),
      trim(p_escrow_off_plan),
      trim(p_title_clarity),
      trim(p_white_land_exposure),
      coalesce(p_sort_order, 0)
    )
    on conflict (id) do update set
      is_demo = false,
      published = excluded.published,
      sector = excluded.sector,
      city = excluded.city,
      asset_class = excluded.asset_class,
      capital_role = excluded.capital_role,
      ticket_band = excluded.ticket_band,
      one_liner = excluded.one_liner,
      sponsor_member_id = excluded.sponsor_member_id,
      counterparty_name = excluded.counterparty_name,
      terms = excluded.terms,
      contact_name = excluded.contact_name,
      contact_email = excluded.contact_email,
      contact_phone = excluded.contact_phone,
      narrative = excluded.narrative,
      foreign_ownership_path = excluded.foreign_ownership_path,
      escrow_off_plan = excluded.escrow_off_plan,
      title_clarity = excluded.title_clarity,
      white_land_exposure = excluded.white_land_exposure,
      sort_order = excluded.sort_order,
      updated_at = now()
    returning id into v_id;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
-- admin_save_opportunity_end

revoke all on function public.staff_save_re_opportunity(
  uuid, boolean, text, text, text, text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, integer
) from public, anon;
grant execute on function public.staff_save_re_opportunity(
  uuid, boolean, text, text, text, text, text, text, uuid, text, text, text, text, text, text, text, text, text, text, integer
) to authenticated;

-- admin_save_partner_begin
create or replace function public.staff_save_re_partner(
  p_id uuid,
  p_published boolean,
  p_name text,
  p_kind text,
  p_blurb text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_sort_order integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_demo boolean;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_id is not null then
    select t.is_demo into v_demo
    from public.re_partners t
    where t.id = p_id;
    if v_demo is true then
      raise exception 'demo_locked' using errcode = '42501';
    end if;
  end if;

  if p_id is null then
    insert into public.re_partners (
      is_demo,
      published,
      category_slug,
      name,
      kind,
      blurb,
      contact_name,
      contact_email,
      contact_phone,
      sort_order
    ) values (
      false,
      coalesce(p_published, false),
      'real_estate',
      trim(p_name),
      trim(p_kind),
      trim(p_blurb),
      trim(p_contact_name),
      lower(trim(p_contact_email)),
      trim(p_contact_phone),
      coalesce(p_sort_order, 0)
    )
    returning id into v_id;
  else
    insert into public.re_partners (
      id,
      is_demo,
      published,
      category_slug,
      name,
      kind,
      blurb,
      contact_name,
      contact_email,
      contact_phone,
      sort_order
    ) values (
      p_id,
      false,
      coalesce(p_published, false),
      'real_estate',
      trim(p_name),
      trim(p_kind),
      trim(p_blurb),
      trim(p_contact_name),
      lower(trim(p_contact_email)),
      trim(p_contact_phone),
      coalesce(p_sort_order, 0)
    )
    on conflict (id) do update set
      is_demo = false,
      published = excluded.published,
      category_slug = excluded.category_slug,
      name = excluded.name,
      kind = excluded.kind,
      blurb = excluded.blurb,
      contact_name = excluded.contact_name,
      contact_email = excluded.contact_email,
      contact_phone = excluded.contact_phone,
      sort_order = excluded.sort_order,
      updated_at = now()
    returning id into v_id;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
-- admin_save_partner_end

revoke all on function public.staff_save_re_partner(
  uuid, boolean, text, text, text, text, text, text, integer
) from public, anon;
grant execute on function public.staff_save_re_partner(
  uuid, boolean, text, text, text, text, text, text, integer
) to authenticated;

-- admin_assign_category_begin
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
      and m.seat = 'sponsor'
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

-- demo_seed_begin
insert into public.re_opportunities (
  id, is_demo, published, sector, city, asset_class, capital_role, ticket_band, one_liner,
  sponsor_member_id, counterparty_name, terms, contact_name, contact_email, contact_phone,
  narrative, foreign_ownership_path, escrow_off_plan, title_clarity, white_land_exposure, sort_order
) values
  (
    'b1000001-0000-4000-8000-000000000001',
    true, true,
    'Housing',
    'Riyadh',
    'residential',
    'equity',
    '$10-25m',
    'Equity for a residential block in Riyadh aimed at end users.',
    null,
    'Nahla House Works',
    'Observer seat beside the developer. Structure stays in the Nahla House Works brief.',
    'Amal N.',
    'amal.re@example.com',
    'Desk extension 5101',
    'Nahla House Works is the fictional counterparty on this demo brief. The name, the structure, and the desk stay locked until an admin approves an intro for this member only.',
    'designated_zone',
    'in_place',
    'clear',
    'none',
    1
  ),
  (
    'b1000001-0000-4000-8000-000000000002',
    true, true,
    'Hospitality',
    'Red Sea',
    'hospitality',
    'operator',
    '$25-50m',
    'An operator role beside a hospitality asset on the Red Sea.',
    null,
    'Qitaf Shore Operator',
    'Operator appointment. The agreement stays in the Qitaf Shore Operator brief.',
    'Huda S.',
    'huda.re@example.com',
    'Desk extension 5102',
    'Qitaf Shore Operator is the fictional counterparty. The appointment and the desk stay locked until an admin approves an intro for this member only.',
    'saudi_vehicle',
    'not_off_plan',
    'clear',
    'none',
    2
  ),
  (
    'b1000001-0000-4000-8000-000000000003',
    true, true,
    'Logistics property',
    'Jeddah',
    'industrial/logistics',
    'JV partner',
    '$25-50m',
    'A joint venture for logistics yards serving Jeddah freight.',
    null,
    'Darin Yard Holdings',
    'Joint venture. Governance stays in the Darin Yard Holdings brief.',
    'Tariq D.',
    'tariq.re@example.com',
    'Desk extension 5103',
    'Darin Yard Holdings is the fictional counterparty. The venture terms and the desk stay locked until an admin approves an intro for this member only.',
    'not_stated',
    'not_stated',
    'in_review',
    'none',
    3
  ),
  (
    'b1000001-0000-4000-8000-000000000004',
    true, true,
    'Land',
    'NEOM',
    'land bank',
    'land contribution',
    '$50-100m',
    'Land contributed into a northern land bank beside a giga corridor.',
    null,
    'Safi North Land Desk',
    'Land is the contribution. The schedule stays in the Safi North Land Desk brief.',
    'Nada B.',
    'nada.re@example.com',
    'Desk extension 5104',
    'Safi North Land Desk is the fictional counterparty. The schedule and the desk stay locked until an admin approves an intro for this member only.',
    'not_available',
    'not_off_plan',
    'in_review',
    'exposed',
    4
  ),
  (
    'b1000001-0000-4000-8000-000000000005',
    true, true,
    'Offices',
    'Diriyah',
    'office',
    'sukuk/REIT',
    '$10-25m',
    'A sukuk seat in an office development at Diriyah.',
    null,
    'Rawnaq Office Hold',
    'Sukuk participation. The offering stays in the Rawnaq Office Hold brief.',
    'Reem Q.',
    'reem.re@example.com',
    'Desk extension 5105',
    'Rawnaq Office Hold is the fictional counterparty. The offering and the desk stay locked until an admin approves an intro for this member only.',
    'designated_zone',
    'not_off_plan',
    'clear',
    'not_stated',
    5
  )
on conflict (id) do nothing;

insert into public.re_partners (
  id, is_demo, published, category_slug, name, kind, blurb,
  contact_name, contact_email, contact_phone, sort_order
) values
  (
    'b2000001-0000-4000-8000-000000000001',
    true, true,
    'real_estate',
    'Wahat Title Counsel',
    'law',
    'Counsel on title questions for a private property brief.',
    'Layla W.',
    'layla.re@example.com',
    'Desk extension 5201',
    1
  ),
  (
    'b2000001-0000-4000-8000-000000000002',
    true, true,
    'real_estate',
    'Manar Valuation Desk',
    'valuation',
    'Independent valuation notes for a board brief.',
    'Yusuf M.',
    'yusuf.re@example.com',
    'Desk extension 5202',
    2
  ),
  (
    'b2000001-0000-4000-8000-000000000003',
    true, true,
    'real_estate',
    'Qaf Project Ledger',
    'project finance',
    'Project finance notes for a property brief. Not a public offer.',
    'Faisal Q.',
    'faisal.re@example.com',
    'Desk extension 5203',
    3
  )
on conflict (id) do nothing;
-- demo_seed_end

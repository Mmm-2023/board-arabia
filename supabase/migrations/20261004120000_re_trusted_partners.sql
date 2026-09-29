-- RE6 trusted partners.
-- Extends public.re_partners from 20260929230000. Does not add a second partner table.
-- City is new. A partner stays on the real_estate sponsor category.
-- sponsor_tied is true only when that category has a seat and the row is not a demo.
-- Member reads go through the existing security definer list. The locked JSON has no desk contacts.
-- Demo rows stay locked on staff save.
-- Apply on the live project later. This change does not apply the migration and does not deploy.
-- Edge redeploy: request-re-intro (changed). No new Edge function.
--
-- Order: after 20261003120000_re_regulatory_readiness.sql.

alter table public.re_partners
  add column if not exists city text;

update public.re_partners
set city = case
  when id = 'b2000001-0000-4000-8000-000000000001' then 'Riyadh'
  when id = 'b2000001-0000-4000-8000-000000000002' then 'Jeddah'
  when id = 'b2000001-0000-4000-8000-000000000003' then 'Diriyah'
  else 'other'
end
where city is null;

alter table public.re_partners
  alter column city set not null;

alter table public.re_partners
  drop constraint if exists re_partners_city;

alter table public.re_partners
  add constraint re_partners_city check (city in (
    'Riyadh',
    'Jeddah',
    'NEOM',
    'Red Sea',
    'Qiddiya',
    'Diriyah',
    'ROSHN',
    'other'
  ));

insert into public.re_partners (
  id, is_demo, published, category_slug, name, kind, blurb,
  contact_name, contact_email, contact_phone, city, sort_order
)
select
  'b2000001-0000-4000-8000-000000000004',
  true,
  true,
  'real_estate',
  'Lina Court Works',
  'developer',
  'A developer desk for a private property brief.',
  'Lina C.',
  source.contact_email,
  'Desk line D',
  'Qiddiya',
  4
from public.re_partners source
where source.id = 'b2000001-0000-4000-8000-000000000001'
on conflict (id) do nothing;

insert into public.re_partners (
  id, is_demo, published, category_slug, name, kind, blurb,
  contact_name, contact_email, contact_phone, city, sort_order
)
select
  'b2000001-0000-4000-8000-000000000005',
  true,
  true,
  'real_estate',
  'Hadi Family Desk',
  'broker',
  'A private broker desk for family office property questions.',
  'Hadi F.',
  source.contact_email,
  'Desk line E',
  'ROSHN',
  5
from public.re_partners source
where source.id = 'b2000001-0000-4000-8000-000000000002'
on conflict (id) do nothing;

create table if not exists public.re_partner_intros (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.re_partners (id) on delete cascade,
  member_id uuid not null references public.members (user_id) on delete cascade,
  status text not null,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  constraint re_partner_intros_status check (status in ('pending', 'approved', 'declined')),
  constraint re_partner_intros_unique unique (partner_id, member_id)
);

create index if not exists re_partner_intros_member_idx
  on public.re_partner_intros (member_id);

alter table public.re_partner_intros enable row level security;
alter table public.re_partner_intros force row level security;
revoke all on table public.re_partner_intros from public, anon, authenticated;

revoke all on table public.re_partners from public, anon, authenticated;

-- locked_re_partner_json_v2
create or replace function private.re_partner_locked_json(
  p_id uuid,
  p_is_demo boolean,
  p_category_slug text,
  p_name text,
  p_kind text,
  p_blurb text,
  p_city text,
  p_intro_status text,
  p_sponsor_tied boolean
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
    'city', p_city,
    'blurb', p_blurb,
    'intro_status', p_intro_status,
    'sponsor_tied', p_sponsor_tied,
    'unlocked', false,
    'access', 'locked'
  );
$$;
-- end_locked_re_partner_json_v2

revoke all on function private.re_partner_locked_json(uuid, boolean, text, text, text, text, text, text, boolean)
  from public, anon, authenticated;

create or replace function private.re_partner_inventory_json(
  p_id uuid,
  p_is_demo boolean,
  p_category_slug text,
  p_name text,
  p_kind text,
  p_blurb text,
  p_city text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_published boolean,
  p_sort_order integer,
  p_sponsor_tied boolean
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
    'city', p_city,
    'blurb', p_blurb,
    'unlocked', true,
    'access', 'inventory',
    'contact_name', p_contact_name,
    'contact_email', p_contact_email,
    'contact_phone', p_contact_phone,
    'published', p_published,
    'sort_order', p_sort_order,
    'sponsor_tied', p_sponsor_tied,
    'intro_status', null
  );
$$;

revoke all on function private.re_partner_inventory_json(
  uuid, boolean, text, text, text, text, text, text, text, text, boolean, integer, boolean
) from public, anon, authenticated;

-- member_partner_feed_v2_begin
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
    select jsonb_agg(payload order by sort_order, created_at)
    from (
      select
        t.sort_order,
        t.created_at,
        private.re_partner_locked_json(
          t.id,
          t.is_demo,
          t.category_slug,
          t.name,
          t.kind,
          t.blurb,
          t.city,
          i.status,
          (
            t.is_demo = false
            and exists (
              select 1
              from public.sponsor_category_seats s
              where s.category_slug = t.category_slug
            )
          )
        ) as payload
      from public.re_partners t
      left join public.re_partner_intros i
        on i.partner_id = t.id
       and i.member_id = auth.uid()
      where t.published
        and (t.is_demo = false or show_demo)
    ) listed
  ), '[]'::jsonb);
end;
$$;
-- member_partner_feed_v2_end

revoke all on function private.re_member_partner_feed() from public, anon, authenticated;

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
    select jsonb_agg(payload order by sort_order, created_at)
    from (
      select
        t.sort_order,
        t.created_at,
        private.re_partner_inventory_json(
          t.id,
          t.is_demo,
          t.category_slug,
          t.name,
          t.kind,
          t.blurb,
          t.city,
          t.contact_name,
          t.contact_email,
          t.contact_phone,
          t.published,
          t.sort_order,
          true
        ) as payload
      from public.re_partners t
      where t.is_demo = false
        and t.published
        and t.category_slug = (
          select s.category_slug
          from public.sponsor_category_seats s
          where s.member_id = p_member
        )
    ) listed
  ), '[]'::jsonb);
end;
$$;

revoke all on function private.re_sponsor_partners(uuid) from public, anon, authenticated;

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
    select jsonb_agg(payload order by sort_order, created_at)
    from (
      select
        t.sort_order,
        t.created_at,
        private.re_partner_inventory_json(
          t.id,
          t.is_demo,
          t.category_slug,
          t.name,
          t.kind,
          t.blurb,
          t.city,
          t.contact_name,
          t.contact_email,
          t.contact_phone,
          t.published,
          t.sort_order,
          (
            t.is_demo = false
            and exists (
              select 1
              from public.sponsor_category_seats s
              where s.category_slug = t.category_slug
            )
          )
        ) as payload
      from public.re_partners t
    ) listed
  ), '[]'::jsonb);
end;
$$;

revoke all on function private.re_staff_partner_inventory() from public, anon, authenticated;

drop function if exists private.re_partner_locked_json(uuid, boolean, text, text, text, text);
drop function if exists private.re_partner_inventory_json(uuid, boolean, text, text, text, text, text, text, text, boolean);

drop function if exists public.staff_save_re_partner(uuid, boolean, text, text, text, text, text, text, integer);

-- staff_save_partner_v2_begin
create or replace function public.staff_save_re_partner(
  p_id uuid,
  p_published boolean,
  p_name text,
  p_kind text,
  p_city text,
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
      city,
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
      trim(p_city),
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
      city,
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
      trim(p_city),
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
      city = excluded.city,
      contact_name = excluded.contact_name,
      contact_email = excluded.contact_email,
      contact_phone = excluded.contact_phone,
      sort_order = excluded.sort_order,
      updated_at = now()
    where public.re_partners.is_demo = false
    returning id into v_id;
  end if;

  if v_id is null then
    raise exception 'demo_locked' using errcode = '42501';
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
-- staff_save_partner_v2_end

revoke all on function public.staff_save_re_partner(
  uuid, boolean, text, text, text, text, text, text, text, integer
) from public, anon;
grant execute on function public.staff_save_re_partner(
  uuid, boolean, text, text, text, text, text, text, text, integer
) to authenticated;

create or replace function public.request_re_partner_intro(p_partner_id uuid)
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
  from public.re_partners
  where is_demo = false
    and published = true;

  show_demo := private.demo_rows_visible('re_partners', real_n);

  select exists (
    select 1
    from public.re_partners t
    where t.id = p_partner_id
      and t.published
      and (t.is_demo = false or show_demo)
  ) into visible;

  if not visible then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  insert into public.re_partner_intros (partner_id, member_id, status)
  values (p_partner_id, auth.uid(), 'pending')
  on conflict (partner_id, member_id) do nothing
  returning id into new_id;

  if new_id is not null then
    perform private.note_re_intro_admin_alert(new_id);
  end if;

  select i.status into current_status
  from public.re_partner_intros i
  where i.partner_id = p_partner_id
    and i.member_id = auth.uid();

  return jsonb_build_object('status', current_status);
end;
$$;

revoke all on function public.request_re_partner_intro(uuid) from public, anon;
grant execute on function public.request_re_partner_intro(uuid) to authenticated;

create or replace function public.staff_list_re_partner_intros()
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
      'name', t.name,
      'kind', t.kind,
      'city', t.city,
      'member_name', coalesce(nullif(trim(p.full_name), ''), 'Member')
    ) order by i.requested_at)
    from public.re_partner_intros i
    join public.re_partners t on t.id = i.partner_id
    left join public.profiles p on p.user_id = i.member_id
    where i.status = 'pending'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_list_re_partner_intros() from public, anon;
grant execute on function public.staff_list_re_partner_intros() to authenticated;

create or replace function public.staff_decide_re_partner_intro(
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

  update public.re_partner_intros
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

revoke all on function public.staff_decide_re_partner_intro(uuid, text) from public, anon;
grant execute on function public.staff_decide_re_partner_intro(uuid, text) to authenticated;

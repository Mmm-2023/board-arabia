-- Member real estate appetite (RE8). One row per founding member.
-- Factory does not apply this file. Sasha applies it on the live project.
-- No Edge function in this change. Nothing to redeploy.
--
-- Tags are the same values as re_opportunities and the city check in
-- 20261108120000_re_regions.sql. This file does not add a second taxonomy.
--
-- Members read and write only their own row. Staff read every row for matching.
-- The client uses security definer RPCs. private.is_staff() is the staff check.
-- The list for staff returns a display name only. It does not return email,
-- phone, or a booking link.

create or replace function private.re_ticket_bands()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'Under $10m',
    '$10-25m',
    '$25-50m',
    '$50-100m',
    '$100m and above'
  ]::text[];
$$;

create or replace function private.re_asset_classes()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'residential',
    'hospitality',
    'office',
    'retail',
    'industrial/logistics',
    'mixed-use',
    'land bank',
    'student housing',
    'healthcare RE'
  ]::text[];
$$;

create or replace function private.re_capital_roles()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    'equity',
    'mezzanine',
    'sukuk/REIT',
    'JV partner',
    'land contribution',
    'offtake',
    'operator'
  ]::text[];
$$;

create or replace function private.re_stored_cities()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
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
  ]::text[];
$$;

revoke all on function private.re_ticket_bands() from public, anon;
revoke all on function private.re_asset_classes() from public, anon;
revoke all on function private.re_capital_roles() from public, anon;
revoke all on function private.re_stored_cities() from public, anon;
grant execute on function private.re_ticket_bands() to authenticated, service_role;
grant execute on function private.re_asset_classes() to authenticated, service_role;
grant execute on function private.re_capital_roles() to authenticated, service_role;
grant execute on function private.re_stored_cities() to authenticated, service_role;

create table if not exists public.re_appetite (
  member_id uuid primary key references public.members (user_id) on delete cascade,
  ticket_band text not null,
  cities text[] not null,
  asset_classes text[] not null,
  capital_roles text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.re_appetite drop constraint if exists re_appetite_ticket_band;
alter table public.re_appetite
  add constraint re_appetite_ticket_band
  check (ticket_band = any (private.re_ticket_bands()));

alter table public.re_appetite drop constraint if exists re_appetite_cities_ok;
alter table public.re_appetite
  add constraint re_appetite_cities_ok
  check (
    cardinality(cities) >= 1
    and private.profile_tags_allowed(cities, private.re_stored_cities(), 20)
  );

alter table public.re_appetite drop constraint if exists re_appetite_asset_classes_ok;
alter table public.re_appetite
  add constraint re_appetite_asset_classes_ok
  check (
    cardinality(asset_classes) >= 1
    and private.profile_tags_allowed(asset_classes, private.re_asset_classes(), 9)
  );

alter table public.re_appetite drop constraint if exists re_appetite_capital_roles_ok;
alter table public.re_appetite
  add constraint re_appetite_capital_roles_ok
  check (
    cardinality(capital_roles) >= 1
    and private.profile_tags_allowed(capital_roles, private.re_capital_roles(), 7)
  );

create or replace function private.re_appetite_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.member_id is distinct from old.member_id then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.re_appetite_touch() from public, anon, authenticated;

drop trigger if exists re_appetite_touch on public.re_appetite;
create trigger re_appetite_touch
  before insert or update on public.re_appetite
  for each row execute function private.re_appetite_touch();

alter table public.re_appetite enable row level security;
alter table public.re_appetite force row level security;

revoke all on table public.re_appetite from public, anon;
grant select, insert, update on table public.re_appetite to authenticated;

drop policy if exists re_appetite_select on public.re_appetite;
create policy re_appetite_select
  on public.re_appetite
  for select
  to authenticated
  using (member_id = auth.uid() or private.is_staff());

drop policy if exists re_appetite_insert on public.re_appetite;
create policy re_appetite_insert
  on public.re_appetite
  for insert
  to authenticated
  with check (
    member_id = auth.uid()
    and exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and m.seat in ('ksa', 'intl')
        and m.status in ('invited', 'active')
    )
  );

drop policy if exists re_appetite_update on public.re_appetite;
create policy re_appetite_update
  on public.re_appetite
  for update
  to authenticated
  using (member_id = auth.uid())
  with check (
    member_id = auth.uid()
    and exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and m.seat in ('ksa', 'intl')
        and m.status in ('invited', 'active')
    )
  );

create or replace function private.re_appetite_json(
  p_ticket_band text,
  p_cities text[],
  p_asset_classes text[],
  p_capital_roles text[]
) returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'ticket_band', p_ticket_band,
    'cities', to_jsonb(p_cities),
    'asset_classes', to_jsonb(p_asset_classes),
    'capital_roles', to_jsonb(p_capital_roles)
  );
$$;

revoke all on function private.re_appetite_json(text, text[], text[], text[]) from public, anon, authenticated;

create or replace function private.re_appetite_input_ok(
  p_ticket_band text,
  p_cities text[],
  p_asset_classes text[],
  p_capital_roles text[]
) returns boolean
language sql
immutable
set search_path = public
as $$
  select
    p_ticket_band = any (private.re_ticket_bands())
    and cardinality(coalesce(p_cities, '{}')) >= 1
    and private.profile_tags_allowed(coalesce(p_cities, '{}'), private.re_stored_cities(), 20)
    and cardinality(coalesce(p_asset_classes, '{}')) >= 1
    and private.profile_tags_allowed(coalesce(p_asset_classes, '{}'), private.re_asset_classes(), 9)
    and cardinality(coalesce(p_capital_roles, '{}')) >= 1
    and private.profile_tags_allowed(coalesce(p_capital_roles, '{}'), private.re_capital_roles(), 7);
$$;

revoke all on function private.re_appetite_input_ok(text, text[], text[], text[]) from public, anon, authenticated;

create or replace function public.get_my_re_appetite()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  found_row public.re_appetite%rowtype;
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

  select a.* into found_row
  from public.re_appetite a
  where a.member_id = auth.uid();

  if not found then
    return null;
  end if;

  return private.re_appetite_json(
    found_row.ticket_band,
    found_row.cities,
    found_row.asset_classes,
    found_row.capital_roles
  );
end;
$$;

revoke all on function public.get_my_re_appetite() from public, anon;
grant execute on function public.get_my_re_appetite() to authenticated;

create or replace function public.save_my_re_appetite(
  p_ticket_band text,
  p_cities text[],
  p_asset_classes text[],
  p_capital_roles text[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved public.re_appetite%rowtype;
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

  if not private.re_appetite_input_ok(p_ticket_band, p_cities, p_asset_classes, p_capital_roles) then
    raise exception 'invalid_appetite' using errcode = '22023';
  end if;

  insert into public.re_appetite (member_id, ticket_band, cities, asset_classes, capital_roles)
  values (auth.uid(), p_ticket_band, p_cities, p_asset_classes, p_capital_roles)
  on conflict (member_id) do update
    set ticket_band = excluded.ticket_band,
        cities = excluded.cities,
        asset_classes = excluded.asset_classes,
        capital_roles = excluded.capital_roles
  returning * into saved;

  return private.re_appetite_json(saved.ticket_band, saved.cities, saved.asset_classes, saved.capital_roles);
end;
$$;

revoke all on function public.save_my_re_appetite(text, text[], text[], text[]) from public, anon;
grant execute on function public.save_my_re_appetite(text, text[], text[], text[]) to authenticated;

create or replace function public.staff_list_re_appetites()
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
      'member_id', a.member_id,
      'member_name', coalesce(nullif(trim(p.full_name), ''), 'Member'),
      'ticket_band', a.ticket_band,
      'cities', to_jsonb(a.cities),
      'asset_classes', to_jsonb(a.asset_classes),
      'capital_roles', to_jsonb(a.capital_roles)
    ) order by a.updated_at desc, a.member_id)
    from public.re_appetite a
    left join public.profiles p on p.user_id = a.member_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_list_re_appetites() from public, anon;
grant execute on function public.staff_list_re_appetites() to authenticated;

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
      'member_name', coalesce(nullif(trim(p.full_name), ''), 'Member'),
      'appetite', (
        select private.re_appetite_json(a.ticket_band, a.cities, a.asset_classes, a.capital_roles)
        from public.re_appetite a
        where a.member_id = i.member_id
      )
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

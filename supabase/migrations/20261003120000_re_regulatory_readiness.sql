-- RE5 regulatory readiness.
-- The four checks already live on re_opportunities. This migration gives each
-- check one status: ready, in_progress, not_yet, not_applicable.
-- It does not add a second readiness column.
-- Locked, open, and inventory JSON already pass these columns through
-- list_re_opportunities. Counterparty and terms stay out of the locked builder.
-- This file does not grant table access and does not weaken RLS.

alter table public.re_opportunities
  drop constraint if exists re_opportunities_foreign_ownership_path,
  drop constraint if exists re_opportunities_escrow_off_plan,
  drop constraint if exists re_opportunities_title_clarity,
  drop constraint if exists re_opportunities_white_land_exposure;

update public.re_opportunities
set
  foreign_ownership_path = case foreign_ownership_path
    when 'designated_zone' then 'ready'
    when 'saudi_vehicle' then 'ready'
    when 'not_available' then 'not_yet'
    when 'not_stated' then 'not_yet'
    else foreign_ownership_path
  end,
  escrow_off_plan = case escrow_off_plan
    when 'in_place' then 'ready'
    when 'not_off_plan' then 'not_applicable'
    when 'not_stated' then 'not_yet'
    else escrow_off_plan
  end,
  title_clarity = case title_clarity
    when 'clear' then 'ready'
    when 'in_review' then 'in_progress'
    when 'not_stated' then 'not_yet'
    else title_clarity
  end,
  white_land_exposure = case white_land_exposure
    when 'none' then 'ready'
    when 'exposed' then 'not_yet'
    when 'not_stated' then 'not_yet'
    else white_land_exposure
  end;

alter table public.re_opportunities
  add constraint re_opportunities_foreign_ownership_path check (foreign_ownership_path in (
    'ready', 'in_progress', 'not_yet', 'not_applicable'
  )),
  add constraint re_opportunities_escrow_off_plan check (escrow_off_plan in (
    'ready', 'in_progress', 'not_yet', 'not_applicable'
  )),
  add constraint re_opportunities_title_clarity check (title_clarity in (
    'ready', 'in_progress', 'not_yet', 'not_applicable'
  )),
  add constraint re_opportunities_white_land_exposure check (white_land_exposure in (
    'ready', 'in_progress', 'not_yet', 'not_applicable'
  ));

-- Demo cards after the map above:
-- Housing Riyadh: ready, ready, ready, ready
-- Hospitality Red Sea: ready, not_applicable, ready, ready
-- Logistics Jeddah: not_yet, not_yet, in_progress, ready
-- Land NEOM: not_yet, not_applicable, in_progress, not_yet
-- Offices Diriyah: ready, not_applicable, ready, not_yet

create or replace function public.staff_set_re_opportunity_readiness(
  p_id uuid,
  p_foreign_ownership_path text,
  p_escrow_off_plan text,
  p_title_clarity text,
  p_white_land_exposure text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_foreign text := trim(p_foreign_ownership_path);
  v_escrow text := trim(p_escrow_off_plan);
  v_title text := trim(p_title_clarity);
  v_land text := trim(p_white_land_exposure);
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if v_foreign not in ('ready', 'in_progress', 'not_yet', 'not_applicable')
     or v_escrow not in ('ready', 'in_progress', 'not_yet', 'not_applicable')
     or v_title not in ('ready', 'in_progress', 'not_yet', 'not_applicable')
     or v_land not in ('ready', 'in_progress', 'not_yet', 'not_applicable')
  then
    raise exception 'invalid_readiness' using errcode = '22023';
  end if;

  update public.re_opportunities
  set foreign_ownership_path = v_foreign,
      escrow_off_plan = v_escrow,
      title_clarity = v_title,
      white_land_exposure = v_land,
      updated_at = now()
  where id = p_id
    and is_demo = false;

  if not found then
    if exists (
      select 1
      from public.re_opportunities
      where id = p_id
        and is_demo = true
    ) then
      raise exception 'demo_locked' using errcode = '42501';
    end if;
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

revoke all on function public.staff_set_re_opportunity_readiness(uuid, text, text, text, text) from public, anon;
grant execute on function public.staff_set_re_opportunity_readiness(uuid, text, text, text, text) to authenticated;

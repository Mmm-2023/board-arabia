-- Landing preview deals and quiet money floors.
-- Runs after 20260929120000_demo_seed_thresholds_redaction.sql.
-- Michael (or the live project operator) applies this file. The agent does not.
-- No Edge function change.

alter table public.demo_thresholds
  add column if not exists floor_investment_usd numeric not null default 100000000,
  add column if not exists floor_fo_aum_usd numeric not null default 1000000000,
  add column if not exists floor_turnover_usd numeric not null default 500000000;

alter table public.demo_thresholds
  drop constraint if exists demo_thresholds_floors_nonneg;

alter table public.demo_thresholds
  add constraint demo_thresholds_floors_nonneg check (
    floor_investment_usd >= 0
    and floor_fo_aum_usd >= 0
    and floor_turnover_usd >= 0
  );

-- landing_preview_deals
-- Clear fields only: sector, ask (one_liner), status (stage), and the demo flag.
-- Real published mandates replace samples at the existing mandates threshold.
create or replace function public.list_landing_preview_deals()
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
  select count(*)::int into real_n
  from public.mandates
  where is_demo = false
    and published = true;

  show_demo := private.demo_rows_visible('mandates', real_n);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', picked.id,
      'is_demo', picked.is_demo,
      'sector', picked.sector,
      'ask', picked.one_liner,
      'status', picked.stage
    ) order by picked.sort_order, picked.created_at)
    from (
      select m.id, m.is_demo, m.sector, m.one_liner, m.stage, m.sort_order, m.created_at
      from public.mandates m
      where m.published
        and (
          (show_demo and m.is_demo)
          or ((not show_demo) and m.is_demo = false)
        )
      order by m.sort_order, m.created_at
      limit 3
    ) picked
  ), '[]'::jsonb);
end;
$$;
-- end_landing_preview_deals

revoke all on function public.list_landing_preview_deals() from public;
grant execute on function public.list_landing_preview_deals() to anon, authenticated;

-- quiet_floors
-- Display is greatest(published sum, floor). Null published sums count as 0.
-- Seat counts are the live row. They are not passed through greatest().
create or replace function public.landing_platform_totals()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'investment_usd', greatest(coalesce(s.investment_capability_usd, 0), t.floor_investment_usd),
    'fo_aum_usd', greatest(coalesce(s.fo_aum_usd, 0), t.floor_fo_aum_usd),
    'turnover_usd', greatest(coalesce(s.turnover_usd, 0), t.floor_turnover_usd),
    'founding_admitted_count', s.founding_admitted_count,
    'founding_ksa_count', s.founding_ksa_count,
    'founding_intl_count', s.founding_intl_count,
    'updated_at', s.updated_at
  )
  from public.demo_thresholds t
  left join public.platform_stats s on s.id = 1
  where t.id = 1;
$$;
-- end_quiet_floors

revoke all on function public.landing_platform_totals() from public;
grant execute on function public.landing_platform_totals() to anon, authenticated;

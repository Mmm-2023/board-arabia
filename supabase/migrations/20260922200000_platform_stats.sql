-- Public aggregate counters.
-- Apply on Supabase project iirqbizwanyhgkhanntq (SQL editor or supabase db push)
-- before deploying the updated submit-application and admit-member functions.
--
-- This migration does not insert members, applications, or invented totals.
-- platform_stats starts empty: money columns null, seat counts 0.
--
-- Who counts
--   Seats: members.status in ('invited', 'active'). 'invited' is an admitted
--   seat that has not finished password setup. 'suspended' is excluded.
--   Money: those same members, plus profiles.capacity_verified
--   and profiles.include_in_public_aggregates, and a figure greater than 0.
--   Each money column is null until that metric has at least 5 contributors.
--   With 5 to 9 contributors the stored figure is rounded to the nearest $5m.
--   From 10 contributors it is rounded to the nearest $1m.
--   Exact sums are not stored.

alter table public.applications
  add column if not exists investable_capacity_usd numeric,
  add column if not exists include_in_public_aggregates boolean not null default true;

alter table public.applications drop constraint if exists applications_investable_capacity_usd_check;
alter table public.applications
  add constraint applications_investable_capacity_usd_check
  check (
    investable_capacity_usd is null
    or (investable_capacity_usd >= 0 and investable_capacity_usd <= 1000000000000)
  );

drop policy if exists applications_insert_anon on public.applications;
create policy applications_insert_anon on public.applications
  for insert to anon, authenticated
  with check (
    status = 'pending'
    and full_name is not null and length(trim(full_name)) > 0 and length(trim(full_name)) <= 200
    and email is not null and length(trim(email)) > 0 and length(trim(email)) <= 320
    and linkedin_url is not null and length(trim(linkedin_url)) > 0 and length(trim(linkedin_url)) <= 500
    and job_titles is not null and length(trim(job_titles)) > 0 and length(trim(job_titles)) <= 2000
    and companies is not null and length(trim(companies)) > 0 and length(trim(companies)) <= 4000
    and (
      (turnover is not null and length(trim(turnover)) > 0)
      or (fo_aum is not null and length(trim(fo_aum)) > 0)
    )
    and (
      investable_capacity_usd is null
      or (investable_capacity_usd >= 0 and investable_capacity_usd <= 1000000000000)
    )
    and include_in_public_aggregates is not null
    and invite_event_id is null
    and invite_sent_at is null
    and decision_at is null
    and decision_by is null
    and founding_seat is null
    and member_user_id is null
    and admitted_at is null
    and admitted_by is null
  );

alter table public.profiles
  add column if not exists investable_capacity_usd numeric,
  add column if not exists fo_aum_usd numeric,
  add column if not exists turnover_usd numeric,
  add column if not exists capacity_currency text not null default 'USD',
  add column if not exists include_in_public_aggregates boolean not null default true,
  add column if not exists capacity_verified boolean not null default false;

alter table public.profiles drop constraint if exists profiles_investable_capacity_usd_check;
alter table public.profiles
  add constraint profiles_investable_capacity_usd_check
  check (
    investable_capacity_usd is null
    or (investable_capacity_usd >= 0 and investable_capacity_usd <= 1000000000000)
  );

alter table public.profiles drop constraint if exists profiles_fo_aum_usd_check;
alter table public.profiles
  add constraint profiles_fo_aum_usd_check
  check (
    fo_aum_usd is null
    or (fo_aum_usd >= 0 and fo_aum_usd <= 1000000000000)
  );

alter table public.profiles drop constraint if exists profiles_turnover_usd_check;
alter table public.profiles
  add constraint profiles_turnover_usd_check
  check (
    turnover_usd is null
    or (turnover_usd >= 0 and turnover_usd <= 1000000000000)
  );

alter table public.profiles drop constraint if exists profiles_capacity_currency_check;
alter table public.profiles
  add constraint profiles_capacity_currency_check
  check (capacity_currency = 'USD');

grant select (
  investable_capacity_usd,
  fo_aum_usd,
  turnover_usd,
  capacity_currency,
  include_in_public_aggregates,
  capacity_verified
) on table public.profiles to authenticated;

grant update (include_in_public_aggregates) on table public.profiles to authenticated;

drop policy if exists profiles_select_staff on public.profiles;
create policy profiles_select_staff on public.profiles
  for select to authenticated
  using (exists (select 1 from public.staff_users s where s.user_id = auth.uid()));

create or replace function private.assert_capacity_amount(amount numeric)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
begin
  if amount is null then
    return null;
  end if;
  if amount < 0 or amount > 1000000000000 then
    raise exception 'invalid_capacity' using errcode = '22023';
  end if;
  return amount;
end;
$$;

revoke all on function private.assert_capacity_amount(numeric) from public, anon, authenticated;

create or replace function private.round_public_usd(amount numeric, contributors int)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when contributors < 5 or amount is null then null
    when contributors < 10 then round(amount / 5000000) * 5000000
    else round(amount / 1000000) * 1000000
  end;
$$;

revoke all on function private.round_public_usd(numeric, int) from public, anon, authenticated;

create table if not exists public.platform_stats (
  id int primary key default 1,
  investment_capability_usd numeric,
  fo_aum_usd numeric,
  turnover_usd numeric,
  founding_admitted_count int not null default 0,
  founding_ksa_count int not null default 0,
  founding_intl_count int not null default 0,
  contributors_investment_n int not null default 0,
  contributors_fo_n int not null default 0,
  contributors_turnover_n int not null default 0,
  updated_at timestamptz not null default now(),
  constraint platform_stats_singleton check (id = 1),
  constraint platform_stats_investment_nonneg check (
    investment_capability_usd is null or investment_capability_usd >= 0
  ),
  constraint platform_stats_fo_nonneg check (fo_aum_usd is null or fo_aum_usd >= 0),
  constraint platform_stats_turnover_nonneg check (turnover_usd is null or turnover_usd >= 0),
  constraint platform_stats_counts_nonneg check (
    founding_admitted_count >= 0
    and founding_ksa_count >= 0
    and founding_intl_count >= 0
    and contributors_investment_n >= 0
    and contributors_fo_n >= 0
    and contributors_turnover_n >= 0
  )
);

insert into public.platform_stats (id)
values (1)
on conflict (id) do nothing;

alter table public.platform_stats enable row level security;
alter table public.platform_stats force row level security;

revoke all on table public.platform_stats from public, anon, authenticated;
grant select on table public.platform_stats to anon, authenticated;

drop policy if exists platform_stats_select_public on public.platform_stats;
create policy platform_stats_select_public on public.platform_stats
  for select to anon, authenticated
  using (true);

create or replace function private.recompute_platform_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  seat_n int;
  ksa_n int;
  intl_n int;
  invest_sum numeric;
  invest_n int;
  fo_sum numeric;
  fo_n int;
  turn_sum numeric;
  turn_n int;
begin
  select
    count(*)::int,
    count(*) filter (where m.seat = 'ksa')::int,
    count(*) filter (where m.seat = 'intl')::int
  into seat_n, ksa_n, intl_n
  from public.members m
  where m.status in ('invited', 'active');

  select
    coalesce(sum(p.investable_capacity_usd), 0),
    count(*)::int
  into invest_sum, invest_n
  from public.members m
  join public.profiles p on p.user_id = m.user_id
  where m.status in ('invited', 'active')
    and p.capacity_verified
    and p.include_in_public_aggregates
    and p.investable_capacity_usd is not null
    and p.investable_capacity_usd > 0;

  select
    coalesce(sum(p.fo_aum_usd), 0),
    count(*)::int
  into fo_sum, fo_n
  from public.members m
  join public.profiles p on p.user_id = m.user_id
  where m.status in ('invited', 'active')
    and p.capacity_verified
    and p.include_in_public_aggregates
    and p.fo_aum_usd is not null
    and p.fo_aum_usd > 0;

  select
    coalesce(sum(p.turnover_usd), 0),
    count(*)::int
  into turn_sum, turn_n
  from public.members m
  join public.profiles p on p.user_id = m.user_id
  where m.status in ('invited', 'active')
    and p.capacity_verified
    and p.include_in_public_aggregates
    and p.turnover_usd is not null
    and p.turnover_usd > 0;

  insert into public.platform_stats (
    id,
    investment_capability_usd,
    fo_aum_usd,
    turnover_usd,
    founding_admitted_count,
    founding_ksa_count,
    founding_intl_count,
    contributors_investment_n,
    contributors_fo_n,
    contributors_turnover_n,
    updated_at
  ) values (
    1,
    private.round_public_usd(invest_sum, invest_n),
    private.round_public_usd(fo_sum, fo_n),
    private.round_public_usd(turn_sum, turn_n),
    seat_n,
    ksa_n,
    intl_n,
    invest_n,
    fo_n,
    turn_n,
    now()
  )
  on conflict (id) do update set
    investment_capability_usd = excluded.investment_capability_usd,
    fo_aum_usd = excluded.fo_aum_usd,
    turnover_usd = excluded.turnover_usd,
    founding_admitted_count = excluded.founding_admitted_count,
    founding_ksa_count = excluded.founding_ksa_count,
    founding_intl_count = excluded.founding_intl_count,
    contributors_investment_n = excluded.contributors_investment_n,
    contributors_fo_n = excluded.contributors_fo_n,
    contributors_turnover_n = excluded.contributors_turnover_n,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function private.recompute_platform_stats() from public, anon, authenticated;

create or replace function private.touch_platform_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.recompute_platform_stats();
  return null;
end;
$$;

revoke all on function private.touch_platform_stats() from public, anon, authenticated;

drop trigger if exists profiles_touch_platform_stats on public.profiles;
create trigger profiles_touch_platform_stats
  after insert or update or delete on public.profiles
  for each statement execute function private.touch_platform_stats();

drop trigger if exists members_touch_platform_stats on public.members;
create trigger members_touch_platform_stats
  after insert or update or delete on public.members
  for each statement execute function private.touch_platform_stats();

create or replace function private.protect_profile_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if auth.uid() is distinct from old.user_id and exists (
    select 1 from public.staff_users s where s.user_id = auth.uid()
  ) then
    return new;
  end if;

  new.investable_capacity_usd := old.investable_capacity_usd;
  new.fo_aum_usd := old.fo_aum_usd;
  new.turnover_usd := old.turnover_usd;
  new.capacity_currency := old.capacity_currency;
  new.capacity_verified := old.capacity_verified;
  return new;
end;
$$;

revoke all on function private.protect_profile_capacity() from public, anon, authenticated;

drop trigger if exists profiles_protect_capacity on public.profiles;
create trigger profiles_protect_capacity
  before update on public.profiles
  for each row execute function private.protect_profile_capacity();

create or replace function public.staff_set_member_capacity(
  p_user_id uuid,
  p_investable_capacity_usd numeric,
  p_fo_aum_usd numeric,
  p_turnover_usd numeric,
  p_include_in_public_aggregates boolean,
  p_capacity_verified boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.staff_users s where s.user_id = auth.uid()
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_user_id is null or not exists (
    select 1 from public.members m where m.user_id = p_user_id
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  update public.profiles
  set
    investable_capacity_usd = private.assert_capacity_amount(p_investable_capacity_usd),
    fo_aum_usd = private.assert_capacity_amount(p_fo_aum_usd),
    turnover_usd = private.assert_capacity_amount(p_turnover_usd),
    capacity_currency = 'USD',
    include_in_public_aggregates = coalesce(p_include_in_public_aggregates, true),
    capacity_verified = coalesce(p_capacity_verified, false)
  where user_id = p_user_id;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.staff_set_member_capacity(uuid, numeric, numeric, numeric, boolean, boolean)
  from public, anon;
grant execute on function public.staff_set_member_capacity(uuid, numeric, numeric, numeric, boolean, boolean)
  to authenticated;

drop function if exists public.claim_founding_seat(uuid, uuid, text, text, uuid, text, text, text, text, text);

create function public.claim_founding_seat(
  p_user_id uuid,
  p_application_id uuid,
  p_email text,
  p_seat text,
  p_invited_by uuid,
  p_full_name text,
  p_phone text,
  p_linkedin_url text,
  p_company text,
  p_headline text,
  p_investable_capacity_usd numeric default null,
  p_fo_aum_usd numeric default null,
  p_turnover_usd numeric default null,
  p_include_in_public_aggregates boolean default true,
  p_capacity_verified boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  taken int;
  app_email text;
  app_status text;
  investable numeric;
  fo_aum numeric;
  turnover numeric;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_seat not in ('ksa', 'intl') then
    raise exception 'invalid_seat' using errcode = '22023';
  end if;

  if p_user_id is null or p_application_id is null or p_invited_by is null then
    raise exception 'not_admissible' using errcode = '22023';
  end if;

  if p_email is null or char_length(trim(p_email)) < 3 then
    raise exception 'not_admissible' using errcode = '22023';
  end if;

  investable := private.assert_capacity_amount(p_investable_capacity_usd);
  fo_aum := private.assert_capacity_amount(p_fo_aum_usd);
  turnover := private.assert_capacity_amount(p_turnover_usd);

  perform pg_advisory_xact_lock(hashtext('board-arabia-seat-' || p_seat));

  select lower(trim(email)), status
    into app_email, app_status
  from public.applications
  where id = p_application_id
  for update;

  if app_email is null or app_status not in ('accepted', 'verified') then
    raise exception 'not_admissible' using errcode = '22023';
  end if;

  if app_email is distinct from lower(trim(p_email)) then
    raise exception 'not_admissible' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.members m
    where m.user_id = p_user_id
      or m.application_id = p_application_id
      or lower(m.email) = lower(trim(p_email))
  ) then
    raise exception 'already_member' using errcode = '23505';
  end if;

  select count(*) into taken
  from public.members
  where seat = p_seat
    and status in ('invited', 'active');

  if taken >= 50 then
    raise exception 'seat_full' using errcode = '23514';
  end if;

  insert into public.members (
    user_id, application_id, email, seat, status, must_set_password, invited_by
  ) values (
    p_user_id,
    p_application_id,
    lower(trim(p_email)),
    p_seat,
    'invited',
    true,
    p_invited_by
  );

  insert into public.profiles (
    user_id,
    full_name,
    phone,
    linkedin_url,
    company,
    headline,
    investable_capacity_usd,
    fo_aum_usd,
    turnover_usd,
    capacity_currency,
    include_in_public_aggregates,
    capacity_verified
  ) values (
    p_user_id,
    p_full_name,
    p_phone,
    p_linkedin_url,
    p_company,
    p_headline,
    investable,
    fo_aum,
    turnover,
    'USD',
    coalesce(p_include_in_public_aggregates, true),
    coalesce(p_capacity_verified, false)
  );

  update public.applications
  set status = 'admitted',
      founding_seat = p_seat,
      member_user_id = p_user_id,
      admitted_at = now(),
      admitted_by = p_invited_by,
      updated_at = now()
  where id = p_application_id
    and status in ('accepted', 'verified');

  if not found then
    raise exception 'not_admissible' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.claim_founding_seat(
  uuid, uuid, text, text, uuid, text, text, text, text, text, numeric, numeric, numeric, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.claim_founding_seat(
  uuid, uuid, text, text, uuid, text, text, text, text, text, numeric, numeric, numeric, boolean, boolean
) to service_role;

select private.recompute_platform_stats();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'platform_stats'
    ) then
      alter publication supabase_realtime add table public.platform_stats;
    end if;
  end if;
end $$;

-- Multi-tier membership. One array on members, not a join table.
-- A person holds a small closed set (Founding, Member, Sponsor; Partner later).
-- Invalid combinations are a row check. Capacity and the legacy tier column
-- stay on the same row, so readers do not need another join or another RLS policy.
--
-- Legacy members.tier stays readable:
--   founding in the set -> founding
--   else member in the set -> member
--   else sponsor only -> founding, with no founding number
-- Pure sponsors have always stored tier founding and no number, so Home stays blank.
-- Capacity counts read the set, not that fallback.
--
-- Founding and Member cannot combine. Sponsor can combine with either.
-- Adding Partner is private.membership_tier_catalog() plus the same client list.
-- The founding/member exclusion stays in private.membership_tiers_valid.
--
-- Founding still takes the next free number in 1..100 and a seat in the
-- 50/50 region split. Removing Founding clears the number.
-- claim_founding_seat stays the single 17-arg overload.
-- No Edge function source changes in this migration.

create or replace function private.membership_tier_catalog()
returns text[]
language sql
immutable
as $$
  select array['founding', 'member', 'sponsor']::text[];
$$;

revoke all on function private.membership_tier_catalog() from public, anon, service_role;
grant execute on function private.membership_tier_catalog() to authenticated;

create or replace function private.normalize_membership_tiers(p_tiers text[])
returns text[]
language sql
immutable
as $$
  select coalesce(
    (
      select array_agg(s.t order by array_position(private.membership_tier_catalog(), s.t))
      from (
        select distinct u.t
        from unnest(coalesce(p_tiers, array[]::text[])) as u(t)
        where u.t = any (private.membership_tier_catalog())
      ) s
    ),
    array[]::text[]
  );
$$;

revoke all on function private.normalize_membership_tiers(text[]) from public, anon, service_role;
grant execute on function private.normalize_membership_tiers(text[]) to authenticated;

create or replace function private.membership_tiers_valid(p_tiers text[])
returns boolean
language sql
immutable
as $$
  select p_tiers is not null
    and cardinality(p_tiers) >= 1
    and p_tiers = private.normalize_membership_tiers(p_tiers)
    and not ('founding' = any (p_tiers) and 'member' = any (p_tiers));
$$;

revoke all on function private.membership_tiers_valid(text[]) from public, anon, service_role;
grant execute on function private.membership_tiers_valid(text[]) to authenticated;

alter table public.members
  add column if not exists tiers text[];

-- Idempotent. A second run does not overwrite a set staff already saved.
update public.members
set tiers = case
  when seat = 'sponsor' and founding_number is not null then array['founding', 'sponsor']::text[]
  when seat = 'sponsor' and tier = 'member' then array['member', 'sponsor']::text[]
  when seat = 'sponsor' then array['sponsor']::text[]
  when tier = 'member' then array['member']::text[]
  else array['founding']::text[]
end
where tiers is null;

alter table public.members
  alter column tiers set not null;

alter table public.members drop constraint if exists members_tiers_check;
alter table public.members
  add constraint members_tiers_check
  check (private.membership_tiers_valid(tiers));

grant select (tiers) on table public.members to authenticated;

create or replace function private.sync_member_tiers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tiers is null or cardinality(new.tiers) = 0 then
    if new.seat = 'sponsor' and new.founding_number is not null then
      new.tiers := array['founding', 'sponsor']::text[];
    elsif new.seat = 'sponsor' and new.tier = 'member' then
      new.tiers := array['member', 'sponsor']::text[];
    elsif new.seat = 'sponsor' then
      new.tiers := array['sponsor']::text[];
    elsif new.tier = 'member' then
      new.tiers := array['member']::text[];
    else
      new.tiers := array['founding']::text[];
    end if;
  end if;

  new.tiers := private.normalize_membership_tiers(new.tiers);

  if not ('founding' = any (new.tiers)) then
    new.founding_number := null;
  end if;

  if 'founding' = any (new.tiers) then
    new.tier := 'founding';
  elsif 'member' = any (new.tiers) then
    new.tier := 'member';
  else
    new.tier := 'founding';
  end if;

  return new;
end;
$$;

revoke all on function private.sync_member_tiers() from public, anon, authenticated, service_role;

drop trigger if exists members_before_sync_tiers on public.members;
create trigger members_before_sync_tiers
  before insert or update on public.members
  for each row execute function private.sync_member_tiers();

create table if not exists public.member_tier_audits (
  id uuid primary key default gen_random_uuid(),
  member_user_id uuid not null references public.members(user_id) on delete cascade,
  actor_id uuid not null,
  before_tiers text[] not null,
  after_tiers text[] not null,
  created_at timestamptz not null default now()
);

create index if not exists member_tier_audits_member_idx
  on public.member_tier_audits (member_user_id, created_at desc);

alter table public.member_tier_audits enable row level security;
alter table public.member_tier_audits force row level security;

drop policy if exists member_tier_audits_select_staff on public.member_tier_audits;
create policy member_tier_audits_select_staff
  on public.member_tier_audits
  for select to authenticated
  using (private.is_staff());

revoke all on table public.member_tier_audits from public, anon, authenticated;
grant select on table public.member_tier_audits to authenticated;

create or replace function private.founding_region_taken(p_seat text, p_except uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.members m
  where m.seat = p_seat
    and m.status in ('invited', 'active')
    and m.is_demo = false
    and 'founding' = any (m.tiers)
    and (p_except is null or m.user_id is distinct from p_except);
$$;

revoke all on function private.founding_region_taken(text, uuid) from public, anon, authenticated, service_role;

create or replace function private.next_founding_number()
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  next_no int;
begin
  select n into next_no
  from generate_series(1, 100) as n
  where not exists (
    select 1 from public.members m where m.founding_number = n
  )
  order by n
  limit 1;

  if next_no is null then
    raise exception 'founding_numbers_full' using errcode = '23514';
  end if;

  return next_no::smallint;
end;
$$;

revoke all on function private.next_founding_number() from public, anon, authenticated, service_role;

create or replace function private.founding_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    if auth.uid() is null
       or (
         not exists (
           select 1 from public.members m
           where m.user_id = auth.uid()
             and m.status in ('invited', 'active')
         )
         and not private.is_staff()
       ) then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
  end if;

  return (
    select jsonb_build_object(
      'ksa', count(*) filter (
        where seat = 'ksa' and status in ('invited', 'active') and is_demo = false and 'founding' = any (tiers)
      ),
      'intl', count(*) filter (
        where seat = 'intl' and status in ('invited', 'active') and is_demo = false and 'founding' = any (tiers)
      ),
      'ksa_cap', 50,
      'intl_cap', 50,
      'total_cap', 100
    )
    from public.members
  );
end;
$$;

revoke all on function private.founding_counts() from public, anon;
grant execute on function private.founding_counts() to authenticated, service_role;

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
    count(*) filter (where m.seat in ('ksa', 'intl'))::int,
    count(*) filter (where m.seat = 'ksa')::int,
    count(*) filter (where m.seat = 'intl')::int
  into seat_n, ksa_n, intl_n
  from public.members m
  where m.status in ('invited', 'active')
    and m.is_demo = false
    and 'founding' = any (m.tiers);

  select
    coalesce(sum(p.investable_capacity_usd), 0),
    count(*)::int
  into invest_sum, invest_n
  from public.members m
  join public.profiles p on p.user_id = m.user_id
  where m.status in ('invited', 'active')
    and m.is_demo = false
    and m.seat in ('ksa', 'intl')
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
    and m.is_demo = false
    and m.seat in ('ksa', 'intl')
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
    and m.is_demo = false
    and m.seat in ('ksa', 'intl')
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

create or replace function private.guard_sponsor_cap()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  taken int;
begin
  if not ('sponsor' = any (coalesce(new.tiers, array[]::text[])) or new.seat = 'sponsor') then
    return new;
  end if;
  if new.status not in ('invited', 'active') then
    return new;
  end if;
  if new.is_demo then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and ('sponsor' = any (coalesce(old.tiers, array[]::text[])) or old.seat = 'sponsor')
     and old.status in ('invited', 'active')
     and old.is_demo = false then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('board-arabia-seat-sponsor'));

  select count(*)::int into taken
  from public.members
  where status in ('invited', 'active')
    and is_demo = false
    and ('sponsor' = any (tiers) or seat = 'sponsor')
    and user_id is distinct from new.user_id;

  if taken >= 3 then
    raise exception 'sponsor_cap' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_sponsor_cap() from public, anon, authenticated;

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
  from public.members
  where status in ('invited', 'active')
    and is_demo = false
    and ('sponsor' = any (tiers) or seat = 'sponsor');

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

-- Leave a single 17-arg claim_founding_seat. Drop every older overload first.
do $drop_claim$
declare
  sig text;
begin
  for sig in
    select pg_catalog.pg_get_function_identity_arguments(p.oid)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'claim_founding_seat'
  loop
    execute format('drop function public.claim_founding_seat(%s)', sig);
  end loop;
end
$drop_claim$;

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
  p_capacity_verified boolean default false,
  p_tier text default 'founding',
  p_candidate boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  taken int;
  next_no int;
  app_email text;
  app_status text;
  cand_email text;
  cand_state text;
  cand_invite uuid;
  investable numeric;
  fo_aum numeric;
  turnover numeric;
  member_status text;
  must_password boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_seat not in ('ksa', 'intl') then
    raise exception 'invalid_seat' using errcode = '22023';
  end if;

  if p_tier not in ('founding', 'member') then
    raise exception 'invalid_tier' using errcode = '22023';
  end if;

  if p_user_id is null or p_invited_by is null then
    raise exception 'not_admissible' using errcode = '22023';
  end if;

  if p_candidate then
    if p_application_id is not null then
      raise exception 'not_admissible' using errcode = '22023';
    end if;
  elsif p_application_id is null then
    raise exception 'not_admissible' using errcode = '22023';
  end if;

  if p_email is null or char_length(trim(p_email)) < 3 then
    raise exception 'not_admissible' using errcode = '22023';
  end if;

  investable := private.assert_capacity_amount(p_investable_capacity_usd);
  fo_aum := private.assert_capacity_amount(p_fo_aum_usd);
  turnover := private.assert_capacity_amount(p_turnover_usd);

  perform pg_advisory_xact_lock(hashtext('board-arabia-seat-' || p_seat));
  if p_tier = 'founding' then
    perform pg_advisory_xact_lock(hashtext('board-arabia-founding-number'));
  end if;

  if p_candidate then
    select lower(trim(email)), request_state, invite_token_id
      into cand_email, cand_state, cand_invite
    from public.candidates
    where user_id = p_user_id
    for update;

    if cand_email is null
      or cand_email is distinct from lower(trim(p_email))
      or cand_state not in ('submitted', 'in_review', 'needs_info', 'review_call', 'waitlisted')
    then
      raise exception 'not_admissible' using errcode = '22023';
    end if;
    member_status := 'active';
    must_password := false;
  else
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
    member_status := 'invited';
    must_password := true;
    cand_invite := null;
  end if;

  if exists (
    select 1 from public.members m
    where m.user_id = p_user_id
      or (p_application_id is not null and m.application_id = p_application_id)
      or lower(m.email) = lower(trim(p_email))
  ) then
    raise exception 'already_member' using errcode = '23505';
  end if;

  next_no := null;
  if p_tier = 'founding' then
    taken := private.founding_region_taken(p_seat, null);

    if taken >= 50 then
      raise exception 'seat_full' using errcode = '23514';
    end if;

    next_no := private.next_founding_number();
  end if;

  insert into public.members (
    user_id, application_id, email, seat, status, must_set_password, invited_by,
    invites_granted, invites_remaining, is_demo, tier, tiers, founding_number
  ) values (
    p_user_id,
    p_application_id,
    lower(trim(p_email)),
    p_seat,
    member_status,
    must_password,
    p_invited_by,
    2,
    2,
    false,
    p_tier,
    case
      when p_tier = 'member' then array['member']::text[]
      else array['founding']::text[]
    end,
    next_no
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
    nullif(left(trim(coalesce(p_full_name, '')), 200), ''),
    nullif(left(trim(coalesce(p_phone, '')), 40), ''),
    case
      when p_linkedin_url is not null and p_linkedin_url ~ '^https://' then left(p_linkedin_url, 500)
      else null
    end,
    nullif(left(trim(coalesce(p_company, '')), 200), ''),
    nullif(left(trim(coalesce(p_headline, '')), 160), ''),
    investable,
    fo_aum,
    turnover,
    'USD',
    coalesce(p_include_in_public_aggregates, true),
    coalesce(p_capacity_verified, false)
  );

  if p_candidate then
    update public.candidates
    set request_state = 'approved',
        approved_at = now(),
        decided_at = now(),
        review_seat = p_seat,
        review_tier = p_tier,
        state_changed_at = now(),
        owner = coalesce(owner, p_invited_by),
        capacity_verified = coalesce(p_capacity_verified, false),
        updated_at = now()
    where user_id = p_user_id
      and request_state in ('submitted', 'in_review', 'needs_info', 'review_call', 'waitlisted');

    if not found then
      raise exception 'not_admissible' using errcode = '22023';
    end if;

    update public.member_invites
    set status = 'admitted'
    where id = cand_invite
      and status in ('pending', 'opened', 'applied', 'accepted');
  else
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

    update public.member_invites
    set status = 'admitted'
    where id = (
      select a.invite_token_id
      from public.applications a
      where a.id = p_application_id
    )
      and status in ('pending', 'opened', 'applied', 'accepted');
  end if;
end;
$$;

revoke all on function public.claim_founding_seat(
  uuid, uuid, text, text, uuid, text, text, text, text, text, numeric, numeric, numeric, boolean, boolean, text, boolean
) from public, anon, authenticated;
grant execute on function public.claim_founding_seat(
  uuid, uuid, text, text, uuid, text, text, text, text, text, numeric, numeric, numeric, boolean, boolean, text, boolean
) to service_role;

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
  taken int;
  adding_founding boolean;
  adding_sponsor boolean;
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
  adding_founding := 'founding' = any (next_tiers)
    and (
      not ('founding' = any (before_tiers))
      or row.founding_number is null
    );
  adding_sponsor := 'sponsor' = any (next_tiers)
    and not ('sponsor' = any (before_tiers))
    and row.seat is distinct from 'sponsor';

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

  if adding_sponsor and row.is_demo = false and row.status in ('invited', 'active') then
    perform pg_advisory_xact_lock(hashtext('board-arabia-seat-sponsor'));
    select count(*)::int into taken
    from public.members m
    where m.status in ('invited', 'active')
      and m.is_demo = false
      and ('sponsor' = any (m.tiers) or m.seat = 'sponsor')
      and m.user_id is distinct from row.user_id;
    if taken >= 3 then
      raise exception 'sponsor_cap' using errcode = '23514';
    end if;
  end if;

  update public.members
  set tiers = next_tiers,
      founding_number = next_no
  where user_id = p_user_id;

  insert into public.member_tier_audits (member_user_id, actor_id, before_tiers, after_tiers)
  values (p_user_id, auth.uid(), before_tiers, next_tiers);

  return jsonb_build_object(
    'ok', true,
    'tiers', to_jsonb(next_tiers),
    'founding_number', (select m.founding_number from public.members m where m.user_id = p_user_id)
  );
end;
$$;

revoke all on function public.set_member_tiers(uuid, text[]) from public, anon, service_role;
grant execute on function public.set_member_tiers(uuid, text[]) to authenticated;

comment on function public.set_member_tiers(uuid, text[]) is
  'Staff sets membership tiers. Founding and Member cannot combine. Sponsor can combine with either.';

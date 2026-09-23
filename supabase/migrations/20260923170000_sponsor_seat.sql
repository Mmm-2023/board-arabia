-- Sponsor is a members.seat, not a staff role and not a founding ksa/intl seat.
-- Cap: at most 3 sponsors with status invited or active. Suspended sponsors
-- do not hold a slot. There is no term-year column, so "3 a year" is enforced
-- as this concurrent cap. The trigger covers claim_sponsor_seat and later
-- status restores (set-member-status).
--
-- Invite wallet: members_invites_wallet_check and private.grant_invite_wallet
-- forced invites_granted = 2 on every members row. Sponsors do not receive
-- that founding peer-invite wallet. The wallet is now seat-aware:
--   ksa | intl -> granted 2, remaining 0..2 (unchanged)
--   sponsor   -> granted 0, remaining 0
-- issue_member_invite already refuses invites_remaining <= 0.
--
-- claim_founding_seat is not replaced. It still rejects any seat other than
-- ksa or intl, and it still counts only that founding seat.
-- Sponsors reuse members and profiles RLS. Authenticated users still cannot
-- update seat or insert staff_users. This function does not write staff_users
-- and does not set applications.founding_seat.

alter table public.members drop constraint if exists members_seat_check;
alter table public.members
  add constraint members_seat_check
  check (seat in ('ksa', 'intl', 'sponsor'));

alter table public.members drop constraint if exists members_invites_wallet_check;
alter table public.members
  add constraint members_invites_wallet_check
  check (
    (
      seat in ('ksa', 'intl')
      and invites_granted = 2
      and invites_remaining >= 0
      and invites_remaining <= invites_granted
    )
    or (
      seat = 'sponsor'
      and invites_granted = 0
      and invites_remaining = 0
    )
  );

create or replace function private.grant_invite_wallet()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.seat = 'sponsor' then
    new.invites_granted := 0;
    new.invites_remaining := 0;
    return new;
  end if;
  new.invites_granted := 2;
  new.invites_remaining := 2;
  return new;
end;
$$;

revoke all on function private.grant_invite_wallet() from public, anon, authenticated;

create or replace function private.guard_invite_wallet()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.seat = 'sponsor' then
    if new.invites_granted is distinct from 0 or new.invites_remaining is distinct from 0 then
      raise exception 'invite_grant_locked' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.invites_granted is distinct from 2 then
    raise exception 'invite_grant_locked' using errcode = '23514';
  end if;
  if new.invites_remaining > old.invites_remaining
     and coalesce(current_setting('board.invite_release', true), '') is distinct from 'on' then
    raise exception 'invite_refill_blocked' using errcode = '23514';
  end if;
  if new.invites_remaining < 0 or new.invites_remaining > 2 then
    raise exception 'invite_wallet_range' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_invite_wallet() from public, anon, authenticated;

create or replace function private.guard_sponsor_cap()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  taken int;
begin
  if new.seat is distinct from 'sponsor' then
    return new;
  end if;
  if new.status not in ('invited', 'active') then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.seat = 'sponsor'
     and old.status in ('invited', 'active') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('board-arabia-seat-sponsor'));

  select count(*)::int into taken
  from public.members
  where seat = 'sponsor'
    and status in ('invited', 'active')
    and user_id is distinct from new.user_id;

  if taken >= 3 then
    raise exception 'sponsor_cap' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_sponsor_cap() from public, anon, authenticated;

drop trigger if exists members_guard_sponsor_cap on public.members;
create trigger members_guard_sponsor_cap
  before insert or update on public.members
  for each row execute function private.guard_sponsor_cap();

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
  where m.status in ('invited', 'active');

  select
    coalesce(sum(p.investable_capacity_usd), 0),
    count(*)::int
  into invest_sum, invest_n
  from public.members m
  join public.profiles p on p.user_id = m.user_id
  where m.status in ('invited', 'active')
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

create function public.claim_sponsor_seat(
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
  where seat = 'sponsor'
    and status in ('invited', 'active');

  if taken >= 3 then
    raise exception 'sponsor_cap' using errcode = '23514';
  end if;

  insert into public.members (
    user_id, application_id, email, seat, status, must_set_password, invited_by,
    invites_granted, invites_remaining
  ) values (
    p_user_id,
    null,
    v_email,
    'sponsor',
    'invited',
    true,
    p_invited_by,
    0,
    0
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

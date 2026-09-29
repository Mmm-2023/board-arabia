-- Demo seed, one threshold switch, and server-side mandate redaction.
-- Apply on the live Supabase project (SQL editor or supabase db push).
-- The agent does not apply this file and does not redeploy Edge functions.
-- No Edge function in this change set needs a redeploy.
--
-- Demo people are content rows, not Auth users. They cannot sign in,
-- they do not take founding or sponsor seats, and their addresses are
-- non-deliverable @boardarabia.test mail. include_in_public_aggregates
-- is forced false. Real volume is members.is_demo = false.
--
-- Thresholds live only in public.demo_thresholds. Demos are returned
-- while the real count is below the threshold. At the threshold, real only.
-- Proposed defaults: directory 12, mandates 6, rooms 4, partners 3.

alter table public.members
  add column if not exists is_demo boolean not null default false;

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
        where seat = 'ksa' and status in ('invited', 'active') and is_demo = false
      ),
      'intl', count(*) filter (
        where seat = 'intl' and status in ('invited', 'active') and is_demo = false
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
    and m.is_demo = false;

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
  if new.seat is distinct from 'sponsor' then
    return new;
  end if;
  if new.status not in ('invited', 'active') then
    return new;
  end if;
  if new.is_demo then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.seat = 'sponsor'
     and old.status in ('invited', 'active')
     and old.is_demo = false then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('board-arabia-seat-sponsor'));

  select count(*)::int into taken
  from public.members
  where seat = 'sponsor'
    and status in ('invited', 'active')
    and is_demo = false
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
  where seat = 'sponsor'
    and status in ('invited', 'active')
    and is_demo = false;

  if taken >= 3 then
    raise exception 'sponsor_cap' using errcode = '23514';
  end if;

  insert into public.members (
    user_id, application_id, email, seat, status, must_set_password, invited_by,
    invites_granted, invites_remaining, is_demo
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
    false
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

create or replace function public.claim_founding_seat(
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
    and status in ('invited', 'active')
    and is_demo = false;

  if taken >= 50 then
    raise exception 'seat_full' using errcode = '23514';
  end if;

  insert into public.members (
    user_id, application_id, email, seat, status, must_set_password, invited_by,
    invites_granted, invites_remaining, is_demo
  ) values (
    p_user_id,
    p_application_id,
    lower(trim(p_email)),
    p_seat,
    'invited',
    true,
    p_invited_by,
    2,
    2,
    false
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

  update public.member_invites
  set status = 'admitted'
  where id = (
    select a.invite_token_id
    from public.applications a
    where a.id = p_application_id
  )
    and status in ('pending', 'opened', 'applied', 'accepted');
end;
$$;

revoke all on function public.claim_founding_seat(
  uuid, uuid, text, text, uuid, text, text, text, text, text, numeric, numeric, numeric, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.claim_founding_seat(
  uuid, uuid, text, text, uuid, text, text, text, text, text, numeric, numeric, numeric, boolean, boolean
) to service_role;

create table if not exists public.demo_thresholds (
  id int primary key,
  directory_real int not null default 12,
  mandates_real int not null default 6,
  rooms_real int not null default 4,
  partners_real int not null default 3,
  constraint demo_thresholds_one check (id = 1),
  constraint demo_thresholds_nonneg check (
    directory_real >= 0
    and mandates_real >= 0
    and rooms_real >= 0
    and partners_real >= 0
  )
);

insert into public.demo_thresholds (id)
values (1)
on conflict (id) do nothing;

alter table public.demo_thresholds enable row level security;
alter table public.demo_thresholds force row level security;
revoke all on table public.demo_thresholds from public, anon, authenticated;

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
        else null
      end
      from public.demo_thresholds
      where id = 1
    ),
    false
  );
$$;

revoke all on function private.demo_rows_visible(text, int) from public, anon, authenticated;

create or replace function private.can_read_member_room()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and (
      exists (
        select 1
        from public.members m
        where m.user_id = auth.uid()
          and m.status in ('invited', 'active')
      )
      or private.is_staff()
    );
$$;

revoke all on function private.can_read_member_room() from public, anon, authenticated;

create table if not exists public.directory_entries (
  id uuid primary key,
  is_demo boolean not null default false,
  email text not null,
  full_name text not null,
  headline text not null,
  company text not null,
  location text not null,
  sector text not null,
  seat text not null,
  portrait_asset text not null,
  include_in_public_aggregates boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint directory_entries_demo check (is_demo = true),
  constraint directory_entries_aggregates_off check (include_in_public_aggregates = false),
  constraint directory_entries_seat check (seat in ('ksa', 'intl')),
  constraint directory_entries_email_test check (lower(email) ~ '^[^[:space:]@]+@boardarabia\.test$'),
  constraint directory_entries_portrait check (portrait_asset ~ '^/demo/portraits/[a-z0-9-]+\.svg$'),
  constraint directory_entries_name_len check (char_length(trim(full_name)) between 1 and 200),
  constraint directory_entries_headline_len check (char_length(headline) between 1 and 160),
  constraint directory_entries_company_len check (char_length(company) between 1 and 200),
  constraint directory_entries_location_len check (char_length(location) between 1 and 120),
  constraint directory_entries_sector_len check (char_length(sector) between 1 and 120)
);

create unique index if not exists directory_entries_email_idx
  on public.directory_entries (lower(email));

alter table public.directory_entries enable row level security;
alter table public.directory_entries force row level security;
revoke all on table public.directory_entries from public, anon, authenticated;

create table if not exists public.mandates (
  id uuid primary key,
  is_demo boolean not null default false,
  published boolean not null default false,
  sector text not null,
  deal_type text not null,
  ticket_band text not null,
  geography text not null,
  stage text not null,
  one_liner text not null,
  company_name text not null,
  exact_amount text not null,
  terms text not null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text not null,
  deck_url text,
  narrative text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint mandates_one_liner_len check (char_length(one_liner) between 1 and 280),
  constraint mandates_one_liner_clear check (
    position('@' in one_liner) = 0
    and position(lower(company_name) in lower(one_liner)) = 0
  ),
  constraint mandates_contact_email_test check (lower(contact_email) ~ '^[^[:space:]@]+@boardarabia\.test$'),
  constraint mandates_deck_test check (
    deck_url is null
    or deck_url ~ '^https://[a-z0-9.-]+\.boardarabia\.test/'
  ),
  constraint mandates_sector_len check (char_length(sector) between 1 and 120),
  constraint mandates_narrative_len check (char_length(narrative) between 1 and 2000)
);

alter table public.mandates enable row level security;
alter table public.mandates force row level security;
revoke all on table public.mandates from public, anon, authenticated;

create table if not exists public.mandate_intros (
  id uuid primary key default gen_random_uuid(),
  mandate_id uuid not null references public.mandates (id) on delete cascade,
  member_id uuid not null references public.members (user_id) on delete cascade,
  status text not null,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  constraint mandate_intros_status check (status in ('pending', 'approved', 'declined')),
  constraint mandate_intros_unique unique (mandate_id, member_id)
);

alter table public.mandate_intros enable row level security;
alter table public.mandate_intros force row level security;
revoke all on table public.mandate_intros from public, anon, authenticated;

create table if not exists public.rooms (
  id uuid primary key,
  is_demo boolean not null default false,
  status text not null default 'open',
  name text not null,
  summary text not null,
  sector text not null,
  stage text not null,
  member_count int not null,
  host_directory_id uuid references public.directory_entries (id) on delete set null,
  host_name text not null,
  mandate_id uuid references public.mandates (id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint rooms_status check (status in ('open', 'closed')),
  constraint rooms_member_count check (member_count >= 0 and member_count <= 50),
  constraint rooms_name_len check (char_length(name) between 1 and 160),
  constraint rooms_summary_len check (char_length(summary) between 1 and 400)
);

alter table public.rooms enable row level security;
alter table public.rooms force row level security;
revoke all on table public.rooms from public, anon, authenticated;

create table if not exists public.trusted_partners (
  id uuid primary key,
  is_demo boolean not null default false,
  published boolean not null default false,
  name text not null,
  blurb text not null,
  monogram text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint trusted_partners_name_len check (char_length(name) between 1 and 120),
  constraint trusted_partners_blurb_len check (char_length(blurb) between 1 and 200),
  constraint trusted_partners_monogram check (char_length(monogram) between 1 and 3)
);

alter table public.trusted_partners enable row level security;
alter table public.trusted_partners force row level security;
revoke all on table public.trusted_partners from public, anon, authenticated;

-- locked_mandate_json
create or replace function private.mandate_locked_json(
  p_id uuid,
  p_is_demo boolean,
  p_sector text,
  p_deal_type text,
  p_ticket_band text,
  p_geography text,
  p_stage text,
  p_one_liner text,
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
    'deal_type', p_deal_type,
    'ticket_band', p_ticket_band,
    'geography', p_geography,
    'stage', p_stage,
    'one_liner', p_one_liner,
    'unlocked', false,
    'intro_status', p_intro_status
  );
$$;
-- end_locked_mandate_json

revoke all on function private.mandate_locked_json(uuid, boolean, text, text, text, text, text, text, text)
  from public, anon, authenticated;

create or replace function private.mandate_open_json(
  p_id uuid,
  p_is_demo boolean,
  p_sector text,
  p_deal_type text,
  p_ticket_band text,
  p_geography text,
  p_stage text,
  p_one_liner text,
  p_company_name text,
  p_exact_amount text,
  p_terms text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_deck_url text,
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
    'deal_type', p_deal_type,
    'ticket_band', p_ticket_band,
    'geography', p_geography,
    'stage', p_stage,
    'one_liner', p_one_liner,
    'unlocked', true,
    'intro_status', 'approved',
    'company_name', p_company_name,
    'exact_amount', p_exact_amount,
    'terms', p_terms,
    'contact_name', p_contact_name,
    'contact_email', p_contact_email,
    'contact_phone', p_contact_phone,
    'deck_url', p_deck_url,
    'narrative', p_narrative
  );
$$;

revoke all on function private.mandate_open_json(
  uuid, boolean, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;

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
    and m.seat in ('ksa', 'intl');

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
          'sector', '',
          'seat', m.seat,
          'portrait_asset', null,
          'avatar_path', p.avatar_path
        ) as payload
      from public.members m
      join public.profiles p on p.user_id = m.user_id
      where m.is_demo = false
        and m.status in ('invited', 'active')
        and m.seat in ('ksa', 'intl')
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
          'seat', d.seat,
          'portrait_asset', d.portrait_asset,
          'avatar_path', null
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

create or replace function public.list_member_mandates()
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
  from public.mandates
  where is_demo = false
    and published = true;

  show_demo := private.demo_rows_visible('mandates', real_n);

  return coalesce((
    select jsonb_agg(payload order by sort_order, created_at)
    from (
      select
        m.sort_order,
        m.created_at,
        case
          when i.status = 'approved' then private.mandate_open_json(
            m.id,
            m.is_demo,
            m.sector,
            m.deal_type,
            m.ticket_band,
            m.geography,
            m.stage,
            m.one_liner,
            m.company_name,
            m.exact_amount,
            m.terms,
            m.contact_name,
            m.contact_email,
            m.contact_phone,
            m.deck_url,
            m.narrative
          )
          else private.mandate_locked_json(
            m.id,
            m.is_demo,
            m.sector,
            m.deal_type,
            m.ticket_band,
            m.geography,
            m.stage,
            m.one_liner,
            i.status
          )
        end as payload
      from public.mandates m
      left join public.mandate_intros i
        on i.mandate_id = m.id
       and i.member_id = auth.uid()
      where m.published
        and (m.is_demo = false or show_demo)
    ) listed
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_member_mandates() from public, anon;
grant execute on function public.list_member_mandates() to authenticated;

create or replace function public.request_mandate_intro(p_mandate_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  real_n int;
  show_demo boolean;
  visible boolean;
  current_status text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.members m
    where m.user_id = auth.uid()
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select count(*)::int into real_n
  from public.mandates
  where is_demo = false
    and published = true;

  show_demo := private.demo_rows_visible('mandates', real_n);

  select exists (
    select 1
    from public.mandates m
    where m.id = p_mandate_id
      and m.published
      and (m.is_demo = false or show_demo)
  ) into visible;

  if not visible then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  insert into public.mandate_intros (mandate_id, member_id, status)
  values (p_mandate_id, auth.uid(), 'pending')
  on conflict (mandate_id, member_id) do nothing;

  select status into current_status
  from public.mandate_intros
  where mandate_id = p_mandate_id
    and member_id = auth.uid();

  return jsonb_build_object('status', current_status);
end;
$$;

revoke all on function public.request_mandate_intro(uuid) from public, anon;
grant execute on function public.request_mandate_intro(uuid) to authenticated;

create or replace function public.staff_list_mandate_intros()
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
      'sector', m.sector,
      'deal_type', m.deal_type,
      'company_name', m.company_name,
      'member_name', coalesce(nullif(trim(p.full_name), ''), 'Member')
    ) order by i.requested_at)
    from public.mandate_intros i
    join public.mandates m on m.id = i.mandate_id
    left join public.profiles p on p.user_id = i.member_id
    where i.status = 'pending'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_list_mandate_intros() from public, anon;
grant execute on function public.staff_list_mandate_intros() to authenticated;

create or replace function public.staff_decide_mandate_intro(
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

  update public.mandate_intros
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

revoke all on function public.staff_decide_mandate_intro(uuid, text) from public, anon;
grant execute on function public.staff_decide_mandate_intro(uuid, text) to authenticated;

create or replace function public.list_member_rooms()
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
  from public.rooms
  where is_demo = false
    and status = 'open';

  show_demo := private.demo_rows_visible('rooms', real_n);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'is_demo', r.is_demo,
      'name', r.name,
      'summary', r.summary,
      'sector', r.sector,
      'stage', r.stage,
      'member_count', r.member_count,
      'host_name', r.host_name
    ) order by r.is_demo, r.sort_order, r.name)
    from public.rooms r
    where r.status = 'open'
      and (r.is_demo = false or show_demo)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_member_rooms() from public, anon;
grant execute on function public.list_member_rooms() to authenticated;

create or replace function public.list_trusted_partners()
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
  from public.trusted_partners
  where is_demo = false
    and published = true;

  show_demo := private.demo_rows_visible('partners', real_n);

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id,
      'is_demo', t.is_demo,
      'name', t.name,
      'blurb', t.blurb,
      'monogram', t.monogram
    ) order by t.is_demo, t.sort_order, t.name)
    from public.trusted_partners t
    where t.published
      and (t.is_demo = false or show_demo)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_trusted_partners() from public;
grant execute on function public.list_trusted_partners() to anon, authenticated;

insert into public.directory_entries (
  id, is_demo, email, full_name, headline, company, location, sector, seat,
  portrait_asset, include_in_public_aggregates, sort_order
) values
  (
    'a1000001-0000-4000-8000-000000000001',
    true,
    'layla.nadira@boardarabia.test',
    'Layla Al-Nadira',
    'Independent chair',
    'Nadira Family Office',
    'Riyadh',
    'Energy transition',
    'ksa',
    '/demo/portraits/nadira.svg',
    false,
    1
  ),
  (
    'a1000001-0000-4000-8000-000000000002',
    true,
    'noura.wahat@boardarabia.test',
    'Noura Al-Wahat',
    'Non-executive director',
    'Wahat Counsel',
    'Jeddah',
    'Health',
    'ksa',
    '/demo/portraits/wahat.svg',
    false,
    2
  ),
  (
    'a1000001-0000-4000-8000-000000000003',
    true,
    'hanan.safi@boardarabia.test',
    'Hanan Al-Safi',
    'Family principal',
    'Safi House',
    'Khobar',
    'Tourism',
    'ksa',
    '/demo/portraits/safi.svg',
    false,
    3
  ),
  (
    'a1000001-0000-4000-8000-000000000004',
    true,
    'maha.rawnaq@boardarabia.test',
    'Maha Al-Rawnaq',
    'Independent director',
    'Rawnaq Capital',
    'Riyadh',
    'Financial services',
    'ksa',
    '/demo/portraits/rawnaq.svg',
    false,
    4
  ),
  (
    'a1000001-0000-4000-8000-000000000005',
    true,
    'faisal.dihya@boardarabia.test',
    'Faisal Al-Dihya',
    'Non-executive director',
    'Dihya Board Seat',
    'Dammam',
    'Logistics',
    'ksa',
    '/demo/portraits/dihya.svg',
    false,
    5
  ),
  (
    'a1000001-0000-4000-8000-000000000006',
    true,
    'omar.janub@boardarabia.test',
    'Omar Al-Janub',
    'Chair advisor',
    'Janub Board Practice',
    'Abha',
    'Mining',
    'intl',
    '/demo/portraits/janub.svg',
    false,
    6
  ),
  (
    'a1000001-0000-4000-8000-000000000007',
    true,
    'saud.manar@boardarabia.test',
    'Saud Al-Manar',
    'Independent director',
    'Manar Seat',
    'Riyadh',
    'Digital infrastructure',
    'ksa',
    '/demo/portraits/manar.svg',
    false,
    7
  ),
  (
    'a1000001-0000-4000-8000-000000000008',
    true,
    'yusuf.batin@boardarabia.test',
    'Yusuf Al-Batin',
    'Board member',
    'Batin Family Council',
    'Jeddah',
    'Food security',
    'intl',
    '/demo/portraits/batin.svg',
    false,
    8
  )
on conflict (id) do nothing;

insert into public.mandates (
  id, is_demo, published, sector, deal_type, ticket_band, geography, stage, one_liner,
  company_name, exact_amount, terms, contact_name, contact_email, contact_phone,
  deck_url, narrative, sort_order
) values
  (
    'a2000001-0000-4000-8000-000000000001',
    true, true,
    'Energy transition',
    'Growth equity',
    '$10-25m',
    'KSA',
    'Diligence',
    'Growth capital for a Saudi industrial services platform.',
    'Nahla Industrial Holding',
    'SAR 68.5 million',
    'One board seat and pro-rata on the next round.',
    'Amal N.',
    'amal.desk@boardarabia.test',
    'Room extension 4101',
    'https://files.boardarabia.test/nahla-brief',
    'Nahla Industrial Holding is raising a growth round. Exact price, the shareholder table, and the data room stay inside this brief until an admin releases the intro.',
    1
  ),
  (
    'a2000001-0000-4000-8000-000000000002',
    true, true,
    'Health',
    'Acquisition',
    '$25-50m',
    'GCC',
    'Sourcing',
    'A control stake in a private clinic network along the west coast.',
    'Waha Care Clinics',
    'SAR 142 million enterprise value',
    '70 percent control, two board seats, and a three-year earnout.',
    'Huda S.',
    'huda.desk@boardarabia.test',
    'Room extension 4102',
    'https://files.boardarabia.test/waha-brief',
    'Waha Care Clinics is the named target. Clinic list, earnout math, and seller contacts stay locked until the intro is approved.',
    2
  ),
  (
    'a2000001-0000-4000-8000-000000000003',
    true, true,
    'Tourism',
    'Advisory seat',
    '$5-10m',
    'KSA',
    'Closing',
    'An advisory seat beside a hospitality operator on the Red Sea.',
    'Qitaf Hospitality Group',
    'SAR 9.2 million annual fee',
    'A two-year advisory seat with observer rights at the board.',
    'Reem Q.',
    'reem.desk@boardarabia.test',
    'Room extension 4103',
    'https://files.boardarabia.test/qitaf-brief',
    'Qitaf Hospitality Group wants a chair-level advisor before close. The fee letter and the property schedule stay locked.',
    3
  ),
  (
    'a2000001-0000-4000-8000-000000000004',
    true, true,
    'Logistics',
    'Growth equity',
    '$10-25m',
    'KSA',
    'Diligence',
    'Growth equity for a domestic freight and warehousing platform.',
    'Darin Freight Works',
    'SAR 51 million',
    'Minority stake, one seat, and information rights each quarter.',
    'Tariq D.',
    'tariq.desk@boardarabia.test',
    'Room extension 4104',
    'https://files.boardarabia.test/darin-brief',
    'Darin Freight Works is in diligence. Route map, customer names, and the term sheet stay locked.',
    4
  ),
  (
    'a2000001-0000-4000-8000-000000000005',
    true, true,
    'Mining',
    'Project finance',
    '$50-100m',
    'KSA',
    'Sourcing',
    'Project capital for a minerals development in the north.',
    'Jabal Minerals',
    'SAR 310 million project cost',
    'Senior project facility, a completion guarantee, and one observer seat.',
    'Lama J.',
    'lama.desk@boardarabia.test',
    'Room extension 4105',
    'https://files.boardarabia.test/jabal-brief',
    'Jabal Minerals is the project name. The reserve model, offtake draft, and lender list stay locked.',
    5
  ),
  (
    'a2000001-0000-4000-8000-000000000006',
    true, true,
    'Food security',
    'Growth equity',
    '$10-25m',
    'KSA',
    'Diligence',
    'Growth capital for a packaged food producer serving local supply.',
    'Samn Food Mills',
    'SAR 44 million',
    'Primary capital, one board seat, and a reserved matter list.',
    'Nada B.',
    'nada.desk@boardarabia.test',
    'Room extension 4106',
    'https://files.boardarabia.test/samn-brief',
    'Samn Food Mills is the producer in the brief. Plant list, margin bridge, and buyer names stay locked.',
    6
  )
on conflict (id) do nothing;

insert into public.rooms (
  id, is_demo, status, name, summary, sector, stage, member_count,
  host_directory_id, host_name, mandate_id, sort_order
) values
  (
    'a3000001-0000-4000-8000-000000000001',
    true, 'open',
    'Industrial services room',
    'A working room for a growth brief in industrial services. Opened by admin.',
    'Energy transition',
    'Diligence',
    4,
    'a1000001-0000-4000-8000-000000000001',
    'Layla Al-Nadira',
    'a2000001-0000-4000-8000-000000000001',
    1
  ),
  (
    'a3000001-0000-4000-8000-000000000002',
    true, 'open',
    'West coast clinics room',
    'A working room for an acquisition brief in private care. Opened by admin.',
    'Health',
    'Sourcing',
    3,
    'a1000001-0000-4000-8000-000000000002',
    'Noura Al-Wahat',
    'a2000001-0000-4000-8000-000000000002',
    2
  ),
  (
    'a3000001-0000-4000-8000-000000000003',
    true, 'open',
    'Red Sea hospitality room',
    'A working room for an advisory brief in hospitality. Opened by admin.',
    'Tourism',
    'Closing',
    5,
    'a1000001-0000-4000-8000-000000000003',
    'Hanan Al-Safi',
    'a2000001-0000-4000-8000-000000000003',
    3
  ),
  (
    'a3000001-0000-4000-8000-000000000004',
    true, 'open',
    'Domestic freight room',
    'A working room for a growth brief in domestic freight. Opened by admin.',
    'Logistics',
    'Diligence',
    4,
    'a1000001-0000-4000-8000-000000000005',
    'Faisal Al-Dihya',
    'a2000001-0000-4000-8000-000000000004',
    4
  )
on conflict (id) do nothing;

insert into public.trusted_partners (
  id, is_demo, published, name, blurb, monogram, sort_order
) values
  (
    'a4000001-0000-4000-8000-000000000001',
    true, true,
    'Qaf Ledger',
    'Custody and fund administration for Gulf closings.',
    'QL',
    1
  ),
  (
    'a4000001-0000-4000-8000-000000000002',
    true, true,
    'Mirsad Advisory',
    'Independent corporate finance advice to boards.',
    'MA',
    2
  ),
  (
    'a4000001-0000-4000-8000-000000000003',
    true, true,
    'Dar Escrow House',
    'Escrow and settlement for private transactions.',
    'DE',
    3
  )
on conflict (id) do nothing;

select private.recompute_platform_stats();

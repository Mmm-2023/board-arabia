-- Two-tier foundation. Candidates are not members.
-- A row here does not take a founding seat, does not fire the invite wallet
-- trigger, and does not satisfy member RLS. Do not insert these users into
-- public.members or public.profiles.
--
-- Sorts after 20261028120000 (avatars, separate PR). This file does not touch
-- avatar columns, member policies, or profile policies.
--
-- Attribution columns (ft_ / lt_ / analytics_id / attribution_version) live
-- here so the register function can store them. The applications columns are
-- a different migration and are not added in this file.

create or replace function private.attribution_token(value text)
returns boolean
language sql
immutable
as $$
  select value is null or (
    char_length(value) between 1 and 100
    and value = lower(value)
    and value !~ '[[:space:]]'
    and position('@' in value) = 0
    and value !~ '[0-9]{7,}'
  );
$$;

revoke all on function private.attribution_token(text) from public, anon, authenticated;

create table if not exists public.candidates (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  role text not null,
  region text not null,
  request_state text not null default 'open',
  email_verified_at timestamptz,
  owner uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  board_seats text,
  company_name text,
  job_title text,
  company_website text,
  linkedin_url text,
  scale_kind text,
  scale_band text,
  sector_tags text[],
  vision_tags text[],
  statement text,
  cr_number text,
  cr_country text,
  referral_name text,
  invited_by_member_id uuid references public.members(user_id) on delete set null,
  invite_token_id uuid references public.member_invites(id) on delete set null,
  invite_reason text,
  investable_capacity_usd numeric,
  include_in_public_aggregates boolean,
  phone text,
  ft_source text,
  ft_medium text,
  ft_campaign text,
  ft_content text,
  ft_term text,
  ft_referrer_host text,
  ft_landing_path text,
  ft_at timestamptz,
  lt_source text,
  lt_medium text,
  lt_campaign text,
  analytics_id text,
  attribution_version smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint candidates_email_len check (char_length(trim(email)) between 3 and 320),
  constraint candidates_full_name_len check (char_length(trim(full_name)) between 1 and 200),
  constraint candidates_role_check check (role in ('chairperson', 'board_member', 'c_suite', 'other')),
  constraint candidates_region_check check (region in ('ksa_gcc', 'intl')),
  constraint candidates_request_state_check check (
    request_state in (
      'open',
      'submitted',
      'in_review',
      'needs_info',
      'review_call',
      'waitlisted',
      'approved',
      'declined',
      'closed'
    )
  ),
  constraint candidates_board_seats_len check (board_seats is null or char_length(board_seats) <= 1000),
  constraint candidates_company_name_len check (company_name is null or char_length(company_name) <= 200),
  constraint candidates_job_title_len check (job_title is null or char_length(job_title) <= 200),
  constraint candidates_company_website_len check (
    company_website is null
    or (char_length(company_website) <= 500 and company_website ~ '^https://')
  ),
  constraint candidates_linkedin_len check (
    linkedin_url is null
    or (char_length(linkedin_url) <= 500 and linkedin_url ~ '^https://')
  ),
  constraint candidates_scale_kind_check check (
    scale_kind is null or scale_kind in ('turnover', 'aum')
  ),
  constraint candidates_scale_band_len check (scale_band is null or char_length(scale_band) <= 80),
  constraint candidates_sector_tags_count check (sector_tags is null or cardinality(sector_tags) between 0 and 5),
  constraint candidates_vision_tags_count check (vision_tags is null or cardinality(vision_tags) between 0 and 5),
  constraint candidates_statement_len check (statement is null or char_length(statement) <= 600),
  constraint candidates_cr_number_len check (cr_number is null or char_length(cr_number) <= 40),
  constraint candidates_cr_country_len check (cr_country is null or char_length(cr_country) <= 80),
  constraint candidates_referral_len check (referral_name is null or char_length(referral_name) <= 200),
  constraint candidates_invite_reason_len check (invite_reason is null or char_length(invite_reason) <= 500),
  constraint candidates_phone_len check (phone is null or char_length(phone) <= 40),
  constraint candidates_investable_check check (
    investable_capacity_usd is null
    or (investable_capacity_usd >= 0 and investable_capacity_usd <= 1000000000000)
  ),
  constraint candidates_ft_source_token check (private.attribution_token(ft_source)),
  constraint candidates_ft_medium_token check (private.attribution_token(ft_medium)),
  constraint candidates_ft_campaign_token check (private.attribution_token(ft_campaign)),
  constraint candidates_ft_content_token check (private.attribution_token(ft_content)),
  constraint candidates_ft_term_token check (private.attribution_token(ft_term)),
  constraint candidates_ft_referrer_token check (private.attribution_token(ft_referrer_host)),
  constraint candidates_ft_landing_token check (
    ft_landing_path is null
    or (
      private.attribution_token(ft_landing_path)
      and ft_landing_path ~ '^/'
    )
  ),
  constraint candidates_lt_source_token check (private.attribution_token(lt_source)),
  constraint candidates_lt_medium_token check (private.attribution_token(lt_medium)),
  constraint candidates_lt_campaign_token check (private.attribution_token(lt_campaign)),
  constraint candidates_analytics_id_token check (private.attribution_token(analytics_id)),
  constraint candidates_attribution_version_check check (
    attribution_version is null or attribution_version >= 1
  )
);

create unique index if not exists candidates_email_lower_idx on public.candidates (lower(email));
create index if not exists candidates_request_state_idx on public.candidates (request_state, created_at desc);

create table if not exists public.candidate_events (
  id uuid primary key default gen_random_uuid(),
  candidate_user_id uuid not null references public.candidates(user_id) on delete cascade,
  kind text not null,
  detail jsonb not null default '{}'::jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint candidate_events_kind_shape check (kind ~ '^[a-z0-9_]{1,64}$')
);

create index if not exists candidate_events_candidate_idx
  on public.candidate_events (candidate_user_id, created_at);

create table if not exists public.candidate_notes (
  id uuid primary key default gen_random_uuid(),
  candidate_user_id uuid not null references public.candidates(user_id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint candidate_notes_body_len check (char_length(trim(body)) between 1 and 2000)
);

create index if not exists candidate_notes_candidate_idx
  on public.candidate_notes (candidate_user_id, created_at);

-- One-time email codes. Not readable by the account holder. Service role only,
-- through the functions below. This is not a public rate-limit table.
create table if not exists private.candidate_email_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  link_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint candidate_email_codes_hash_len check (
    char_length(code_hash) between 32 and 128
    and char_length(link_hash) between 32 and 128
  ),
  constraint candidate_email_codes_attempts_check check (attempts >= 0 and attempts <= 20)
);

alter table private.candidate_email_codes enable row level security;
alter table private.candidate_email_codes force row level security;
revoke all on table private.candidate_email_codes from public, anon, authenticated;

alter table public.candidates enable row level security;
alter table public.candidates force row level security;
alter table public.candidate_events enable row level security;
alter table public.candidate_events force row level security;
alter table public.candidate_notes enable row level security;
alter table public.candidate_notes force row level security;

revoke all on table public.candidates from public, anon, authenticated;
revoke all on table public.candidate_events from public, anon, authenticated;
revoke all on table public.candidate_notes from public, anon, authenticated;

grant select on table public.candidates to authenticated;
grant update (
  full_name,
  role,
  region,
  board_seats,
  company_name,
  job_title,
  company_website,
  linkedin_url,
  scale_kind,
  scale_band,
  sector_tags,
  vision_tags,
  statement,
  cr_number,
  cr_country,
  referral_name,
  invite_reason,
  investable_capacity_usd,
  include_in_public_aggregates,
  phone
) on table public.candidates to authenticated;

grant select on table public.candidate_events to authenticated;
grant select, insert, update, delete on table public.candidate_notes to authenticated;

drop policy if exists candidates_select_own on public.candidates;
create policy candidates_select_own on public.candidates
  for select to authenticated
  using (user_id = auth.uid() or private.is_staff());

drop policy if exists candidates_update_own on public.candidates;
create policy candidates_update_own on public.candidates
  for update to authenticated
  using (user_id = auth.uid() and request_state = 'open')
  with check (user_id = auth.uid() and request_state = 'open');

drop policy if exists candidates_update_staff on public.candidates;
create policy candidates_update_staff on public.candidates
  for update to authenticated
  using (private.is_staff())
  with check (private.is_staff());

drop policy if exists candidate_events_select on public.candidate_events;
create policy candidate_events_select on public.candidate_events
  for select to authenticated
  using (private.is_staff() or candidate_user_id = auth.uid());

drop policy if exists candidate_notes_staff on public.candidate_notes;
create policy candidate_notes_staff on public.candidate_notes
  for all to authenticated
  using (private.is_staff())
  with check (private.is_staff() and author_id = auth.uid());

-- Own-row edits cannot change identity, verification, request state, or attribution.
-- Staff and the service role can. After the request leaves 'open', the owner cannot update.
create or replace function private.guard_candidate_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or private.is_staff() then
    return new;
  end if;

  if old.user_id is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if old.request_state is distinct from 'open' then
    raise exception 'candidate_locked' using errcode = '42501';
  end if;

  if new.user_id is distinct from old.user_id
    or new.email is distinct from old.email
    or new.email_verified_at is distinct from old.email_verified_at
    or new.request_state is distinct from old.request_state
    or new.owner is distinct from old.owner
    or new.submitted_at is distinct from old.submitted_at
    or new.created_at is distinct from old.created_at
    or new.invited_by_member_id is distinct from old.invited_by_member_id
    or new.invite_token_id is distinct from old.invite_token_id
    or new.ft_source is distinct from old.ft_source
    or new.ft_medium is distinct from old.ft_medium
    or new.ft_campaign is distinct from old.ft_campaign
    or new.ft_content is distinct from old.ft_content
    or new.ft_term is distinct from old.ft_term
    or new.ft_referrer_host is distinct from old.ft_referrer_host
    or new.ft_landing_path is distinct from old.ft_landing_path
    or new.ft_at is distinct from old.ft_at
    or new.lt_source is distinct from old.lt_source
    or new.lt_medium is distinct from old.lt_medium
    or new.lt_campaign is distinct from old.lt_campaign
    or new.analytics_id is distinct from old.analytics_id
    or new.attribution_version is distinct from old.attribution_version
  then
    raise exception 'candidate_field_locked' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_candidate_update() from public, anon, authenticated;

drop trigger if exists candidates_guard_update on public.candidates;
create trigger candidates_guard_update
  before update on public.candidates
  for each row execute function private.guard_candidate_update();

drop trigger if exists candidates_set_updated_at on public.candidates;
create trigger candidates_set_updated_at
  before update on public.candidates
  for each row execute function public.set_updated_at();

create or replace function public.candidate_auth_user_id(p_email text)
returns uuid
language sql
stable
security definer
set search_path = auth, public
as $$
  select id
  from auth.users
  where p_email is not null
    and char_length(trim(p_email)) > 0
    and lower(email) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.candidate_auth_user_id(text) from public, anon, authenticated;
grant execute on function public.candidate_auth_user_id(text) to service_role;

create or replace function public.candidate_issue_code(
  p_user_id uuid,
  p_code_hash text,
  p_link_hash text,
  p_expires_at timestamptz
) returns text
language plpgsql
security definer
set search_path = private, public
as $$
declare
  recent int;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_user_id is null
    or p_code_hash is null
    or p_link_hash is null
    or char_length(p_code_hash) < 32
    or char_length(p_link_hash) < 32
    or p_expires_at is null
  then
    raise exception 'invalid_code' using errcode = '22023';
  end if;

  if exists (
    select 1
    from private.candidate_email_codes
    where user_id = p_user_id
      and created_at > now() - interval '60 seconds'
  ) then
    return 'cooldown';
  end if;

  select count(*)::int into recent
  from private.candidate_email_codes
  where user_id = p_user_id
    and created_at > now() - interval '1 hour';

  if recent >= 5 then
    return 'rate_limited';
  end if;

  update private.candidate_email_codes
    set used_at = now()
    where user_id = p_user_id
      and used_at is null;

  insert into private.candidate_email_codes (user_id, code_hash, link_hash, expires_at)
  values (p_user_id, p_code_hash, p_link_hash, p_expires_at);

  return 'ok';
end;
$$;

revoke all on function public.candidate_issue_code(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.candidate_issue_code(uuid, text, text, timestamptz) to service_role;

create or replace function public.candidate_consume_secret(
  p_email text,
  p_code_hash text,
  p_link_hash text
) returns jsonb
language plpgsql
security definer
set search_path = private, public, auth
as $$
declare
  rec private.candidate_email_codes%rowtype;
  uid uuid;
  by_link boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  by_link := p_link_hash is not null and char_length(trim(p_link_hash)) > 0;

  if by_link then
    select * into rec
    from private.candidate_email_codes
    where link_hash = trim(p_link_hash)
      and used_at is null
    order by created_at desc
    limit 1
    for update;
  else
    select id into uid
    from auth.users
    where lower(email) = lower(trim(coalesce(p_email, '')))
    limit 1;
    if uid is null then
      return jsonb_build_object('status', 'missing');
    end if;
    select * into rec
    from private.candidate_email_codes
    where user_id = uid
      and used_at is null
    order by created_at desc
    limit 1
    for update;
  end if;

  if rec.id is null then
    return jsonb_build_object('status', 'missing');
  end if;

  if rec.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;

  if rec.attempts >= 5 then
    return jsonb_build_object('status', 'locked');
  end if;

  if (by_link and trim(p_link_hash) = rec.link_hash)
    or (
      not by_link
      and p_code_hash is not null
      and p_code_hash = rec.code_hash
    )
  then
    update private.candidate_email_codes
      set used_at = now()
      where id = rec.id;
    return jsonb_build_object('status', 'ok', 'user_id', rec.user_id);
  end if;

  update private.candidate_email_codes
    set attempts = rec.attempts + 1
    where id = rec.id;
  return jsonb_build_object('status', 'mismatch');
end;
$$;

revoke all on function public.candidate_consume_secret(text, text, text) from public, anon, authenticated;
grant execute on function public.candidate_consume_secret(text, text, text) to service_role;

create or replace function public.candidate_void_latest_code(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update private.candidate_email_codes
    set used_at = now()
    where user_id = p_user_id
      and used_at is null;
end;
$$;

revoke all on function public.candidate_void_latest_code(uuid) from public, anon, authenticated;
grant execute on function public.candidate_void_latest_code(uuid) to service_role;

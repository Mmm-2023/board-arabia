-- Wave 1: members and profiles are distinct from staff_users.
-- Invite-only. No anon directory. Admission writes go through service role.

alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications
  add constraint applications_status_check
  check (status in ('pending', 'verified', 'declined', 'accepted', 'rejected', 'admitted'));

alter table public.applications
  add column if not exists founding_seat text,
  add column if not exists member_user_id uuid,
  add column if not exists admitted_at timestamptz,
  add column if not exists admitted_by uuid;

alter table public.applications drop constraint if exists applications_founding_seat_check;
alter table public.applications
  add constraint applications_founding_seat_check
  check (founding_seat is null or founding_seat in ('ksa', 'intl'));

alter table public.applications drop constraint if exists applications_member_user_id_fkey;
alter table public.applications
  add constraint applications_member_user_id_fkey
  foreign key (member_user_id) references auth.users(id) on delete set null;

alter table public.applications drop constraint if exists applications_admitted_by_fkey;
alter table public.applications
  add constraint applications_admitted_by_fkey
  foreign key (admitted_by) references auth.users(id) on delete set null;

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
    and invite_event_id is null
    and invite_sent_at is null
    and decision_at is null
    and decision_by is null
    and founding_seat is null
    and member_user_id is null
    and admitted_at is null
    and admitted_by is null
  );

create table if not exists public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  application_id uuid unique references public.applications(id) on delete set null,
  email text not null,
  seat text not null,
  status text not null default 'invited',
  must_set_password boolean not null default true,
  invited_at timestamptz not null default now(),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint members_seat_check check (seat in ('ksa', 'intl')),
  constraint members_status_check check (status in ('invited', 'active', 'suspended')),
  constraint members_email_len check (char_length(trim(email)) between 3 and 320)
);

create unique index if not exists members_email_lower_idx on public.members (lower(email));

create table if not exists public.profiles (
  user_id uuid primary key references public.members(user_id) on delete cascade,
  full_name text,
  headline text,
  company text,
  location text,
  linkedin_url text,
  bio text,
  phone text,
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_len check (full_name is null or char_length(trim(full_name)) between 1 and 200),
  constraint profiles_headline_len check (headline is null or char_length(headline) <= 160),
  constraint profiles_company_len check (company is null or char_length(company) <= 200),
  constraint profiles_location_len check (location is null or char_length(location) <= 120),
  constraint profiles_bio_len check (bio is null or char_length(bio) <= 2000),
  constraint profiles_phone_len check (phone is null or char_length(phone) <= 40),
  constraint profiles_linkedin_len check (
    linkedin_url is null
    or (char_length(linkedin_url) <= 500 and linkedin_url ~ '^https://')
  )
);

alter table public.members enable row level security;
alter table public.profiles enable row level security;

revoke all on table public.members from public, anon, authenticated;
revoke all on table public.profiles from public, anon, authenticated;

grant select (user_id, email, seat, status, must_set_password, invited_at, application_id)
  on table public.members to authenticated;
grant update (must_set_password) on table public.members to authenticated;

grant select (user_id, full_name, headline, company, location, linkedin_url, bio, phone, updated_at)
  on table public.profiles to authenticated;
grant update (full_name, headline, company, location, linkedin_url, bio, phone)
  on table public.profiles to authenticated;

drop policy if exists members_select_own on public.members;
create policy members_select_own on public.members
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists members_clear_password_flag on public.members;
create policy members_clear_password_flag on public.members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and must_set_password = false);

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (full_name is null or char_length(trim(full_name)) between 1 and 200)
    and (headline is null or char_length(headline) <= 160)
    and (company is null or char_length(company) <= 200)
    and (location is null or char_length(location) <= 120)
    and (bio is null or char_length(bio) <= 2000)
    and (phone is null or char_length(phone) <= 40)
    and (
      linkedin_url is null
      or (char_length(linkedin_url) <= 500 and linkedin_url ~ '^https://')
    )
  );

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.founding_counts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ksa', count(*) filter (where seat = 'ksa' and status in ('invited', 'active')),
    'intl', count(*) filter (where seat = 'intl' and status in ('invited', 'active')),
    'ksa_cap', 50,
    'intl_cap', 50,
    'total_cap', 100
  )
  from public.members;
$$;

revoke all on function private.founding_counts() from public, anon, authenticated, service_role;

create or replace function public.founding_capacity()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.members m
    where m.user_id = auth.uid()
      and m.status in ('invited', 'active')
  ) and not exists (
    select 1 from public.staff_users s
    where s.user_id = auth.uid()
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return private.founding_counts();
end;
$$;

revoke all on function public.founding_capacity() from public, anon;
grant execute on function public.founding_capacity() to authenticated;

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
  p_headline text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  taken int;
  app_email text;
  app_status text;
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
    user_id, full_name, phone, linkedin_url, company, headline
  ) values (
    p_user_id, p_full_name, p_phone, p_linkedin_url, p_company, p_headline
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

revoke all on function public.claim_founding_seat(uuid, uuid, text, text, uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_founding_seat(uuid, uuid, text, text, uuid, text, text, text, text, text)
  to service_role;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon;
grant execute on function public.set_updated_at() to authenticated, service_role;

alter table public.members force row level security;
alter table public.profiles force row level security;

drop trigger if exists members_set_updated_at on public.members;
create trigger members_set_updated_at
  before update on public.members
  for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

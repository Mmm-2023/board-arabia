-- Two-invite wallet. Runs after 20260922200000_platform_stats.sql.
-- claim_founding_seat here replaces the 15-arg capacity function from that
-- migration and drops the older 10-arg overload. The body keeps capacity
-- asserts and profile capacity columns, and also writes invites_granted /
-- invites_remaining = 2 and marks member_invites admitted.
-- On insert, every member (founding or general) receives exactly 2 invites.
-- Updates cannot raise invites_remaining unless release_member_invite set the
-- transaction flag. Unused invites do not refill.

alter table public.members
  add column if not exists invites_granted integer not null default 2,
  add column if not exists invites_remaining integer not null default 2;

alter table public.members drop constraint if exists members_invites_wallet_check;
alter table public.members
  add constraint members_invites_wallet_check
  check (
    invites_granted = 2
    and invites_remaining >= 0
    and invites_remaining <= invites_granted
  );

grant select (invites_remaining, invites_granted) on table public.members to authenticated;

create or replace function private.grant_invite_wallet()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.invites_granted := 2;
  new.invites_remaining := 2;
  return new;
end;
$$;

revoke all on function private.grant_invite_wallet() from public, anon, authenticated;

drop trigger if exists members_grant_invite_wallet on public.members;
create trigger members_grant_invite_wallet
  before insert on public.members
  for each row execute function private.grant_invite_wallet();

create or replace function private.guard_invite_wallet()
returns trigger
language plpgsql
set search_path = public
as $$
begin
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

drop trigger if exists members_guard_invite_wallet on public.members;
create trigger members_guard_invite_wallet
  before update on public.members
  for each row execute function private.guard_invite_wallet();

create table if not exists public.member_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null,
  inviter_member_id uuid not null references public.members(user_id) on delete cascade,
  channel text not null,
  status text not null default 'pending',
  recipient_email text,
  recipient_phone text,
  application_id uuid,
  expires_at timestamptz not null,
  opened_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_invites_token_key unique (token),
  constraint member_invites_token_shape check (token ~ '^[A-Za-z0-9_-]{43,80}$'),
  constraint member_invites_channel_check check (channel in ('email', 'whatsapp')),
  constraint member_invites_status_check check (
    status in ('pending', 'opened', 'applied', 'accepted', 'rejected', 'admitted')
  ),
  constraint member_invites_email_channel check (
    channel <> 'email' or recipient_email is not null
  ),
  constraint member_invites_email_shape check (
    recipient_email is null
    or (
      char_length(recipient_email) between 3 and 320
      and recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  ),
  constraint member_invites_phone_shape check (
    recipient_phone is null or recipient_phone ~ '^[0-9]{8,15}$'
  )
);

alter table public.member_invites
  drop constraint if exists member_invites_application_id_fkey;
alter table public.member_invites
  add constraint member_invites_application_id_fkey
  foreign key (application_id) references public.applications(id) on delete set null;

create index if not exists member_invites_inviter_idx
  on public.member_invites (inviter_member_id, created_at desc);
create index if not exists member_invites_application_idx
  on public.member_invites (application_id);

drop trigger if exists member_invites_set_updated_at on public.member_invites;
create trigger member_invites_set_updated_at
  before update on public.member_invites
  for each row execute function public.set_updated_at();

alter table public.applications
  add column if not exists invited_by_member_id uuid,
  add column if not exists invite_token_id uuid,
  add column if not exists invite_reason text;

alter table public.applications drop constraint if exists applications_invited_by_member_id_fkey;
alter table public.applications
  add constraint applications_invited_by_member_id_fkey
  foreign key (invited_by_member_id) references public.members(user_id) on delete set null;

alter table public.applications drop constraint if exists applications_invite_token_id_fkey;
alter table public.applications
  add constraint applications_invite_token_id_fkey
  foreign key (invite_token_id) references public.member_invites(id) on delete set null;

alter table public.applications drop constraint if exists applications_invite_reason_len;
alter table public.applications
  add constraint applications_invite_reason_len
  check (invite_reason is null or char_length(trim(invite_reason)) between 1 and 500);

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
    and invited_by_member_id is null
    and invite_token_id is null
    and invite_reason is null
  );

alter table public.member_invites enable row level security;
alter table public.member_invites force row level security;

revoke all on table public.member_invites from public, anon, authenticated;
grant select on table public.member_invites to authenticated;

drop policy if exists member_invites_select_own on public.member_invites;
create policy member_invites_select_own on public.member_invites
  for select to authenticated
  using (inviter_member_id = auth.uid());

drop policy if exists member_invites_select_staff on public.member_invites;
create policy member_invites_select_staff on public.member_invites
  for select to authenticated
  using (exists (select 1 from public.staff_users s where s.user_id = auth.uid()));

create table if not exists public.invite_lookup_limits (
  rate_key text primary key,
  window_start timestamptz not null default now(),
  hit_count integer not null default 0,
  constraint invite_lookup_limits_hits check (hit_count >= 0)
);

alter table public.invite_lookup_limits enable row level security;
alter table public.invite_lookup_limits force row level security;
revoke all on table public.invite_lookup_limits from public, anon, authenticated;

create or replace function public.lookup_member_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.member_invites%rowtype;
  label text;
  bucket text;
  hits integer;
begin
  if p_token is null
     or char_length(p_token) < 43
     or char_length(p_token) > 80
     or p_token !~ '^[A-Za-z0-9_-]+$' then
    return jsonb_build_object('valid', false, 'state', 'invalid');
  end if;

  bucket := 'lkp:' || (((hashtext(p_token) % 128) + 128) % 128)::text;

  insert into public.invite_lookup_limits (rate_key, window_start, hit_count)
  values (bucket, now(), 1)
  on conflict (rate_key) do update
  set
    hit_count = case
      when public.invite_lookup_limits.window_start < now() - interval '1 hour' then 1
      else public.invite_lookup_limits.hit_count + 1
    end,
    window_start = case
      when public.invite_lookup_limits.window_start < now() - interval '1 hour' then now()
      else public.invite_lookup_limits.window_start
    end
  returning hit_count into hits;

  if hits > 40 then
    return jsonb_build_object('valid', false, 'state', 'limited');
  end if;

  select * into invite_row
  from public.member_invites
  where token = p_token;

  if not found then
    return jsonb_build_object('valid', false, 'state', 'invalid');
  end if;

  if invite_row.expires_at <= now() then
    return jsonb_build_object('valid', false, 'state', 'expired');
  end if;

  if invite_row.status in ('applied', 'accepted', 'admitted') then
    return jsonb_build_object('valid', false, 'state', 'used');
  end if;

  if invite_row.status <> 'pending' and invite_row.status <> 'opened' then
    return jsonb_build_object('valid', false, 'state', 'invalid');
  end if;

  if invite_row.status = 'pending' then
    update public.member_invites
    set status = 'opened',
        opened_at = coalesce(opened_at, now())
    where id = invite_row.id
      and status = 'pending';
  end if;

  select coalesce(nullif(trim(p.full_name), ''), 'A Board Arabia member')
    into label
  from public.profiles p
  where p.user_id = invite_row.inviter_member_id;

  if label is null or label = '' then
    label := 'A Board Arabia member';
  end if;

  return jsonb_build_object(
    'valid', true,
    'state', 'valid',
    'inviter_label', label
  );
end;
$$;

revoke all on function public.lookup_member_invite(text) from public;
grant execute on function public.lookup_member_invite(text) to anon, authenticated;

create or replace function public.issue_member_invite(
  p_member_id uuid,
  p_channel text,
  p_recipient_email text,
  p_recipient_phone text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  member_row public.members%rowtype;
  new_id uuid;
  new_token text;
  remaining integer;
  phone_digits text;
  email_clean text;
  attempt integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_channel not in ('email', 'whatsapp') then
    raise exception 'invalid_channel' using errcode = '22023';
  end if;

  email_clean := nullif(lower(trim(coalesce(p_recipient_email, ''))), '');
  phone_digits := nullif(regexp_replace(coalesce(p_recipient_phone, ''), '\D', '', 'g'), '');

  if p_channel = 'email' then
    if email_clean is null
       or email_clean !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'invalid_email' using errcode = '22023';
    end if;
  end if;

  if phone_digits is not null and phone_digits !~ '^[0-9]{8,15}$' then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  select * into member_row
  from public.members
  where user_id = p_member_id
  for update;

  if not found then
    raise exception 'not_member' using errcode = '42501';
  end if;

  if member_row.status not in ('invited', 'active') then
    raise exception 'member_inactive' using errcode = '42501';
  end if;

  if member_row.invites_remaining <= 0 then
    raise exception 'invites_exhausted' using errcode = '23514';
  end if;

  if email_clean is not null and email_clean = lower(trim(member_row.email)) then
    raise exception 'cannot_invite_self' using errcode = '22023';
  end if;

  for attempt in 1..3 loop
    new_token := rtrim(
      translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'),
      '='
    );
    begin
      insert into public.member_invites (
        token,
        inviter_member_id,
        channel,
        status,
        recipient_email,
        recipient_phone,
        expires_at
      ) values (
        new_token,
        p_member_id,
        p_channel,
        'pending',
        case when p_channel = 'email' then email_clean else null end,
        phone_digits,
        now() + interval '90 days'
      )
      returning id into new_id;
      exit;
    exception
      when unique_violation then
        if attempt = 3 then
          raise;
        end if;
    end;
  end loop;

  update public.members
  set invites_remaining = invites_remaining - 1
  where user_id = p_member_id
  returning invites_remaining into remaining;

  return jsonb_build_object(
    'id', new_id,
    'token', new_token,
    'invites_remaining', remaining,
    'invites_granted', 2,
    'channel', p_channel,
    'expires_at', now() + interval '90 days'
  );
end;
$$;

revoke all on function public.issue_member_invite(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.issue_member_invite(uuid, text, text, text) to service_role;

create or replace function public.release_member_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inviter uuid;
  remaining integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select inviter_member_id into inviter
  from public.member_invites
  where id = p_invite_id
    and status = 'pending'
  for update;

  if inviter is null then
    return jsonb_build_object('released', false);
  end if;

  perform pg_advisory_xact_lock(hashtext('board-arabia-invite-' || inviter::text));

  delete from public.member_invites
  where id = p_invite_id
    and status = 'pending';

  if not found then
    return jsonb_build_object('released', false);
  end if;

  perform set_config('board.invite_release', 'on', true);

  update public.members
  set invites_remaining = least(invites_granted, invites_remaining + 1)
  where user_id = inviter
  returning invites_remaining into remaining;

  return jsonb_build_object('released', true, 'invites_remaining', remaining);
end;
$$;

revoke all on function public.release_member_invite(uuid) from public, anon, authenticated;
grant execute on function public.release_member_invite(uuid) to service_role;

drop function if exists public.claim_founding_seat(uuid, uuid, text, text, uuid, text, text, text, text, text);
drop function if exists public.claim_founding_seat(
  uuid, uuid, text, text, uuid, text, text, text, text, text, numeric, numeric, numeric, boolean, boolean
);

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
    user_id, application_id, email, seat, status, must_set_password, invited_by,
    invites_granted, invites_remaining
  ) values (
    p_user_id,
    p_application_id,
    lower(trim(p_email)),
    p_seat,
    'invited',
    true,
    p_invited_by,
    2,
    2
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

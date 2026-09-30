-- TT-3 abuse controls, invite return, and retention.
-- Candidates are not members. They receive no peer invites.
-- An invite is spent when the invitee registers (status applied).
-- It is returned only when that person never verifies.
-- A decline does not refill the wallet.
-- Retired migration numbers are not reused.

comment on table public.candidates is
  'Consideration accounts. Not members. They do not take a founding seat and they receive no peer invites.';

alter table public.candidates
  add column if not exists free_webmail boolean not null default false,
  add column if not exists retention_reminded_at timestamptz;

comment on column public.candidates.free_webmail is
  'True when the email domain is free webmail. Flag only. It does not block registration.';

comment on column public.candidates.retention_reminded_at is
  'Set after the one reminder for an account that has not submitted a request.';

alter table public.members
  add column if not exists left_at timestamptz,
  add column if not exists legal_hold boolean not null default false,
  add column if not exists anonymised_at timestamptz;

comment on column public.members.left_at is
  'When the member left. Retention anonymises the row 24 months later unless legal_hold is set.';

alter table public.member_invites drop constraint if exists member_invites_status_check;
alter table public.member_invites
  add constraint member_invites_status_check check (
    status in ('pending', 'opened', 'applied', 'accepted', 'rejected', 'admitted', 'returned')
  );

alter table public.member_invites
  add column if not exists returned_at timestamptz;

comment on column public.member_invites.returned_at is
  'Set when an applied invite is returned because the invitee never verified. A decline does not set this.';

create table if not exists public.disposable_email_domains (
  domain text primary key,
  constraint disposable_email_domains_shape check (
    domain = lower(domain)
    and position('@' in domain) = 0
    and char_length(domain) between 3 and 253
  )
);

create table if not exists public.blocked_email_domains (
  domain text primary key,
  constraint blocked_email_domains_shape check (
    domain = lower(domain)
    and position('@' in domain) = 0
    and char_length(domain) between 3 and 253
  )
);

create table if not exists public.register_rate_limits (
  rate_key text primary key,
  window_start timestamptz not null default now(),
  hit_count int not null default 0,
  constraint register_rate_limits_hits check (hit_count >= 0)
);

create table if not exists public.membership_rate_limits (
  rate_key text primary key,
  window_start timestamptz not null default now(),
  hit_count int not null default 0,
  constraint membership_rate_limits_hits check (hit_count >= 0)
);

create table if not exists public.retention_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  dry_run boolean not null,
  counts jsonb not null,
  constraint retention_runs_counts_object check (jsonb_typeof(counts) = 'object'),
  constraint retention_runs_counts_safe check (position('@' in counts::text) = 0)
);

create table if not exists public.retention_posthog_queue (
  analytics_id text primary key,
  created_at timestamptz not null default now(),
  constraint retention_posthog_queue_token check (
    char_length(analytics_id) between 1 and 100
    and position('@' in analytics_id) = 0
  )
);

comment on table public.disposable_email_domains is
  'Domains rejected at registration. Staff can add rows. The function also carries a built-in list.';

comment on table public.blocked_email_domains is
  'Extra domains the desk blocks. Empty until staff insert a row. Not a public list.';

comment on table public.register_rate_limits is
  'Registration windows in the same shape as apply_rate_limits. Keys are reg:email and reg:ip.';

comment on table public.membership_rate_limits is
  'Submit attempts for a membership request. The request itself can still be sent only once.';

comment on table public.retention_runs is
  'One row per retention run. Counts only. No email addresses.';

comment on table public.retention_posthog_queue is
  'analytics_id values whose PostHog person still needs deleting. No email addresses.';

alter table public.disposable_email_domains enable row level security;
alter table public.disposable_email_domains force row level security;
alter table public.blocked_email_domains enable row level security;
alter table public.blocked_email_domains force row level security;
alter table public.register_rate_limits enable row level security;
alter table public.register_rate_limits force row level security;
alter table public.membership_rate_limits enable row level security;
alter table public.membership_rate_limits force row level security;
alter table public.retention_runs enable row level security;
alter table public.retention_runs force row level security;
alter table public.retention_posthog_queue enable row level security;
alter table public.retention_posthog_queue force row level security;

revoke all on table public.disposable_email_domains from public, anon, authenticated;
revoke all on table public.blocked_email_domains from public, anon, authenticated;
revoke all on table public.register_rate_limits from public, anon, authenticated;
revoke all on table public.membership_rate_limits from public, anon, authenticated;
revoke all on table public.retention_runs from public, anon, authenticated;
revoke all on table public.retention_posthog_queue from public, anon, authenticated;

grant select, insert, update, delete on table public.disposable_email_domains to service_role;
grant select, insert, update, delete on table public.blocked_email_domains to service_role;
grant select, insert, update, delete on table public.register_rate_limits to service_role;
grant select, insert, update, delete on table public.membership_rate_limits to service_role;
grant select, insert on table public.retention_runs to service_role;
grant select, insert, delete on table public.retention_posthog_queue to service_role;

insert into public.disposable_email_domains (domain) values
  ('10minutemail.com'),
  ('10minutemail.net'),
  ('discard.email'),
  ('discardmail.com'),
  ('dispostable.com'),
  ('emailondeck.com'),
  ('fakeinbox.com'),
  ('getairmail.com'),
  ('getnada.com'),
  ('grr.la'),
  ('guerrillamail.biz'),
  ('guerrillamail.com'),
  ('guerrillamail.de'),
  ('guerrillamail.info'),
  ('guerrillamail.net'),
  ('guerrillamail.org'),
  ('guerrillamailblock.com'),
  ('jetable.org'),
  ('mailcatch.com'),
  ('maildrop.cc'),
  ('mailinator.com'),
  ('mailinator.net'),
  ('mailinator.org'),
  ('mailnesia.com'),
  ('mailnull.com'),
  ('mintemail.com'),
  ('mohmal.com'),
  ('mytemp.email'),
  ('notmailinator.com'),
  ('sharklasers.com'),
  ('spam4.me'),
  ('spamgourmet.com'),
  ('temp-mail.org'),
  ('tempail.com'),
  ('tempinbox.com'),
  ('tempmail.com'),
  ('tempr.email'),
  ('throwawaymail.com'),
  ('tmpmail.net'),
  ('tmpmail.org'),
  ('trash-mail.com'),
  ('trashmail.com'),
  ('trashmail.de'),
  ('trashmail.io'),
  ('trashmail.me'),
  ('trashmail.net'),
  ('yopmail.com'),
  ('yopmail.fr'),
  ('yopmail.gq'),
  ('yopmail.net'),
  ('yopmail.org')
on conflict (domain) do nothing;

create index if not exists candidates_retention_open_idx
  on public.candidates (created_at)
  where request_state = 'open';

-- Return one applied invite. No-op unless the invite is still applied.
-- Callers must already know the invitee never verified and was not declined.
create or replace function private.return_applied_invite(p_invite_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inviter uuid;
begin
  if p_invite_id is null then
    return false;
  end if;

  select inviter_member_id into inviter
  from public.member_invites
  where id = p_invite_id
    and status = 'applied'
  for update;

  if inviter is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtext('board-arabia-invite-' || inviter::text));

  update public.member_invites
  set status = 'returned',
      returned_at = now()
  where id = p_invite_id
    and status = 'applied';

  if not found then
    return false;
  end if;

  perform set_config('board.invite_release', 'on', true);

  update public.members
  set invites_remaining = least(invites_granted, invites_remaining + 1)
  where user_id = inviter;

  return true;
end;
$$;

revoke all on function private.return_applied_invite(uuid) from public, anon, authenticated;

create or replace function public.prepare_candidate_delete(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, private
as $$
declare
  cand public.candidates%rowtype;
  analytics text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (select 1 from public.members m where m.user_id = p_user_id) then
    return jsonb_build_object('status', 'member');
  end if;

  if exists (select 1 from public.staff_users s where s.user_id = p_user_id) then
    return jsonb_build_object('status', 'staff');
  end if;

  select * into cand from public.candidates where user_id = p_user_id for update;
  if cand.user_id is null then
    return jsonb_build_object('status', 'missing');
  end if;

  -- Spent at registration. Returned only when this person never verified.
  -- Decline is not this path, and a verified account does not get the invite back.
  if cand.email_verified_at is null
     and cand.request_state = 'open'
     and cand.invite_token_id is not null
  then
    perform private.return_applied_invite(cand.invite_token_id);
  end if;

  analytics := cand.analytics_id;
  if analytics is not null and position('@' in analytics) = 0 then
    insert into public.retention_posthog_queue (analytics_id)
    values (analytics)
    on conflict (analytics_id) do nothing;
  end if;

  delete from public.candidate_events where candidate_user_id = p_user_id;
  delete from public.candidate_notes where candidate_user_id = p_user_id;
  delete from auth.users where id = p_user_id;

  return jsonb_build_object('status', 'ok', 'analytics_id', analytics);
end;
$$;

revoke all on function public.prepare_candidate_delete(uuid) from public, anon, authenticated;
grant execute on function public.prepare_candidate_delete(uuid) to service_role;

create or replace function public.retention_sweep_plan(p_apply boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, private
as $$
declare
  unverified uuid[];
  never_submitted uuid[];
  decided uuid[];
  applications uuid[];
  members uuid[];
  invites uuid[];
  reminders uuid[];
  consent_ids uuid[];
  all_ids uuid[];
  event_count int := 0;
  cache_count int := 0;
  returned_count int := 0;
  uid uuid;
  invite_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(array_agg(user_id), '{}') into unverified
  from (
    select c.user_id
    from public.candidates c
    where c.request_state = 'open'
      and c.email_verified_at is null
      and c.created_at < now() - interval '7 days'
      and not exists (select 1 from public.members m where m.user_id = c.user_id)
      and not exists (select 1 from public.staff_users s where s.user_id = c.user_id)
    order by c.created_at
    limit 500
  ) doomed;

  select coalesce(array_agg(user_id), '{}') into never_submitted
  from (
    select c.user_id
    from public.candidates c
    where c.request_state = 'open'
      and c.email_verified_at is not null
      and c.created_at < now() - interval '120 days'
      and not exists (select 1 from public.members m where m.user_id = c.user_id)
      and not exists (select 1 from public.staff_users s where s.user_id = c.user_id)
    order by c.created_at
    limit 500
  ) doomed;

  select coalesce(array_agg(user_id), '{}') into decided
  from (
    select c.user_id
    from public.candidates c
    where c.request_state in ('declined', 'closed')
      and c.decided_at is not null
      and c.decided_at < now() - interval '12 months'
      and not exists (select 1 from public.members m where m.user_id = c.user_id)
      and not exists (select 1 from public.staff_users s where s.user_id = c.user_id)
    order by c.decided_at
    limit 500
  ) doomed;

  select coalesce(array_agg(user_id), '{}') into reminders
  from (
    select c.user_id
    from public.candidates c
    where c.request_state = 'open'
      and c.email_verified_at is not null
      and c.retention_reminded_at is null
      and c.created_at <= now() - interval '90 days'
      and c.created_at > now() - interval '120 days'
      and not exists (select 1 from public.members m where m.user_id = c.user_id)
    order by c.created_at
    limit 200
  ) due;

  select coalesce(array_agg(id), '{}') into applications
  from (
    select a.id
    from public.applications a
    where a.status in ('rejected', 'declined')
      and a.decision_at is not null
      and a.decision_at < now() - interval '12 months'
      and not exists (select 1 from public.members m where m.application_id = a.id)
    order by a.decision_at
    limit 500
  ) old_apps;

  select coalesce(array_agg(user_id), '{}') into members
  from (
    select m.user_id
    from public.members m
    where m.left_at is not null
      and m.left_at < now() - interval '24 months'
      and m.legal_hold = false
      and m.anonymised_at is null
    order by m.left_at
    limit 500
  ) gone;

  select coalesce(array_agg(id), '{}') into consent_ids
  from (
    select cl.id
    from public.consent_log cl
    where cl.created_at < now() - interval '13 months'
    order by cl.created_at
    limit 2000
  ) old_consent;

  select coalesce(array_agg(c.invite_token_id), '{}') into invites
  from public.candidates c
  where c.user_id = any(unverified)
    and c.invite_token_id is not null
    and c.request_state = 'open'
    and c.email_verified_at is null
    and exists (
      select 1 from public.member_invites i
      where i.id = c.invite_token_id
        and i.status = 'applied'
    );

  all_ids := unverified || never_submitted || decided;

  select count(*)::int into event_count
  from public.candidate_events e
  where e.candidate_user_id = any(all_ids);

  if to_regclass('public.marketing_stats_cache') is not null then
    execute $cache$
      select count(*)::int from public.marketing_stats_cache
      where created_at < now() - interval '24 hours'
    $cache$ into cache_count;
  end if;

  if p_apply then
    foreach uid in array unverified loop
      select c.invite_token_id into invite_id
      from public.candidates c
      where c.user_id = uid
        and c.request_state = 'open'
        and c.email_verified_at is null;
      if invite_id is not null and private.return_applied_invite(invite_id) then
        returned_count := returned_count + 1;
      end if;
    end loop;

    insert into public.retention_posthog_queue (analytics_id)
    select distinct c.analytics_id
    from public.candidates c
    where c.user_id = any(all_ids)
      and c.analytics_id is not null
      and position('@' in c.analytics_id) = 0
    on conflict (analytics_id) do nothing;

    delete from public.candidate_events where candidate_user_id = any(all_ids);
    delete from public.candidate_notes where candidate_user_id = any(all_ids);
    delete from auth.users u
    where u.id = any(all_ids)
      and not exists (select 1 from public.members m where m.user_id = u.id)
      and not exists (select 1 from public.staff_users s where s.user_id = u.id);

    delete from public.applications a
    where a.id = any(applications);

    update public.members m
    set email = 'retired+' || m.user_id::text || '@example.com',
        anonymised_at = now()
    where m.user_id = any(members);

    update auth.users u
    set email = 'retired+' || u.id::text || '@example.com',
        raw_user_meta_data = '{}'::jsonb
    where u.id = any(members);

    update public.profiles p
    set full_name = 'Retired member',
        headline = null,
        company = null,
        location = null,
        linkedin_url = null,
        bio = null,
        phone = null,
        investable_capacity_usd = null,
        fo_aum_usd = null,
        turnover_usd = null
    where p.user_id = any(members);

    perform public.purge_expired_consent_log();

    if to_regclass('public.marketing_stats_cache') is not null then
      execute $cache$
        delete from public.marketing_stats_cache
        where created_at < now() - interval '24 hours'
      $cache$;
    end if;
  end if;

  return jsonb_build_object(
    'unverified', to_jsonb(unverified),
    'never_submitted', to_jsonb(never_submitted),
    'decided', to_jsonb(decided),
    'applications', to_jsonb(applications),
    'members', to_jsonb(members),
    'invites', to_jsonb(invites),
    'reminders', to_jsonb(reminders),
    'consent', to_jsonb(consent_ids),
    'events', event_count,
    'cache', cache_count,
    'invites_returned', returned_count
  );
end;
$$;

revoke all on function public.retention_sweep_plan(boolean) from public, anon, authenticated;
grant execute on function public.retention_sweep_plan(boolean) to service_role;

comment on function public.retention_sweep_plan(boolean) is
  'Retention plan. p_apply false lists rows. p_apply true deletes unverified sign-ups at 7 days, confirmed accounts that never submit at 120 days, declined or closed requests and legacy applications at 12 months, anonymises members 24 months after left_at, and purges consent_log at 13 months. candidate_events and candidate_notes go with the candidate. Members and staff are not deleted. Decline does not return a peer invite.';

-- APP-4 push registration. Sending stays off.
-- Members store their own device rows. Anon gets nothing.
-- Upsert and revoke go through security definer functions with search_path ''.
-- No staff policy. A later staff read must call private.is_staff() first.
-- Account delete removes these rows by extending confirm_account_delete from 20261225120000.
-- Nothing is sent. Nothing is scheduled. Factory does not apply this migration.

alter table public.member_notification_prefs
  add column if not exists push_enabled boolean not null default false;

comment on column public.member_notification_prefs.push_enabled is
  'Push channel. Default off. A missing row means push stays off.';

comment on table public.member_notification_prefs is
  'Member notification choices. A missing row means board seat nudges stay on and push stays off. No staff policy.';

create table public.member_push_tokens (
  member_id uuid not null references public.members (user_id) on delete cascade,
  platform text not null,
  token text not null,
  created_at timestamptz not null default pg_catalog.now(),
  last_seen_at timestamptz not null default pg_catalog.now(),
  revoked_at timestamptz,
  primary key (member_id, token),
  constraint member_push_tokens_platform check (platform in ('ios', 'android')),
  constraint member_push_tokens_token_shape check (
    pg_catalog.char_length(token) between 16 and 4096
    and token ~ '^[A-Za-z0-9:_.+-]+$'
    and pg_catalog.strpos(token, '@') = 0
  )
);

comment on table public.member_push_tokens is
  'Device registration for the signed-in member. No staff policy. Nothing is sent from this table.';

alter table public.member_push_tokens enable row level security;
alter table public.member_push_tokens force row level security;

revoke all on table public.member_push_tokens from public;
revoke all on table public.member_push_tokens from anon, authenticated, service_role;
grant select on table public.member_push_tokens to authenticated;

create index if not exists member_push_tokens_live_idx
  on public.member_push_tokens (member_id)
  where revoked_at is null;

drop policy if exists member_push_tokens_select_own on public.member_push_tokens;
create policy member_push_tokens_select_own
  on public.member_push_tokens
  for select
  to authenticated
  using (member_id = (select auth.uid()));

create or replace function private.member_notification_prefs_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.member_id is distinct from old.member_id then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and old.push_enabled is true
     and new.push_enabled is distinct from true
  then
    update public.member_push_tokens
    set revoked_at = pg_catalog.now()
    where member_id = new.member_id
      and revoked_at is null;
  end if;
  return new;
end;
$$;

revoke all on function private.member_notification_prefs_guard() from public;
revoke all on function private.member_notification_prefs_guard() from anon, authenticated;

create or replace function public.set_push_notifications(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
  v_enabled boolean;
begin
  v_member := auth.uid();
  if v_member is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.members m
    where m.user_id = v_member
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  v_enabled := coalesce(p_enabled, false);
  insert into public.member_notification_prefs (member_id, push_enabled)
  values (v_member, v_enabled)
  on conflict (member_id) do update
    set push_enabled = excluded.push_enabled;

  if v_enabled is distinct from true then
    update public.member_push_tokens
    set revoked_at = pg_catalog.now()
    where member_id = v_member
      and revoked_at is null;
  end if;

  return pg_catalog.jsonb_build_object('ok', true, 'push_enabled', v_enabled);
end;
$$;

revoke all on function public.set_push_notifications(boolean) from public;
revoke all on function public.set_push_notifications(boolean) from anon, authenticated;
grant execute on function public.set_push_notifications(boolean) to authenticated;

create or replace function public.own_push_preference()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'push_enabled',
    coalesce(
      (
        select p.push_enabled
        from public.member_notification_prefs p
        where p.member_id = auth.uid()
      ),
      false
    )
  );
$$;

revoke all on function public.own_push_preference() from public;
revoke all on function public.own_push_preference() from anon, authenticated;
grant execute on function public.own_push_preference() to authenticated;

create or replace function public.register_push_token(p_platform text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
  v_platform text;
  v_token text;
  v_enabled boolean;
begin
  v_member := auth.uid();
  if v_member is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.members m
    where m.user_id = v_member
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  v_platform := pg_catalog.lower(pg_catalog.btrim(coalesce(p_platform, '')));
  if v_platform not in ('ios', 'android') then
    raise exception 'invalid_platform' using errcode = '22023';
  end if;

  v_token := pg_catalog.btrim(coalesce(p_token, ''));
  if pg_catalog.char_length(v_token) < 16
     or pg_catalog.char_length(v_token) > 4096
     or v_token !~ '^[A-Za-z0-9:_.+-]+$'
     or pg_catalog.strpos(v_token, '@') > 0
  then
    raise exception 'invalid_token' using errcode = '22023';
  end if;

  select coalesce(p.push_enabled, false) into v_enabled
  from public.member_notification_prefs p
  where p.member_id = v_member;
  if v_enabled is distinct from true then
    raise exception 'push_off' using errcode = '42501';
  end if;

  update public.member_push_tokens
  set revoked_at = pg_catalog.now()
  where token = v_token
    and member_id is distinct from v_member
    and revoked_at is null;

  insert into public.member_push_tokens (member_id, platform, token)
  values (v_member, v_platform, v_token)
  on conflict (member_id, token) do update
    set platform = excluded.platform,
        last_seen_at = pg_catalog.now(),
        revoked_at = null;

  return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.register_push_token(text, text) from public;
revoke all on function public.register_push_token(text, text) from anon, authenticated;
grant execute on function public.register_push_token(text, text) to authenticated;

create or replace function public.revoke_my_push_tokens()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
  v_count int;
begin
  v_member := auth.uid();
  if v_member is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  update public.member_push_tokens
  set revoked_at = pg_catalog.now()
  where member_id = v_member
    and revoked_at is null;
  get diagnostics v_count = row_count;

  return pg_catalog.jsonb_build_object('ok', true, 'revoked', v_count);
end;
$$;

revoke all on function public.revoke_my_push_tokens() from public;
revoke all on function public.revoke_my_push_tokens() from anon, authenticated;
grant execute on function public.revoke_my_push_tokens() to authenticated;

create or replace function public.confirm_account_delete(
  p_user_id uuid,
  p_code_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_code private.account_delete_codes%rowtype;
  v_email text;
  v_hold boolean := false;
  v_analytics text;
  v_avatar text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_user_id is null or p_code_hash is null or char_length(p_code_hash) < 32 then
    return pg_catalog.jsonb_build_object('status', 'invalid');
  end if;

  if exists (select 1 from public.staff_users s where s.user_id = p_user_id) then
    return pg_catalog.jsonb_build_object('status', 'staff');
  end if;

  if not exists (select 1 from public.members m where m.user_id = p_user_id)
     and not exists (select 1 from public.candidates c where c.user_id = p_user_id)
  then
    return pg_catalog.jsonb_build_object('status', 'missing');
  end if;

  if exists (
    select 1 from public.members m
    where m.user_id = p_user_id
      and m.anonymised_at is not null
  ) then
    return pg_catalog.jsonb_build_object('status', 'closed');
  end if;

  select * into v_code
  from private.account_delete_codes
  where user_id = p_user_id
    and used_at is null
  order by created_at desc
  limit 1
  for update;

  if v_code.id is null then
    return pg_catalog.jsonb_build_object('status', 'missing');
  end if;

  if v_code.expires_at <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object('status', 'expired');
  end if;

  if v_code.attempts >= 5 then
    return pg_catalog.jsonb_build_object('status', 'locked');
  end if;

  if v_code.code_hash is distinct from p_code_hash then
    update private.account_delete_codes
      set attempts = v_code.attempts + 1
      where id = v_code.id;
    if v_code.attempts + 1 >= 5 then
      return pg_catalog.jsonb_build_object('status', 'locked');
    end if;
    return pg_catalog.jsonb_build_object('status', 'mismatch');
  end if;

  update private.account_delete_codes
    set used_at = pg_catalog.now()
    where id = v_code.id;

  if not exists (select 1 from public.members m where m.user_id = p_user_id) then
    return public.prepare_candidate_delete(p_user_id);
  end if;

  select m.email, m.legal_hold
    into v_email, v_hold
  from public.members m
  where m.user_id = p_user_id
  for update;

  select c.analytics_id into v_analytics
  from public.candidates c
  where c.user_id = p_user_id;

  if v_analytics is not null and pg_catalog.strpos(v_analytics, '@') > 0 then
    v_analytics := null;
  end if;

  select p.avatar_path into v_avatar
  from public.profiles p
  where p.user_id = p_user_id;

  if not v_hold then
    update public.consent_log
      set user_id = null
      where user_id = p_user_id;

    update public.staff_access_log
      set member_id = null
      where member_id = p_user_id;

    update public.member_tier_audits
      set member_user_id = null,
          actor_id = case when actor_id = p_user_id then null else actor_id end
      where member_user_id = p_user_id
         or actor_id = p_user_id;

    update public.member_intro_desk_audits
      set actor_id = null
      where actor_id = p_user_id;

    update public.member_intro_deal_audits
      set actor_id = null
      where actor_id = p_user_id;

    update public.ai_tool_consents
      set member_id = null
      where member_id = p_user_id;

    update public.applications
      set full_name = 'Former member',
          email = 'redacted-' || replace(id::text, '-', ''),
          phone = null,
          linkedin_url = null,
          companies = 'redacted',
          job_titles = 'redacted',
          notes = null,
          turnover = 'redacted',
          fo_aum = null,
          investable_capacity_usd = null,
          member_user_id = null
      where member_user_id = p_user_id
         or lower(email) = lower(v_email);

    update public.email_events
      set recipient = 'redacted',
          detail = null,
          payload = coalesce(payload, '{}'::jsonb) - 'user_id' - 'email'
      where recipient = v_email
         or coalesce(payload->>'user_id', '') = p_user_id::text;
  end if;

  if pg_catalog.to_regclass('public.member_intros') is not null then
    delete from public.member_intros
    where requester_id = p_user_id
       or target_id = p_user_id;
  end if;

  if pg_catalog.to_regclass('public.intro_suggestions') is not null then
    delete from public.intro_suggestions
    where member_id = p_user_id
       or suggested_id = p_user_id;
  end if;

  if pg_catalog.to_regclass('public.intro_meet_outcomes') is not null then
    delete from public.intro_meet_outcomes
    where member_id = p_user_id;
  end if;

  if pg_catalog.to_regclass('public.mandate_intros') is not null then
    delete from public.mandate_intros
    where member_id = p_user_id;
  end if;

  if pg_catalog.to_regclass('public.re_opportunity_intros') is not null then
    delete from public.re_opportunity_intros
    where member_id = p_user_id;
  end if;

  if pg_catalog.to_regclass('public.re_partner_intros') is not null then
    delete from public.re_partner_intros
    where member_id = p_user_id;
  end if;

  if pg_catalog.to_regclass('public.re_board_role_intros') is not null then
    delete from public.re_board_role_intros
    where member_id = p_user_id;
  end if;

  if pg_catalog.to_regclass('public.sponsor_intro_requests') is not null then
    delete from public.sponsor_intro_requests
    where member_id = p_user_id;
  end if;

  if pg_catalog.to_regclass('public.digest_notices') is not null then
    delete from public.digest_notices
    where member_id = p_user_id;
  end if;

  if pg_catalog.to_regclass('public.member_notifications') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'member_notifications'
        and column_name = 'member_id'
    ) then
      execute 'delete from public.member_notifications where member_id = $1' using p_user_id;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'member_notifications'
        and column_name = 'user_id'
    ) then
      execute 'delete from public.member_notifications where user_id = $1' using p_user_id;
    end if;
  end if;

  if pg_catalog.to_regclass('public.member_notification_prefs') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'member_notification_prefs'
        and column_name = 'member_id'
    ) then
      execute 'delete from public.member_notification_prefs where member_id = $1' using p_user_id;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'member_notification_prefs'
        and column_name = 'user_id'
    ) then
      execute 'delete from public.member_notification_prefs where user_id = $1' using p_user_id;
    end if;
  end if;

  if pg_catalog.to_regclass('public.member_push_tokens') is not null then
    delete from public.member_push_tokens
    where member_id = p_user_id;
  end if;

  if pg_catalog.to_regclass('public.notifications') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'notifications'
         and column_name = 'user_id'
     )
  then
    execute 'delete from public.notifications where user_id = $1' using p_user_id;
  end if;

  if pg_catalog.to_regclass('public.majlis_rsvps') is not null then
    delete from public.majlis_rsvps
    where member_id = p_user_id;
  end if;

  if pg_catalog.to_regclass('public.majlis_rsvp_limits') is not null then
    delete from public.majlis_rsvp_limits
    where member_id = p_user_id;
  end if;

  update public.profiles
    set full_name = 'Former member',
        headline = null,
        company = null,
        location = null,
        linkedin_url = null,
        bio = null,
        phone = null,
        investable_capacity_usd = null,
        fo_aum_usd = null,
        turnover_usd = null,
        include_in_public_aggregates = false,
        avatar_path = null,
        calendar_url = null,
        sector_tags = '{}',
        vision_themes = '{}',
        availability = null,
        city_key = null
    where user_id = p_user_id;

  update public.candidates
    set email = 'retired-' || replace(user_id::text, '-', ''),
        full_name = 'Former member',
        phone = null,
        linkedin_url = null,
        statement = null,
        company_name = null,
        job_title = null,
        company_website = null,
        board_seats = null,
        referral_name = null,
        cr_number = null,
        cr_country = null,
        scale_band = null,
        scale_kind = null,
        sector_tags = null,
        vision_tags = null,
        invite_reason = null,
        analytics_id = null,
        investable_capacity_usd = null
    where user_id = p_user_id;

  update public.members
    set email = 'retired-' || replace(user_id::text, '-', ''),
        status = 'suspended',
        directory_hidden = true,
        show_card_to_sponsors = false,
        left_at = coalesce(left_at, pg_catalog.now()),
        anonymised_at = pg_catalog.now()
    where user_id = p_user_id;

  update auth.users
    set email = 'retired-' || replace(id::text, '-', ''),
        raw_user_meta_data = '{}'::jsonb
    where id = p_user_id;

  if pg_catalog.to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using p_user_id;
  end if;

  if pg_catalog.to_regclass('auth.refresh_tokens') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'auth'
         and table_name = 'refresh_tokens'
         and column_name = 'user_id'
     )
  then
    execute 'delete from auth.refresh_tokens where user_id = $1' using p_user_id;
  end if;

  insert into public.account_closure_notices (notice)
  values ('A member closed their account.');

  return pg_catalog.jsonb_build_object(
    'status', 'ok',
    'analytics_id', v_analytics,
    'avatar_path', v_avatar
  );
end;
$fn$;


revoke all on function public.confirm_account_delete(uuid, text) from public;
revoke all on function public.confirm_account_delete(uuid, text) from anon, authenticated;
grant execute on function public.confirm_account_delete(uuid, text) to service_role;

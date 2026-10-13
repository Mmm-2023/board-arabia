-- Members and consideration accounts delete themselves after a one-time code.
-- Profile, directory card, intros, notifications and messages go now.
-- Legal records, consent rows and audit rows stay. The user reference is cleared
-- unless a legal hold is set.
-- Staff read the in-app closure notice through private.is_staff().
-- No schedule. No mail from this file. Factory does not apply this migration.

create table if not exists private.account_delete_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint account_delete_codes_hash_len check (char_length(code_hash) between 32 and 128),
  constraint account_delete_codes_attempts check (attempts >= 0 and attempts <= 20)
);

comment on table private.account_delete_codes is
  'One-time delete codes. Hashes only. Service role through the functions below.';

alter table private.account_delete_codes enable row level security;
alter table private.account_delete_codes force row level security;

revoke all on table private.account_delete_codes from public, anon, authenticated;
grant select, insert, update, delete on table private.account_delete_codes to service_role;

create index if not exists account_delete_codes_user_idx
  on private.account_delete_codes (user_id, created_at desc);

create table if not exists public.account_closure_notices (
  id uuid primary key default gen_random_uuid(),
  notice text not null,
  created_at timestamptz not null default now(),
  constraint account_closure_notices_notice_check check (
    char_length(btrim(notice)) between 1 and 200
    and position('@' in notice) = 0
  )
);

comment on table public.account_closure_notices is
  'In-app notice that a member closed an account. No name and no address.';

alter table public.account_closure_notices enable row level security;
alter table public.account_closure_notices force row level security;

revoke all on table public.account_closure_notices from public, anon, authenticated;
grant select on table public.account_closure_notices to authenticated;
grant select, insert on table public.account_closure_notices to service_role;

drop policy if exists account_closure_notices_select_staff on public.account_closure_notices;
create policy account_closure_notices_select_staff
  on public.account_closure_notices
  for select
  to authenticated
  using (private.is_staff());

-- Keep audit rows when the related intro or member reference is cleared.
alter table public.member_tier_audits alter column member_user_id drop not null;
alter table public.member_tier_audits alter column actor_id drop not null;
alter table public.member_intro_desk_audits alter column intro_id drop not null;
alter table public.member_intro_desk_audits alter column actor_id drop not null;
alter table public.member_intro_deal_audits alter column intro_id drop not null;
alter table public.member_intro_deal_audits alter column actor_id drop not null;
alter table public.ai_tool_consents alter column member_id drop not null;

do $fk$
declare
  v_name text;
  v_row record;
begin
  for v_row in
    select *
    from (values
      ('public', 'member_tier_audits', 'member_user_id', 'public.members', 'user_id'),
      ('public', 'member_intro_desk_audits', 'intro_id', 'public.member_intros', 'id'),
      ('public', 'member_intro_deal_audits', 'intro_id', 'public.member_intros', 'id'),
      ('public', 'ai_tool_consents', 'member_id', 'public.members', 'user_id')
    ) as listed(schema_name, table_name, column_name, ref_table, ref_column)
  loop
    select c.conname into v_name
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    join pg_catalog.pg_namespace n on n.oid = t.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid = t.oid and a.attnum = any (c.conkey)
    where n.nspname = v_row.schema_name
      and t.relname = v_row.table_name
      and c.contype = 'f'
      and a.attname = v_row.column_name;

    if v_name is not null then
      execute format('alter table %I.%I drop constraint %I', v_row.schema_name, v_row.table_name, v_name);
    end if;

    execute format(
      'alter table %I.%I add constraint %I foreign key (%I) references %s (%I) on delete set null',
      v_row.schema_name,
      v_row.table_name,
      v_row.table_name || '_' || v_row.column_name || '_fkey',
      v_row.column_name,
      v_row.ref_table,
      v_row.ref_column
    );
  end loop;
end
$fk$;

create or replace function public.issue_account_delete_code(
  p_user_id uuid,
  p_code_hash text,
  p_expires_at timestamptz
) returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_recent int;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_user_id is null
    or p_code_hash is null
    or char_length(p_code_hash) < 32
    or p_expires_at is null
  then
    raise exception 'invalid_code' using errcode = '22023';
  end if;

  if exists (select 1 from public.staff_users s where s.user_id = p_user_id) then
    return 'staff';
  end if;

  if exists (
    select 1 from public.members m
    where m.user_id = p_user_id
      and m.anonymised_at is not null
  ) then
    return 'closed';
  end if;

  if not exists (select 1 from public.members m where m.user_id = p_user_id)
     and not exists (select 1 from public.candidates c where c.user_id = p_user_id)
  then
    return 'missing';
  end if;

  if exists (
    select 1
    from private.account_delete_codes
    where user_id = p_user_id
      and created_at > pg_catalog.now() - interval '60 seconds'
  ) then
    return 'cooldown';
  end if;

  select count(*)::int into v_recent
  from private.account_delete_codes
  where user_id = p_user_id
    and created_at > pg_catalog.now() - interval '1 hour';

  if v_recent >= 5 then
    return 'rate_limited';
  end if;

  update private.account_delete_codes
    set used_at = pg_catalog.now()
    where user_id = p_user_id
      and used_at is null;

  insert into private.account_delete_codes (user_id, code_hash, expires_at)
  values (p_user_id, p_code_hash, p_expires_at);

  return 'ok';
end;
$fn$;

revoke all on function public.issue_account_delete_code(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.issue_account_delete_code(uuid, text, timestamptz) to service_role;

create or replace function public.void_account_delete_code(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update private.account_delete_codes
    set used_at = pg_catalog.now()
    where user_id = p_user_id
      and used_at is null;
end;
$fn$;

revoke all on function public.void_account_delete_code(uuid) from public, anon, authenticated;
grant execute on function public.void_account_delete_code(uuid) to service_role;

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

  if pg_catalog.to_regclass('public.messages') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'messages'
         and column_name = 'sender_id'
     )
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'messages'
         and column_name = 'recipient_id'
     )
  then
    execute 'delete from public.messages where sender_id = $1 or recipient_id = $1' using p_user_id;
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

revoke all on function public.confirm_account_delete(uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_account_delete(uuid, text) to service_role;

create or replace function public.list_account_closure_notices()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', listed.id,
        'created_at', listed.created_at,
        'notice', listed.notice
      )
      order by listed.created_at desc
    )
    from (
      select id, created_at, notice
      from public.account_closure_notices
      order by created_at desc
      limit 20
    ) listed
  ), '[]'::jsonb);
end;
$fn$;

revoke all on function public.list_account_closure_notices() from public, anon;
grant execute on function public.list_account_closure_notices() to authenticated, service_role;

comment on function public.list_account_closure_notices() is
  'Recent account closure notices for aal2 staff. private.is_staff() is the gate.';

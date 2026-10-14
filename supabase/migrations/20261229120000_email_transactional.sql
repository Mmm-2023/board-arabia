-- Transactional member notices.
-- Does not send mail. Does not schedule anything. Does not call a network.
-- The master switch stays off. Nothing in this file turns it on.
-- Existing weekly and news choices are not changed.
-- Apply after 20261220120000_email_core.sql.
-- Factory does not apply migrations.

alter table public.email_categories
  add column if not exists kind text not null default 'bulk',
  add column if not exists member_can_disable boolean not null default true;

alter table public.email_categories
  drop constraint if exists email_categories_kind_check;
alter table public.email_categories
  add constraint email_categories_kind_check
  check (kind in ('bulk', 'transactional', 'essential'));

alter table public.email_categories
  drop constraint if exists email_categories_essential_lock;
alter table public.email_categories
  add constraint email_categories_essential_lock
  check (kind <> 'essential' or member_can_disable = false);

comment on column public.email_categories.kind is
  'bulk, transactional, or essential. Essential mail cannot be turned off.';

comment on column public.email_categories.member_can_disable is
  'False for account security emails. set_email_preference rejects those.';

insert into public.email_categories (key, label, requires_opt_in, kind, member_can_disable)
values
  ('welcome', 'Welcome', false, 'transactional', true),
  ('message_new', 'New message', false, 'transactional', true),
  ('intro_suggested', 'Intro suggested', false, 'transactional', true),
  ('invite', 'Invite', false, 'transactional', true),
  ('event_reminder', 'Event reminder', false, 'transactional', true),
  ('mandate_update', 'Mandate update', false, 'transactional', true),
  ('newsletter_ready', 'Newsletter ready', false, 'transactional', true),
  ('security_signin', 'Sign-in', false, 'essential', false),
  ('security_two_step', 'Two-step sign-in', false, 'essential', false),
  ('security_deletion', 'Account deletion', false, 'essential', false)
on conflict (key) do update
set label = excluded.label,
    requires_opt_in = excluded.requires_opt_in,
    kind = excluded.kind,
    member_can_disable = excluded.member_can_disable;

alter table public.email_sends
  alter column campaign_id drop not null;

alter table public.email_sends
  add column if not exists kind text,
  add column if not exists type_key text,
  add column if not exists ref_id uuid;

alter table public.email_sends
  drop constraint if exists email_sends_kind_check;
alter table public.email_sends
  add constraint email_sends_kind_check
  check (kind is null or kind in ('bulk', 'transactional', 'essential'));

alter table public.email_sends
  drop constraint if exists email_sends_notice_shape_check;
alter table public.email_sends
  add constraint email_sends_notice_shape_check
  check (
    (type_key is null and ref_id is null)
    or (type_key is not null and ref_id is not null and campaign_id is null)
  );

alter table public.email_sends
  drop constraint if exists email_sends_user_id_fkey;

create unique index if not exists email_sends_notice_once
  on public.email_sends (type_key, ref_id, user_id)
  where type_key is not null and ref_id is not null and user_id is not null;

comment on column public.email_sends.type_key is
  'Notice type for a transactional row. Bulk campaign rows leave this empty.';

comment on column public.email_sends.ref_id is
  'Event row id. A retried event uses the same id and does not mail twice.';

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  type_key text not null references public.email_categories (key),
  user_id uuid not null,
  ref_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  skip_reason text,
  created_at timestamptz not null default pg_catalog.now(),
  constraint email_outbox_status_check check (status in ('pending', 'skipped', 'sent', 'failed')),
  constraint email_outbox_payload_object check (pg_catalog.jsonb_typeof(payload) = 'object'),
  constraint email_outbox_skip_len check (skip_reason is null or char_length(skip_reason) <= 80),
  constraint email_outbox_once unique (type_key, ref_id, user_id)
);

comment on table public.email_outbox is
  'Ids only. No copy and no addresses. Drained only by an explicit call. No schedule.';

create index if not exists email_outbox_pending_idx
  on public.email_outbox (created_at)
  where status = 'pending';

alter table public.email_outbox enable row level security;
alter table public.email_outbox force row level security;
revoke all on table public.email_outbox from public, anon, authenticated, service_role;

create or replace function private.notice_payload_ids(p_payload jsonb)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $fn$
declare
  k text;
  v jsonb;
  item jsonb;
  cleaned jsonb := '{}'::jsonb;
  token text;
begin
  if p_payload is null or p_payload = 'null'::jsonb then
    return '{}'::jsonb;
  end if;
  if pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload_ids_only' using errcode = '22023';
  end if;
  for k, v in
    select entry.key, entry.value
    from pg_catalog.jsonb_each(p_payload) as entry(key, value)
  loop
    if k !~ '^[a-z0-9_]+$' then
      raise exception 'payload_ids_only' using errcode = '22023';
    end if;
    if pg_catalog.jsonb_typeof(v) = 'string' then
      token := pg_catalog.lower(v #>> '{}');
      if token !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'payload_ids_only' using errcode = '22023';
      end if;
      cleaned := cleaned || pg_catalog.jsonb_build_object(k, to_jsonb(token));
    elsif pg_catalog.jsonb_typeof(v) = 'array' then
      for item in
        select element.value
        from pg_catalog.jsonb_array_elements(v) as element(value)
      loop
        if pg_catalog.jsonb_typeof(item) <> 'string' then
          raise exception 'payload_ids_only' using errcode = '22023';
        end if;
        token := pg_catalog.lower(item #>> '{}');
        if token !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception 'payload_ids_only' using errcode = '22023';
        end if;
      end loop;
      cleaned := cleaned || pg_catalog.jsonb_build_object(k, v);
    elsif pg_catalog.jsonb_typeof(v) = 'object' then
      cleaned := cleaned || pg_catalog.jsonb_build_object(k, private.notice_payload_ids(v));
    else
      raise exception 'payload_ids_only' using errcode = '22023';
    end if;
  end loop;
  return cleaned;
end;
$fn$;

revoke all on function private.notice_payload_ids(jsonb) from public, anon, authenticated;

create or replace function private.notice_address(p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_email text;
  v_demo boolean;
  v_anon timestamptz;
begin
  if p_user is null then
    return null;
  end if;
  select m.email, m.is_demo, m.anonymised_at
    into v_email, v_demo, v_anon
  from public.members m
  where m.user_id = p_user;
  if found then
    if coalesce(v_demo, false) or v_anon is not null then
      return null;
    end if;
    if v_email is not null and pg_catalog.btrim(v_email) <> '' then
      return pg_catalog.lower(pg_catalog.btrim(v_email));
    end if;
  end if;
  select pg_catalog.lower(pg_catalog.btrim(u.email))
    into v_email
  from auth.users u
  where u.id = p_user
    and u.email is not null
    and pg_catalog.btrim(u.email) <> '';
  if v_email is not null then
    return v_email;
  end if;
  select pg_catalog.lower(pg_catalog.btrim(c.email))
    into v_email
  from public.candidates c
  where c.user_id = p_user
    and pg_catalog.btrim(c.email) <> '';
  if v_email is not null then
    return v_email;
  end if;
  select pg_catalog.lower(pg_catalog.btrim(s.email))
    into v_email
  from public.staff_users s
  where s.user_id = p_user
    and s.email is not null
    and pg_catalog.btrim(s.email) <> '';
  return v_email;
end;
$fn$;

revoke all on function private.notice_address(uuid) from public, anon, authenticated;

create or replace function private.transactional_eligible(p_type text, p_user uuid)
returns table (ok boolean, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_kind text;
  v_master boolean;
  v_demo boolean;
  v_anon timestamptz;
  v_member boolean := false;
  v_address text;
  v_hash text;
  v_opt boolean;
  v_have_pref boolean := false;
  v_owner boolean := false;
begin
  select c.kind into v_kind
  from public.email_categories c
  where c.key = p_type
    and c.kind in ('transactional', 'essential');
  if v_kind is null then
    ok := false;
    reason := 'unknown_type';
    return next;
    return;
  end if;

  select s.master_enabled into v_master
  from public.email_settings s
  where s.id;
  if coalesce(v_master, false) is not true then
    ok := false;
    reason := 'master_off';
    return next;
    return;
  end if;

  select m.is_demo, m.anonymised_at
    into v_demo, v_anon
  from public.members m
  where m.user_id = p_user;
  v_member := found;
  if v_member and v_anon is not null then
    ok := false;
    reason := 'anonymised';
    return next;
    return;
  end if;
  if v_member and coalesce(v_demo, false) then
    ok := false;
    reason := 'demo';
    return next;
    return;
  end if;

  v_address := private.notice_address(p_user);
  if v_address is null or pg_catalog.btrim(v_address) = '' then
    ok := false;
    reason := 'no_address';
    return next;
    return;
  end if;

  v_hash := private.email_address_hash(v_address);
  if v_kind = 'essential' then
    if exists (
      select 1
      from public.email_suppressions s
      where s.email_hash = v_hash
        and s.reason = 'invalid'
    ) then
      ok := false;
      reason := 'suppressed';
      return next;
      return;
    end if;
  else
    if exists (
      select 1
      from public.email_suppressions s
      where s.email_hash = v_hash
        and s.reason in ('hard_bounce', 'complaint', 'admin', 'invalid')
    ) then
      ok := false;
      reason := 'suppressed';
      return next;
      return;
    end if;

    if p_type = 'newsletter_ready' then
      select exists (
        select 1
        from public.staff_users s
        where s.user_id = p_user
          and s.role = 'master'
      ) into v_owner;
      if not coalesce(v_owner, false) then
        ok := false;
        reason := 'not_owner';
        return next;
        return;
      end if;
      select p.opted_in into v_opt
      from public.email_preferences p
      where p.user_id = p_user
        and p.category = p_type;
      v_have_pref := found;
      if v_have_pref and v_opt is false then
        ok := false;
        reason := 'opted_out';
        return next;
        return;
      end if;
    else
      select p.opted_in into v_opt
      from public.email_preferences p
      where p.user_id = p_user
        and p.category = p_type;
      v_have_pref := found;
      if (not v_have_pref or v_opt is distinct from true)
         and not (not v_member and p_type = 'welcome') then
        ok := false;
        reason := 'opted_out';
        return next;
        return;
      end if;
    end if;
  end if;

  ok := true;
  reason := null;
  return next;
end;
$fn$;

revoke all on function private.transactional_eligible(text, uuid) from public, anon, authenticated;

comment on function private.transactional_eligible(text, uuid) is
  'Master off skips every type, including essential. A hard bounce, complaint, or admin block skips non-essential mail. invalid skips essential mail too. Does not send mail.';

create or replace function private.enqueue_member_notice(
  p_type text,
  p_user uuid,
  p_ref uuid,
  p_payload jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_id uuid;
  v_ok boolean;
  v_reason text;
  v_hash text;
  v_kind text;
  v_payload jsonb;
  v_status text;
  v_skip text;
begin
  if p_user is null or p_ref is null or p_type is null then
    return null;
  end if;
  if not exists (
    select 1
    from public.email_categories c
    where c.key = p_type
      and c.kind in ('transactional', 'essential')
  ) then
    return null;
  end if;

  v_payload := private.notice_payload_ids(coalesce(p_payload, '{}'::jsonb));
  select e.ok, e.reason into v_ok, v_reason
  from private.transactional_eligible(p_type, p_user) e;
  v_status := case when coalesce(v_ok, false) then 'pending' else 'skipped' end;
  v_skip := case
    when coalesce(v_ok, false) then null
    else pg_catalog.left(coalesce(v_reason, 'skipped'), 80)
  end;

  insert into public.email_outbox (type_key, user_id, ref_id, payload, status, skip_reason)
  values (p_type, p_user, p_ref, v_payload, v_status, v_skip)
  on conflict (type_key, ref_id, user_id) do nothing
  returning id into v_id;

  if v_id is null then
    select o.id into v_id
    from public.email_outbox o
    where o.type_key = p_type
      and o.ref_id = p_ref
      and o.user_id = p_user;
    return v_id;
  end if;

  select c.kind into v_kind
  from public.email_categories c
  where c.key = p_type;
  v_hash := private.email_address_hash(private.notice_address(p_user));
  if v_hash is not null then
    insert into public.email_sends (
      campaign_id, user_id, email_hash, status, skip_reason, kind, type_key, ref_id
    ) values (
      null,
      p_user,
      v_hash,
      case when v_status = 'pending' then 'queued' else 'skipped' end,
      v_skip,
      v_kind,
      p_type,
      p_ref
    )
    on conflict (type_key, ref_id, user_id)
      where type_key is not null and ref_id is not null and user_id is not null
    do nothing;
  end if;
  return v_id;
end;
$fn$;

revoke all on function private.enqueue_member_notice(text, uuid, uuid, jsonb)
  from public, anon, authenticated;

comment on function private.enqueue_member_notice(text, uuid, uuid, jsonb) is
  'No client grant. Definers and the service role wrapper call this. A second call with the same type, ref, and member does not add a row. Does not send mail.';

create or replace function public.service_enqueue_member_notice(
  p_type text,
  p_user uuid,
  p_ref uuid,
  p_payload jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return private.enqueue_member_notice(p_type, p_user, p_ref, p_payload);
end;
$fn$;

revoke all on function public.service_enqueue_member_notice(text, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.service_enqueue_member_notice(text, uuid, uuid, jsonb)
  to service_role;

comment on function public.service_enqueue_member_notice(text, uuid, uuid, jsonb) is
  'Service role door to the private enqueue. No anon or member grant. Does not send mail.';

create or replace function public.service_claim_member_notices(p_limit integer)
returns table (
  outbox_id uuid,
  type_key text,
  user_id uuid,
  ref_id uuid,
  address text,
  unsubscribe_token text,
  essential boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_limit integer;
  v_master boolean;
  row record;
  v_ok boolean;
  v_reason text;
  v_kind text;
  v_address text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select s.master_enabled, s.batch_size
    into v_master, v_limit
  from public.email_settings s
  where s.id;
  if p_limit between 1 and 100 then
    v_limit := least(p_limit, coalesce(v_limit, 50));
  else
    v_limit := coalesce(v_limit, 50);
  end if;

  if coalesce(v_master, false) is not true then
    update public.email_outbox o
    set status = 'skipped',
        skip_reason = 'master_off'
    where o.status = 'pending';
    update public.email_sends s
    set status = 'skipped',
        skip_reason = 'master_off',
        updated_at = pg_catalog.now()
    where s.type_key is not null
      and s.status = 'queued';
    return;
  end if;

  for row in
    select o.id, o.type_key, o.user_id, o.ref_id
    from public.email_outbox o
    where o.status = 'pending'
    order by o.created_at
    limit v_limit
    for update skip locked
  loop
    select e.ok, e.reason into v_ok, v_reason
    from private.transactional_eligible(row.type_key, row.user_id) e;
    if not coalesce(v_ok, false) then
      update public.email_outbox
      set status = 'skipped',
          skip_reason = pg_catalog.left(coalesce(v_reason, 'skipped'), 80)
      where id = row.id;
      update public.email_sends
      set status = 'skipped',
          skip_reason = pg_catalog.left(coalesce(v_reason, 'skipped'), 80),
          updated_at = pg_catalog.now()
      where email_sends.type_key = row.type_key
        and email_sends.ref_id = row.ref_id
        and email_sends.user_id = row.user_id;
      continue;
    end if;

    select c.kind into v_kind
    from public.email_categories c
    where c.key = row.type_key;
    v_address := private.notice_address(row.user_id);
    outbox_id := row.id;
    type_key := row.type_key;
    user_id := row.user_id;
    ref_id := row.ref_id;
    address := v_address;
    essential := v_kind = 'essential';
    if essential then
      unsubscribe_token := null;
    else
      unsubscribe_token := private.email_unsub_token(row.user_id, row.type_key);
    end if;
    return next;
  end loop;
end;
$fn$;

revoke all on function public.service_claim_member_notices(integer)
  from public, anon, authenticated;
grant execute on function public.service_claim_member_notices(integer) to service_role;

comment on function public.service_claim_member_notices(integer) is
  'Service role only. Re-checks eligibility. Master off skips every pending row and returns none. Does not send mail.';

create or replace function public.service_finish_member_notice(
  p_outbox_id uuid,
  p_status text,
  p_reason text,
  p_provider_message_id text
) returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_type text;
  v_user uuid;
  v_ref uuid;
  v_status text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_status not in ('sent', 'failed', 'skipped') then
    raise exception 'not_allowed' using errcode = '22023';
  end if;
  v_status := p_status;

  update public.email_outbox o
  set status = v_status,
      skip_reason = case
        when v_status = 'sent' then null
        else pg_catalog.left(coalesce(p_reason, v_status), 80)
      end
  where o.id = p_outbox_id
    and o.status = 'pending'
  returning o.type_key, o.user_id, o.ref_id
  into v_type, v_user, v_ref;

  if v_type is null then
    return;
  end if;

  update public.email_sends s
  set status = case when v_status = 'sent' then 'sent' else v_status end,
      skip_reason = case
        when v_status = 'sent' then null
        else pg_catalog.left(coalesce(p_reason, v_status), 80)
      end,
      provider_message_id = case
        when v_status = 'sent' then pg_catalog.left(coalesce(p_provider_message_id, ''), 120)
        else s.provider_message_id
      end,
      updated_at = pg_catalog.now(),
      attempt = s.attempt + 1
  where s.type_key = v_type
    and s.ref_id = v_ref
    and s.user_id = v_user;
end;
$fn$;

revoke all on function public.service_finish_member_notice(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.service_finish_member_notice(uuid, text, text, text)
  to service_role;

create or replace function public.service_notice_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_master boolean;
  v_batch integer;
  v_pause integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select s.master_enabled, s.batch_size, s.batch_pause_ms
    into v_master, v_batch, v_pause
  from public.email_settings s
  where s.id;
  return pg_catalog.jsonb_build_object(
    'master_enabled', coalesce(v_master, false),
    'batch_size', coalesce(v_batch, 50),
    'batch_pause_ms', coalesce(v_pause, 1500)
  );
end;
$fn$;

revoke all on function public.service_notice_settings() from public, anon, authenticated;
grant execute on function public.service_notice_settings() to service_role;

comment on function public.service_notice_settings() is
  'Service role only. Returns the switch, batch size, and pause. No addresses. Does not send mail.';

create or replace function private.email_apply_admit_defaults(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  cat record;
  opted boolean;
  act text;
begin
  if p_user_id is null then
    return;
  end if;
  if not exists (select 1 from public.members m where m.user_id = p_user_id) then
    return;
  end if;
  if exists (
    select 1
    from public.email_preferences p
    where p.user_id = p_user_id
      and p.category = 'weekly_digest'
  ) then
    return;
  end if;

  for cat in
    select c.key, c.requires_opt_in
    from public.email_categories c
    where c.kind = 'bulk'
    order by c.key
  loop
    opted := not cat.requires_opt_in;
    act := case when opted then 'opt_in' else 'opt_out' end;
    insert into public.email_preferences (user_id, category, opted_in, updated_at)
    values (p_user_id, cat.key, opted, pg_catalog.now());
    insert into public.email_consent_log (
      user_id, email_hash, category, action, source, notice_version
    )
    select
      p_user_id,
      private.email_address_hash(m.email),
      cat.key,
      act,
      'admit',
      'email-core-1'
    from public.members m
    where m.user_id = p_user_id
      and private.email_address_hash(m.email) is not null;
    if cat.key = 'weekly_digest' and opted then
      update public.members
      set digest_email_opt_in = true
      where user_id = p_user_id;
    end if;
  end loop;

  for cat in
    select c.key
    from public.email_categories c
    where c.kind = 'transactional'
      and c.key <> 'newsletter_ready'
    order by c.key
  loop
    insert into public.email_preferences (user_id, category, opted_in, updated_at)
    values (p_user_id, cat.key, true, pg_catalog.now())
    on conflict (user_id, category) do nothing;
    insert into public.email_consent_log (
      user_id, email_hash, category, action, source, notice_version
    )
    select
      p_user_id,
      private.email_address_hash(m.email),
      cat.key,
      'opt_in',
      'service_default',
      'email-transactional-1'
    from public.members m
    where m.user_id = p_user_id
      and private.email_address_hash(m.email) is not null
      and not exists (
        select 1
        from public.email_consent_log existing
        where existing.user_id = p_user_id
          and existing.category = cat.key
          and existing.source = 'service_default'
      );
  end loop;
end;
$fn$;

revoke all on function private.email_apply_admit_defaults(uuid) from public, anon, authenticated;

comment on function private.email_apply_admit_defaults(uuid) is
  'Weekly email on and news off for a new member, logged with source admit. Transactional notices default on and are logged with source service_default. A member who already has a weekly preference is left as they are.';

create or replace function public.my_email_preferences()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  weekly_col boolean;
  weekly_pref boolean;
  news_pref boolean;
  v_master boolean;
  v_notices jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select m.digest_email_opt_in into weekly_col
  from public.members m
  where m.user_id = auth.uid()
    and m.status in ('invited', 'active');
  if not found then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select p.opted_in into weekly_pref
  from public.email_preferences p
  where p.user_id = auth.uid() and p.category = 'weekly_digest';
  select p.opted_in into news_pref
  from public.email_preferences p
  where p.user_id = auth.uid() and p.category = 'news_invitations';
  select s.master_enabled into v_master
  from public.email_settings s
  where s.id;
  select coalesce(pg_catalog.jsonb_object_agg(c.key, coalesce(p.opted_in, false)), '{}'::jsonb)
    into v_notices
  from public.email_categories c
  left join public.email_preferences p
    on p.category = c.key
   and p.user_id = auth.uid()
  where c.kind = 'transactional'
    and c.key <> 'newsletter_ready';
  return pg_catalog.jsonb_build_object(
    'weekly_digest', coalesce(weekly_pref, weekly_col, false),
    'news_invitations', coalesce(news_pref, false),
    'master_enabled', coalesce(v_master, false),
    'notices', coalesce(v_notices, '{}'::jsonb),
    'essential_always_on', true
  );
end;
$fn$;

revoke all on function public.my_email_preferences() from public, anon;
grant execute on function public.my_email_preferences() to authenticated;

create or replace function public.set_email_preference(p_category text, p_opt_in boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  next_value boolean;
  act text;
  v_can boolean;
begin
  if auth.uid() is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.members m
    where m.user_id = auth.uid()
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select c.member_can_disable into v_can
  from public.email_categories c
  where c.key = p_category;
  if v_can is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_can is false then
    raise exception 'essential_email' using errcode = '22023';
  end if;
  if p_category = 'newsletter_ready' and not private.is_owner() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  next_value := coalesce(p_opt_in, false);
  act := case when next_value then 'opt_in' else 'opt_out' end;
  perform private.email_save_preference(auth.uid(), p_category, next_value, 'privacy_panel', act);
  return public.my_email_preferences();
end;
$fn$;

revoke all on function public.set_email_preference(text, boolean) from public, anon;
grant execute on function public.set_email_preference(text, boolean) to authenticated;

comment on function public.set_email_preference(text, boolean) is
  'Signed-in member sets one category. Essential categories are rejected. Writes a consent row with source privacy_panel. Does not send mail.';

create or replace function public.own_staff_notice_preference()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_opt boolean;
  v_have boolean := false;
  v_master boolean;
begin
  if not private.is_owner() then
    return pg_catalog.jsonb_build_object('visible', false);
  end if;
  select p.opted_in into v_opt
  from public.email_preferences p
  where p.user_id = auth.uid()
    and p.category = 'newsletter_ready';
  v_have := found;
  select s.master_enabled into v_master
  from public.email_settings s
  where s.id;
  return pg_catalog.jsonb_build_object(
    'visible', true,
    'newsletter_ready', case when v_have then coalesce(v_opt, false) else true end,
    'master_enabled', coalesce(v_master, false)
  );
end;
$fn$;

revoke all on function public.own_staff_notice_preference() from public, anon;
grant execute on function public.own_staff_notice_preference() to authenticated;

comment on function public.own_staff_notice_preference() is
  'Owner only. Newsletter ready is a staff setting. Missing choice stays on. Does not send mail.';

create or replace function public.staff_decide_mandate_intro(
  p_intro_id uuid,
  p_decision text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  next_status text;
  v_member uuid;
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

  if exists (
    select 1
    from public.mandate_intros i
    join public.mandates m on m.id = i.mandate_id
    where i.id = p_intro_id
      and (m.is_demo or private.sample_subject(m.id))
  ) then
    raise exception 'sample_blocked' using errcode = '42501';
  end if;

  update public.mandate_intros
  set status = next_status,
      decided_at = pg_catalog.now(),
      decided_by = auth.uid()
  where id = p_intro_id
    and status = 'pending';

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select i.member_id into v_member
  from public.mandate_intros i
  where i.id = p_intro_id;

  perform private.enqueue_member_notice(
    'mandate_update',
    v_member,
    p_intro_id,
    pg_catalog.jsonb_build_object('intro_id', p_intro_id)
  );

  return pg_catalog.jsonb_build_object('ok', true, 'status', next_status);
end;
$fn$;

revoke all on function public.staff_decide_mandate_intro(uuid, text) from public, anon;
grant execute on function public.staff_decide_mandate_intro(uuid, text) to authenticated;

create or replace function public.staff_decide_digest_issue(p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_year integer;
  v_week integer;
  v_id uuid;
  v_status text;
  v_audience text[];
  owner record;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_action is distinct from 'approve' and p_action is distinct from 'withdraw' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select extracted.iso_year, extracted.iso_week
    into v_year, v_week
  from private.digest_week(pg_catalog.now()) as extracted;

  select i.id, i.status, i.audience
    into v_id, v_status, v_audience
  from public.digest_issues i
  where i.iso_year = v_year
    and i.iso_week = v_week
  for update;

  if v_id is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_action = 'approve' and v_status = 'draft' then
    if coalesce(pg_catalog.cardinality(v_audience), 0) < 1 then
      raise exception 'audience_required' using errcode = '42501';
    end if;

    update public.digest_issues
    set status = 'approved',
        approved_by = auth.uid(),
        approved_at = pg_catalog.now()
    where id = v_id;

    insert into public.digest_issue_log (issue_id, action, actor_id)
    values (v_id, 'approved', auth.uid());

    perform private.deliver_digest_notices(v_id);

    for owner in
      select s.user_id
      from public.staff_users s
      where s.role = 'master'
    loop
      perform private.enqueue_member_notice(
        'newsletter_ready',
        owner.user_id,
        v_id,
        pg_catalog.jsonb_build_object('issue_id', v_id)
      );
    end loop;
  elsif p_action = 'withdraw' and v_status in ('draft', 'approved') then
    update public.digest_issues
    set status = 'withdrawn'
    where id = v_id;

    insert into public.digest_issue_log (issue_id, action, actor_id)
    values (v_id, 'withdrawn', auth.uid());

    perform private.deliver_digest_notices(v_id);
  else
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return private.digest_issue_state();
end;
$fn$;

revoke all on function public.staff_decide_digest_issue(text) from public, anon;
grant execute on function public.staff_decide_digest_issue(text) to authenticated;

create or replace function public.email_consent_retention(p_apply boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  due_ids uuid[];
  removed integer := 0;
begin
  select coalesce(pg_catalog.array_agg(l.id), array[]::uuid[])
    into due_ids
  from public.email_consent_log l
  left join public.members m on m.user_id = l.user_id
  where (
    m.user_id is not null
    and m.left_at is not null
    and m.left_at < pg_catalog.now() - interval '24 months'
  ) or (
    m.user_id is null
    and l.created_at < pg_catalog.now() - interval '24 months'
  );

  if coalesce(p_apply, false) and coalesce(pg_catalog.cardinality(due_ids), 0) > 0 then
    delete from public.email_consent_log l
    where l.id = any (due_ids);
    get diagnostics removed = row_count;
  end if;

  if coalesce(p_apply, false) then
    delete from public.email_outbox o
    where o.created_at < pg_catalog.now() - interval '24 months'
      and not exists (
        select 1
        from public.members m
        where m.user_id = o.user_id
          and m.left_at is null
      );
    delete from public.email_sends s
    where s.type_key is not null
      and s.created_at < pg_catalog.now() - interval '24 months'
      and not exists (
        select 1
        from public.members m
        where m.user_id = s.user_id
          and m.left_at is null
      );
  end if;

  return pg_catalog.jsonb_build_object(
    'item', 'email_consent_log',
    'due', coalesce(pg_catalog.cardinality(due_ids), 0),
    'removed', removed,
    'applied', coalesce(p_apply, false)
  );
end;
$fn$;

revoke all on function public.email_consent_retention(boolean) from public, anon, authenticated;
grant execute on function public.email_consent_retention(boolean) to service_role;

-- Email data and consent core.
-- Does not send mail. Does not schedule anything. Does not call a network.
-- The master switch defaults to off.
-- Weekly email is on for a new member at admit, and that choice is logged.
-- News and invitations stays off until the member opts in, and that choice is logged.
-- Existing weekly choices are copied and not changed.
-- Apply after 20261217120000_owner_staff_gate.sql.
-- Factory does not apply migrations.

create table if not exists public.email_categories (
  key text primary key,
  label text not null,
  requires_opt_in boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  constraint email_categories_key_check check (key ~ '^[a-z0-9_]+$'),
  constraint email_categories_label_check check (char_length(pg_catalog.btrim(label)) between 1 and 80)
);

comment on table public.email_categories is
  'Email categories. Weekly email does not require opt-in. News and invitations does.';

insert into public.email_categories (key, label, requires_opt_in)
values
  ('weekly_digest', 'Weekly email', false),
  ('news_invitations', 'News and invitations', true)
on conflict (key) do nothing;

alter table public.email_categories enable row level security;
alter table public.email_categories force row level security;
revoke all on table public.email_categories from public, anon, authenticated, service_role;

create table if not exists public.email_preferences (
  user_id uuid not null references public.members (user_id) on delete cascade,
  category text not null references public.email_categories (key),
  opted_in boolean not null,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, category)
);

comment on table public.email_preferences is
  'One row per member and category. Access is through definers. No client grant.';

alter table public.email_preferences enable row level security;
alter table public.email_preferences force row level security;
revoke all on table public.email_preferences from public, anon, authenticated, service_role;

create table if not exists public.email_consent_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email_hash text not null,
  category text not null references public.email_categories (key),
  action text not null,
  source text not null,
  notice_version text,
  created_at timestamptz not null default pg_catalog.now(),
  constraint email_consent_log_hash_check check (email_hash ~ '^[0-9a-f]{64}$'),
  constraint email_consent_log_action_check check (
    action in (
      'opt_in',
      'opt_out',
      'unsubscribe_link',
      'list_unsubscribe_post',
      'admin_suppress',
      'bounce',
      'complaint'
    )
  ),
  constraint email_consent_log_source_check check (source ~ '^[a-z0-9_]+$'),
  constraint email_consent_log_notice_check check (
    notice_version is null or char_length(notice_version) <= 40
  )
);

comment on table public.email_consent_log is
  'Append-only email consent. Stores a hash of the address, not the address. Kept while the member exists, then 24 months after the member leaves. Not purged by the 13 month cookie rule.';

comment on column public.email_consent_log.email_hash is
  'SHA-256 of the lower-case trimmed address. The address is not stored.';

create index if not exists email_consent_log_user_idx
  on public.email_consent_log (user_id, created_at desc);

alter table public.email_consent_log enable row level security;
alter table public.email_consent_log force row level security;
revoke all on table public.email_consent_log from public, anon, authenticated, service_role;

create table if not exists public.email_suppressions (
  email_hash text primary key,
  reason text not null,
  source text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint email_suppressions_hash_check check (email_hash ~ '^[0-9a-f]{64}$'),
  constraint email_suppressions_reason_check check (
    reason in ('unsubscribe', 'hard_bounce', 'complaint', 'admin', 'invalid')
  ),
  constraint email_suppressions_source_check check (source ~ '^[a-z0-9_]+$')
);

comment on table public.email_suppressions is
  'Suppression by address hash so it survives member deletion. The address is not stored.';

alter table public.email_suppressions enable row level security;
alter table public.email_suppressions force row level security;
revoke all on table public.email_suppressions from public, anon, authenticated, service_role;

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  digest_issue_id uuid references public.digest_issues (id) on delete restrict,
  category text not null references public.email_categories (key),
  subject text not null default '',
  preheader text not null default '',
  body_text text not null default '',
  body_html_sanitised text not null default '',
  audience_tiers text[] not null default '{}',
  status text not null default 'draft',
  created_by uuid not null,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  constraint email_campaigns_kind_check check (kind in ('digest', 'campaign')),
  constraint email_campaigns_status_check check (
    status in ('draft', 'approved', 'test_sent', 'sending', 'sent', 'cancelled')
  ),
  constraint email_campaigns_subject_len check (char_length(subject) <= 180),
  constraint email_campaigns_preheader_len check (char_length(preheader) <= 180),
  constraint email_campaigns_body_len check (char_length(body_text) <= 8000),
  constraint email_campaigns_html_len check (char_length(body_html_sanitised) <= 20000),
  constraint email_campaigns_digest_link_check check (
    (kind = 'digest' and digest_issue_id is not null)
    or (kind = 'campaign' and digest_issue_id is null)
  )
);

comment on table public.email_campaigns is
  'A campaign references an approved digest issue. It does not copy the editor. Nothing here sends mail.';

create index if not exists email_campaigns_issue_idx
  on public.email_campaigns (digest_issue_id);

alter table public.email_campaigns enable row level security;
alter table public.email_campaigns force row level security;
revoke all on table public.email_campaigns from public, anon, authenticated, service_role;

create table if not exists public.email_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns (id) on delete cascade,
  user_id uuid references public.members (user_id) on delete set null,
  email_hash text not null,
  status text not null default 'queued',
  skip_reason text,
  provider_message_id text,
  is_test boolean not null default false,
  attempt integer not null default 0,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint email_sends_hash_check check (email_hash ~ '^[0-9a-f]{64}$'),
  constraint email_sends_status_check check (
    status in ('queued', 'skipped', 'sent', 'delivered', 'bounced', 'complained', 'failed')
  ),
  constraint email_sends_attempt_check check (attempt >= 0),
  constraint email_sends_skip_len check (skip_reason is null or char_length(skip_reason) <= 80)
);

comment on table public.email_sends is
  'Send log. One live row per campaign and member. Test rows are separate. Nothing here sends mail.';

create unique index if not exists email_sends_live_member_once
  on public.email_sends (campaign_id, user_id)
  where is_test = false and user_id is not null;

create index if not exists email_sends_provider_idx
  on public.email_sends (provider_message_id)
  where provider_message_id is not null;

alter table public.email_sends enable row level security;
alter table public.email_sends force row level security;
revoke all on table public.email_sends from public, anon, authenticated, service_role;

create table if not exists public.email_settings (
  id boolean primary key default true,
  master_enabled boolean not null default false,
  batch_size integer not null default 50,
  batch_pause_ms integer not null default 1500,
  updated_by uuid,
  updated_at timestamptz,
  constraint email_settings_singleton check (id),
  constraint email_settings_batch_size_check check (batch_size between 1 and 100),
  constraint email_settings_pause_check check (batch_pause_ms between 0 and 10000)
);

comment on table public.email_settings is
  'One row. The master switch defaults to off. No send runs from this table.';

insert into public.email_settings (id, master_enabled, batch_size, batch_pause_ms)
values (true, false, 50, 1500)
on conflict (id) do nothing;

alter table public.email_settings enable row level security;
alter table public.email_settings force row level security;
revoke all on table public.email_settings from public, anon, authenticated, service_role;

create table if not exists public.email_master_log (
  id uuid primary key default gen_random_uuid(),
  enabled boolean not null,
  actor_id uuid not null,
  created_at timestamptz not null default pg_catalog.now()
);

comment on table public.email_master_log is
  'Owner changes to the master switch. No address is stored.';

alter table public.email_master_log enable row level security;
alter table public.email_master_log force row level security;
revoke all on table public.email_master_log from public, anon, authenticated, service_role;

create table if not exists private.email_secrets (
  id boolean primary key default true,
  key_version integer not null default 1,
  hmac_key bytea not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint email_secrets_singleton check (id),
  constraint email_secrets_version_check check (key_version > 0)
);

comment on table private.email_secrets is
  'Unsubscribe signing key. Generated at apply. Never returned. No role can select it.';

insert into private.email_secrets (id, key_version, hmac_key)
values (true, 1, extensions.gen_random_bytes(32))
on conflict (id) do nothing;

alter table private.email_secrets enable row level security;
alter table private.email_secrets force row level security;
revoke all on table private.email_secrets from public, anon, authenticated, service_role;

create or replace function private.email_address_hash(p_email text)
returns text
language sql
immutable
security definer
set search_path = ''
as $fn$
  select case
    when p_email is null or pg_catalog.btrim(p_email) = '' then null
    else encode(
      extensions.digest(convert_to(pg_catalog.lower(pg_catalog.btrim(p_email)), 'UTF8'), 'sha256'),
      'hex'
    )
  end;
$fn$;

revoke all on function private.email_address_hash(text) from public, anon, authenticated;

create or replace function private.email_backfill_weekly()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  insert into public.email_preferences (user_id, category, opted_in, updated_at)
  select m.user_id, 'weekly_digest', m.digest_email_opt_in, pg_catalog.now()
  from public.members m
  on conflict (user_id, category) do nothing;
end;
$fn$;

revoke all on function private.email_backfill_weekly() from public, anon, authenticated;

comment on function private.email_backfill_weekly() is
  'Copy the current weekly column into preferences. Does not change the column and does not write a consent row.';

select private.email_backfill_weekly();

create or replace function private.email_save_preference(
  p_user_id uuid,
  p_category text,
  p_opt_in boolean,
  p_source text,
  p_action text
) returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  current_opt boolean;
  have_row boolean;
begin
  if p_user_id is null or p_source is null or p_source !~ '^[a-z0-9_]+$' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_action not in (
    'opt_in',
    'opt_out',
    'unsubscribe_link',
    'list_unsubscribe_post',
    'admin_suppress',
    'bounce',
    'complaint'
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.email_categories c where c.key = p_category) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.members m where m.user_id = p_user_id) then
    return;
  end if;

  select p.opted_in into current_opt
  from public.email_preferences p
  where p.user_id = p_user_id and p.category = p_category;
  have_row := found;

  if have_row
     and current_opt is false
     and coalesce(p_opt_in, false) is false
     and p_action in ('unsubscribe_link', 'list_unsubscribe_post') then
    return;
  end if;

  insert into public.email_preferences (user_id, category, opted_in, updated_at)
  values (p_user_id, p_category, coalesce(p_opt_in, false), pg_catalog.now())
  on conflict (user_id, category) do update
  set opted_in = excluded.opted_in,
      updated_at = pg_catalog.now();

  if p_category = 'weekly_digest' then
    update public.members
    set digest_email_opt_in = coalesce(p_opt_in, false)
    where user_id = p_user_id;
  end if;

  insert into public.email_consent_log (
    user_id, email_hash, category, action, source, notice_version
  )
  select
    p_user_id,
    private.email_address_hash(m.email),
    p_category,
    p_action,
    p_source,
    'email-core-1'
  from public.members m
  where m.user_id = p_user_id
    and private.email_address_hash(m.email) is not null;
end;
$fn$;

revoke all on function private.email_save_preference(uuid, text, boolean, text, text)
  from public, anon, authenticated;

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
end;
$fn$;

revoke all on function private.email_apply_admit_defaults(uuid) from public, anon, authenticated;

comment on function private.email_apply_admit_defaults(uuid) is
  'At admit, turn Weekly email on and leave News and invitations off. Write one consent row for each, with source admit. If a weekly preference already exists, do nothing.';

create or replace function private.email_on_member_admit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.invited_by is not null and coalesce(new.is_demo, false) = false then
    perform private.email_apply_admit_defaults(new.user_id);
  end if;
  return new;
end;
$fn$;

revoke all on function private.email_on_member_admit() from public, anon, authenticated;

drop trigger if exists members_email_admit_ai on public.members;
create trigger members_email_admit_ai
  after insert on public.members
  for each row execute function private.email_on_member_admit();

create or replace function private.email_unsub_token(p_user_id uuid, p_category text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  version integer;
  key bytea;
  issued text;
  payload text;
  sig text;
begin
  if p_user_id is null or p_category is null or p_category !~ '^[a-z0-9_]+$' then
    return null;
  end if;
  if not exists (select 1 from public.email_categories c where c.key = p_category) then
    return null;
  end if;
  select s.key_version, s.hmac_key into version, key
  from private.email_secrets s
  where s.id;
  if key is null then
    return null;
  end if;
  issued := pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.now()))::bigint::text;
  payload := version::text || '|' || p_user_id::text || '|' || p_category || '|' || issued;
  sig := encode(extensions.hmac(convert_to(payload, 'UTF8'), key, 'sha256'), 'hex');
  return version::text || '.' || p_user_id::text || '.' || p_category || '.' || issued || '.' || sig;
end;
$fn$;

revoke all on function private.email_unsub_token(uuid, text) from public, anon, authenticated;

comment on function private.email_unsub_token(uuid, text) is
  'HMAC over version, member, category and issued time. The signing key is not returned. The stored digest token is not the check.';

create or replace function private.email_unsub_verify(p_token text)
returns table (user_id uuid, category text)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  parts text[];
  version integer;
  uid uuid;
  cat text;
  issued text;
  sig text;
  payload text;
  key bytea;
  expect text;
begin
  if p_token is null then
    return;
  end if;
  parts := pg_catalog.string_to_array(p_token, '.');
  if pg_catalog.cardinality(parts) is distinct from 5 then
    return;
  end if;
  if parts[1] !~ '^[0-9]+$'
     or parts[4] !~ '^[0-9]+$'
     or parts[5] !~ '^[0-9a-f]{64}$'
     or parts[3] !~ '^[a-z0-9_]+$' then
    return;
  end if;
  begin
    uid := parts[2]::uuid;
  exception
    when others then
      return;
  end;
  version := parts[1]::integer;
  cat := parts[3];
  issued := parts[4];
  sig := parts[5];
  select s.hmac_key into key
  from private.email_secrets s
  where s.id and s.key_version = version;
  if key is null then
    return;
  end if;
  payload := version::text || '|' || uid::text || '|' || cat || '|' || issued;
  expect := encode(extensions.hmac(convert_to(payload, 'UTF8'), key, 'sha256'), 'hex');
  if pg_catalog.char_length(expect) is distinct from pg_catalog.char_length(sig)
     or expect is distinct from sig then
    return;
  end if;
  if not exists (select 1 from public.email_categories c where c.key = cat) then
    return;
  end if;
  if not exists (select 1 from public.members m where m.user_id = uid) then
    return;
  end if;
  user_id := uid;
  category := cat;
  return next;
end;
$fn$;

revoke all on function private.email_unsub_verify(text) from public, anon, authenticated;

create or replace function public.email_unsubscribe(
  p_token text,
  p_source text default 'unsubscribe_link'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  uid uuid;
  cat text;
  source text;
begin
  source := case
    when p_source = 'list_unsubscribe_post' then 'list_unsubscribe_post'
    when p_source is null or p_source = 'unsubscribe_link' then 'unsubscribe_link'
    else null
  end;
  if source is null then
    return pg_catalog.jsonb_build_object('ok', true);
  end if;
  select v.user_id, v.category into uid, cat
  from private.email_unsub_verify(p_token) v;
  if uid is null then
    return pg_catalog.jsonb_build_object('ok', true);
  end if;
  perform private.email_save_preference(uid, cat, false, source, source);
  return pg_catalog.jsonb_build_object('ok', true);
end;
$fn$;

revoke all on function public.email_unsubscribe(text, text) from public, anon, authenticated;
grant execute on function public.email_unsubscribe(text, text) to anon, authenticated;

comment on function public.email_unsubscribe(text, text) is
  'One-click unsubscribe. Bad and good tokens return the same object. Idempotent. Does not send mail.';

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
  return pg_catalog.jsonb_build_object(
    'weekly_digest', coalesce(weekly_pref, weekly_col, false),
    'news_invitations', coalesce(news_pref, false)
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
  if not exists (select 1 from public.email_categories c where c.key = p_category) then
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
  'Signed-in member sets one category. Writes a consent row with source privacy_panel. Does not send mail.';

create or replace function public.set_digest_email_opt_in(p_opt_in boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  next_value boolean;
  act text;
begin
  if auth.uid() is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  next_value := coalesce(p_opt_in, false);
  if not exists (
    select 1 from public.members m
    where m.user_id = auth.uid()
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  act := case when next_value then 'opt_in' else 'opt_out' end;
  perform private.email_save_preference(
    auth.uid(),
    'weekly_digest',
    next_value,
    'privacy_panel',
    act
  );
  return pg_catalog.jsonb_build_object('digest_email_opt_in', next_value);
end;
$fn$;

revoke all on function public.set_digest_email_opt_in(boolean) from public, anon;
grant execute on function public.set_digest_email_opt_in(boolean) to authenticated;

comment on function public.set_digest_email_opt_in(boolean) is
  'Sets the signed-in member weekly preference, the weekly column, and a consent row. Does not send mail.';

create or replace function private.email_member_reason(p_user_id uuid, p_category text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  m public.members%rowtype;
  hashed text;
begin
  select * into m from public.members where user_id = p_user_id;
  if not found then
    return 'inactive';
  end if;
  if m.is_demo then
    return 'demo';
  end if;
  if m.anonymised_at is not null then
    return 'anonymised';
  end if;
  if m.left_at is not null or m.status not in ('invited', 'active') then
    return 'inactive';
  end if;
  if m.email is null or pg_catalog.btrim(m.email) = '' then
    return 'no_address';
  end if;
  if m.directory_hidden then
    return 'hidden';
  end if;
  hashed := private.email_address_hash(m.email);
  if exists (
    select 1 from public.email_suppressions s where s.email_hash = hashed
  ) then
    return 'suppressed';
  end if;
  if not exists (
    select 1
    from public.email_preferences p
    where p.user_id = m.user_id
      and p.category = p_category
      and p.opted_in
  ) then
    return 'not_opted_in';
  end if;
  return 'eligible';
end;
$fn$;

revoke all on function private.email_member_reason(uuid, text) from public, anon, authenticated;

create or replace function private.email_audience_counts(p_audience text[], p_category text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select pg_catalog.jsonb_build_object(
    'eligible', count(*) filter (where listed.reason = 'eligible'),
    'not_opted_in', count(*) filter (where listed.reason = 'not_opted_in'),
    'suppressed', count(*) filter (where listed.reason = 'suppressed'),
    'demo', count(*) filter (where listed.reason = 'demo'),
    'anonymised', count(*) filter (where listed.reason = 'anonymised'),
    'inactive', count(*) filter (where listed.reason = 'inactive'),
    'no_address', count(*) filter (where listed.reason = 'no_address'),
    'hidden', count(*) filter (where listed.reason = 'hidden')
  )
  from (
    select private.email_member_reason(m.user_id, p_category) as reason
    from public.members m
    where m.tiers && coalesce(p_audience, array[]::text[])
  ) listed;
$fn$;

revoke all on function private.email_audience_counts(text[], text) from public, anon, authenticated;

create or replace function private.email_assert_links(p_value text)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $fn$
begin
  if p_value is null or p_value = '' then
    return;
  end if;
  if p_value ~* '(javascript|data|vbscript|file|ftp|blob)\s*:' then
    raise exception 'link_not_allowed' using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.regexp_matches(p_value, '(?:href|src)\s*=\s*"([^"]*)"', 'gi') as found(parts)
    where pg_catalog.btrim(parts[1]) !~* '^https?://'
  ) then
    raise exception 'link_not_allowed' using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.regexp_matches(p_value, '(?:href|src)\s*=\s*''([^'']*)''', 'gi') as found(parts)
    where pg_catalog.btrim(parts[1]) !~* '^https?://'
  ) then
    raise exception 'link_not_allowed' using errcode = '22023';
  end if;
end;
$fn$;

revoke all on function private.email_assert_links(text) from public, anon, authenticated;

create or replace function private.email_sanitise_html(p_html text)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $fn$
declare
  cleaned text;
begin
  cleaned := pg_catalog.left(coalesce(p_html, ''), 20000);
  cleaned := pg_catalog.regexp_replace(
    cleaned,
    '<[[:space:]]*script[^>]*>.*</[[:space:]]*script[[:space:]]*>',
    '',
    'gi'
  );
  cleaned := pg_catalog.regexp_replace(
    cleaned,
    '<[[:space:]]*style[^>]*>.*</[[:space:]]*style[[:space:]]*>',
    '',
    'gi'
  );
  cleaned := pg_catalog.regexp_replace(cleaned, '\s+on[a-z]+\s*=\s*"[^"]*"', '', 'gi');
  cleaned := pg_catalog.regexp_replace(cleaned, '\s+on[a-z]+\s*=\s*''[^'']*''', '', 'gi');
  if cleaned ~* '<[[:space:]]*script' or cleaned ~* '<[[:space:]]*style' then
    raise exception 'link_not_allowed' using errcode = '22023';
  end if;
  perform private.email_assert_links(cleaned);
  return cleaned;
end;
$fn$;

revoke all on function private.email_sanitise_html(text) from public, anon, authenticated;

create or replace function private.email_recipients(p_campaign_id uuid)
returns table (user_id uuid, address text, unsubscribe_token text)
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_category text;
  v_audience text[];
begin
  select c.category, c.audience_tiers into v_category, v_audience
  from public.email_campaigns c
  where c.id = p_campaign_id;
  if v_category is null then
    return;
  end if;
  return query
  select
    m.user_id,
    m.email,
    private.email_unsub_token(m.user_id, v_category)
  from public.members m
  where m.tiers && coalesce(v_audience, array[]::text[])
    and private.email_member_reason(m.user_id, v_category) = 'eligible'
    and not exists (
      select 1
      from public.email_suppressions s
      where s.email_hash = private.email_address_hash(m.email)
    );
end;
$fn$;

revoke all on function private.email_recipients(uuid) from public, anon, authenticated;
grant execute on function private.email_recipients(uuid) to service_role;

comment on function private.email_recipients(uuid) is
  'Eligible recipients only. Suppression is checked here. No client grant. Does not send mail.';

create or replace function private.email_record_event(
  p_message_id text,
  p_type text,
  p_email_hash text
) returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_id uuid;
  v_user uuid;
  v_hash text;
  v_status text;
  v_next text;
  v_action text;
  v_reason text;
begin
  if p_message_id is null or pg_catalog.btrim(p_message_id) = '' then
    return;
  end if;
  if p_email_hash is null or p_email_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;
  select s.id, s.user_id, s.email_hash, s.status
    into v_id, v_user, v_hash, v_status
  from public.email_sends s
  where s.provider_message_id = p_message_id
  order by s.created_at
  limit 1;
  if v_id is null or v_hash is distinct from p_email_hash then
    return;
  end if;
  if p_type in ('soft_bounce', 'delivery_delayed') then
    update public.email_sends
    set updated_at = pg_catalog.now()
    where id = v_id;
    return;
  end if;
  v_next := case p_type
    when 'delivered' then 'delivered'
    when 'hard_bounce' then 'bounced'
    when 'complaint' then 'complained'
    when 'failed' then 'failed'
    else null
  end;
  if v_next is null or v_next is not distinct from v_status then
    return;
  end if;
  update public.email_sends
  set status = v_next,
      updated_at = pg_catalog.now()
  where id = v_id;
  if p_type = 'hard_bounce' then
    v_reason := 'hard_bounce';
    v_action := 'bounce';
  elsif p_type = 'complaint' then
    v_reason := 'complaint';
    v_action := 'complaint';
  else
    return;
  end if;
  insert into public.email_suppressions (email_hash, reason, source)
  values (p_email_hash, v_reason, 'provider')
  on conflict (email_hash) do nothing;
  insert into public.email_consent_log (
    user_id, email_hash, category, action, source, notice_version
  )
  select v_user, p_email_hash, c.category, v_action, 'provider', 'email-core-1'
  from public.email_sends s
  join public.email_campaigns c on c.id = s.campaign_id
  where s.id = v_id;
end;
$fn$;

revoke all on function private.email_record_event(text, text, text) from public, anon, authenticated;
grant execute on function private.email_record_event(text, text, text) to service_role;

comment on function private.email_record_event(text, text, text) is
  'Provider event for one send. A hard bounce or complaint suppresses that address hash and writes a consent row. Does not send mail.';

create or replace function public.staff_email_audience(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_category text;
  v_audience text[];
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select c.category, c.audience_tiers into v_category, v_audience
  from public.email_campaigns c
  where c.id = p_campaign_id;
  if v_category is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return private.email_audience_counts(v_audience, v_category);
end;
$$;

revoke all on function public.staff_email_audience(uuid) from public, anon;
grant execute on function public.staff_email_audience(uuid) to authenticated;

comment on function public.staff_email_audience(uuid) is
  'Admin counts by skip reason. No address is returned. Does not send mail.';

create or replace function public.staff_digest_mail_plan(p_issue_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_audience text[];
  v_ready text;
  v_count integer;
  v_send boolean;
  v_counts jsonb;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select i.status, i.audience, coalesce(i.payload->>'mail_ready', 'false')
    into v_status, v_audience, v_ready
  from public.digest_issues i
  where i.id = p_issue_id;

  v_counts := private.email_audience_counts(
    coalesce(v_audience, array[]::text[]),
    'weekly_digest'
  );
  v_count := coalesce((v_counts->>'eligible')::integer, 0);

  select s.send_enabled into v_send from public.digest_settings s where s.id;

  return pg_catalog.jsonb_build_object(
    'mail_ready', false,
    'sendable', false,
    'status', v_status,
    'audience', coalesce(v_audience, array[]::text[]),
    'recipient_count', coalesce(v_count, 0),
    'send_enabled', coalesce(v_send, false),
    'stored_mail_ready', coalesce(v_ready, 'false')
  );
end;
$$;

revoke all on function public.staff_digest_mail_plan(uuid) from public, anon;
grant execute on function public.staff_digest_mail_plan(uuid) to authenticated;

comment on function public.staff_digest_mail_plan(uuid) is
  'Eligible weekly count for an issue, using the same helper as the campaign audience. mail_ready and sendable stay false. Does not send mail.';

create or replace function public.staff_set_email_master(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_value boolean;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not private.is_owner() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  next_value := coalesce(p_enabled, false);
  update public.email_settings
  set master_enabled = next_value,
      updated_by = auth.uid(),
      updated_at = pg_catalog.now()
  where id;
  insert into public.email_master_log (enabled, actor_id)
  values (next_value, auth.uid());
  return pg_catalog.jsonb_build_object('ok', true, 'master_enabled', next_value);
end;
$$;

revoke all on function public.staff_set_email_master(boolean) from public, anon;
grant execute on function public.staff_set_email_master(boolean) to authenticated;

comment on function public.staff_set_email_master(boolean) is
  'Owner sets the master switch. The change is logged. Does not send mail.';

create or replace function public.staff_upsert_campaign(
  p_id uuid,
  p_kind text,
  p_category text,
  p_subject text,
  p_preheader text,
  p_body_text text,
  p_body_html text,
  p_audience text[],
  p_digest_issue_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status text;
  v_requires boolean;
  v_audience text[];
  v_subject text;
  v_preheader text;
  v_body text;
  v_html text;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_kind not in ('digest', 'campaign') then
    raise exception 'not_allowed' using errcode = '22023';
  end if;
  select c.requires_opt_in into v_requires
  from public.email_categories c
  where c.key = p_category;
  if not found then
    raise exception 'not_allowed' using errcode = '22023';
  end if;
  if p_kind = 'campaign' and v_requires is not true then
    raise exception 'not_allowed' using errcode = '22023';
  end if;
  if p_kind = 'digest' and p_category is distinct from 'weekly_digest' then
    raise exception 'not_allowed' using errcode = '22023';
  end if;
  if p_kind = 'digest' and (
    p_digest_issue_id is null
    or not exists (select 1 from public.digest_issues i where i.id = p_digest_issue_id)
  ) then
    raise exception 'not_allowed' using errcode = '22023';
  end if;
  if p_kind = 'campaign' and p_digest_issue_id is not null then
    raise exception 'not_allowed' using errcode = '22023';
  end if;

  v_audience := private.normalize_membership_tiers(coalesce(p_audience, array[]::text[]));
  if coalesce(pg_catalog.cardinality(v_audience), 0) > 0
     and not private.membership_tiers_valid(v_audience) then
    raise exception 'invalid_tier' using errcode = '22023';
  end if;

  v_subject := coalesce(private.digest_plain(p_subject, 180), '');
  v_preheader := coalesce(private.digest_plain(p_preheader, 180), '');
  v_body := coalesce(private.digest_plain(p_body_text, 8000), '');
  perform private.email_assert_links(v_subject);
  perform private.email_assert_links(v_preheader);
  perform private.email_assert_links(v_body);
  v_html := private.email_sanitise_html(p_body_html);

  if p_id is null then
    insert into public.email_campaigns (
      kind, digest_issue_id, category, subject, preheader, body_text,
      body_html_sanitised, audience_tiers, status, created_by
    ) values (
      p_kind, p_digest_issue_id, p_category, v_subject, v_preheader, v_body,
      v_html, v_audience, 'draft', auth.uid()
    )
    returning id into v_id;
    v_status := 'draft';
  else
    select c.status into v_status
    from public.email_campaigns c
    where c.id = p_id
    for update;
    if v_status is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if v_status is distinct from 'draft' then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
    update public.email_campaigns
    set kind = p_kind,
        digest_issue_id = p_digest_issue_id,
        category = p_category,
        subject = v_subject,
        preheader = v_preheader,
        body_text = v_body,
        body_html_sanitised = v_html,
        audience_tiers = v_audience
    where id = p_id;
    v_id := p_id;
  end if;

  return pg_catalog.jsonb_build_object('id', v_id, 'status', v_status);
end;
$$;

revoke all on function public.staff_upsert_campaign(uuid, text, text, text, text, text, text, text[], uuid)
  from public, anon;
grant execute on function public.staff_upsert_campaign(uuid, text, text, text, text, text, text, text[], uuid)
  to authenticated;

comment on function public.staff_upsert_campaign(uuid, text, text, text, text, text, text, text[], uuid) is
  'Admin saves a draft. A campaign category must require opt-in. Links must be http or https. Does not send mail.';

create or replace function public.staff_approve_campaign(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_kind text;
  v_issue uuid;
  v_audience text[];
  v_subject text;
  v_body text;
  v_html text;
  v_issue_status text;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select c.status, c.kind, c.digest_issue_id, c.audience_tiers, c.subject, c.body_text, c.body_html_sanitised
    into v_status, v_kind, v_issue, v_audience, v_subject, v_body, v_html
  from public.email_campaigns c
  where c.id = p_id
  for update;
  if v_status is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_status = 'approved' then
    return pg_catalog.jsonb_build_object('id', p_id, 'status', 'approved');
  end if;
  if v_status is distinct from 'draft' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if coalesce(pg_catalog.cardinality(v_audience), 0) < 1
     or not private.membership_tiers_valid(v_audience) then
    raise exception 'audience_required' using errcode = '22023';
  end if;
  if pg_catalog.btrim(coalesce(v_subject, '')) = ''
     or pg_catalog.btrim(coalesce(v_body, '')) = '' then
    raise exception 'copy_required' using errcode = '22023';
  end if;
  perform private.email_assert_links(v_subject);
  perform private.email_assert_links(v_body);
  perform private.email_assert_links(v_html);
  if v_kind = 'digest' then
    select i.status into v_issue_status
    from public.digest_issues i
    where i.id = v_issue;
    if v_issue_status is distinct from 'approved' then
      raise exception 'not_allowed' using errcode = '42501';
    end if;
  end if;
  update public.email_campaigns
  set status = 'approved',
      approved_by = auth.uid(),
      approved_at = pg_catalog.now()
  where id = p_id;
  return pg_catalog.jsonb_build_object('id', p_id, 'status', 'approved');
end;
$$;

revoke all on function public.staff_approve_campaign(uuid) from public, anon;
grant execute on function public.staff_approve_campaign(uuid) to authenticated;

comment on function public.staff_approve_campaign(uuid) is
  'Admin approves a draft. A digest campaign must point at an approved issue. Does not send mail.';

create or replace function public.staff_cancel_campaign(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select c.status into v_status
  from public.email_campaigns c
  where c.id = p_id
  for update;
  if v_status is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_status = 'cancelled' then
    return pg_catalog.jsonb_build_object('id', p_id, 'status', 'cancelled');
  end if;
  if v_status not in ('draft', 'approved', 'test_sent') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.email_campaigns
  set status = 'cancelled'
  where id = p_id;
  return pg_catalog.jsonb_build_object('id', p_id, 'status', 'cancelled');
end;
$$;

revoke all on function public.staff_cancel_campaign(uuid) from public, anon;
grant execute on function public.staff_cancel_campaign(uuid) to authenticated;

comment on function public.staff_cancel_campaign(uuid) is
  'Admin cancels a draft, an approved campaign, or a test send. Does not send mail.';

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

comment on function public.email_consent_retention(boolean) is
  'Named retention item email_consent_log. Kept while the member has not left, then 24 months after left_at. Not the 13 month cookie consent log. Not scheduled. Does not send mail.';

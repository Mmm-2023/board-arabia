-- Send events for one recipient message.
-- Stores opened, clicked, delivered, bounced and complained rows.
-- Does not send mail. Does not schedule anything. Does not call a network.
-- The master switch is not changed and stays off.
-- Account mail keeps its own audit table. This file does not touch that table.
-- Apply after 20261220120000_email_core.sql.
-- Factory does not apply migrations.

alter table public.email_sends drop constraint if exists email_sends_status_check;
alter table public.email_sends add constraint email_sends_status_check check (
  status in (
    'queued',
    'skipped',
    'sent',
    'delivered',
    'opened',
    'clicked',
    'bounced',
    'complained',
    'failed'
  )
);

comment on column public.email_sends.status is
  'queued, skipped, sent, delivered, opened, clicked, bounced, complained, or failed. Members cannot read this table.';

-- Covering indexes for foreign keys added by 20261220120000_email_core.sql.
-- The live-send unique index already leads with campaign_id, so that key is covered.
create index if not exists email_preferences_category_idx
  on public.email_preferences (category);

create index if not exists email_consent_log_category_idx
  on public.email_consent_log (category);

create index if not exists email_campaigns_category_idx
  on public.email_campaigns (category);

create index if not exists email_sends_user_idx
  on public.email_sends (user_id);

create table if not exists public.newsletter_events (
  id uuid primary key default gen_random_uuid(),
  send_id uuid not null references public.email_sends (id) on delete cascade,
  message_id text not null,
  event text not null,
  url text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint newsletter_events_message_len check (char_length(message_id) between 1 and 200),
  constraint newsletter_events_event_check check (
    event in (
      'opened',
      'clicked',
      'delivered',
      'bounced',
      'complained',
      'soft_bounce',
      'delivery_delayed'
    )
  ),
  constraint newsletter_events_url_check check (
    url is null
    or (
      char_length(url) <= 2000
      and url ~* '^https?://'
    )
  )
);

comment on table public.newsletter_events is
  'Provider events for one newsletter send. A click may store a URL. No member address. Service role writes through the definer only.';

comment on column public.newsletter_events.url is
  'Clicked http or https URL. Null for every other event.';

create unique index if not exists newsletter_events_once
  on public.newsletter_events (message_id, event, occurred_at, (coalesce(url, ''::text)));

create index if not exists newsletter_events_send_idx
  on public.newsletter_events (send_id, occurred_at);

alter table public.newsletter_events enable row level security;
alter table public.newsletter_events force row level security;
revoke all on table public.newsletter_events from public;
revoke all on table public.newsletter_events from anon, authenticated, service_role;

create table if not exists public.email_unsub_limits (
  rate_key text primary key,
  window_start timestamptz not null default pg_catalog.now(),
  hit_count integer not null default 0,
  constraint email_unsub_limits_hits check (hit_count >= 0)
);

comment on table public.email_unsub_limits is
  'Unsubscribe rate windows. The key is a hash, not a token and not an address.';

alter table public.email_unsub_limits enable row level security;
alter table public.email_unsub_limits force row level security;
revoke all on table public.email_unsub_limits from public;
revoke all on table public.email_unsub_limits from anon, authenticated;
grant select, insert, update, delete on table public.email_unsub_limits to service_role;

drop function if exists private.email_record_event(text, text, text);

create or replace function private.email_record_event(
  p_message_id text,
  p_type text,
  p_email_hash text,
  p_url text default null,
  p_occurred_at timestamptz default null
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
  v_event text;
  v_url text;
  v_at timestamptz;
  v_action text;
  v_reason text;
  v_rank integer;
  v_next_rank integer;
begin
  if p_message_id is null
     or pg_catalog.btrim(p_message_id) = ''
     or char_length(p_message_id) > 200 then
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

  v_event := case p_type
    when 'delivered' then 'delivered'
    when 'opened' then 'opened'
    when 'clicked' then 'clicked'
    when 'hard_bounce' then 'bounced'
    when 'bounced' then 'bounced'
    when 'complaint' then 'complained'
    when 'complained' then 'complained'
    when 'soft_bounce' then 'soft_bounce'
    when 'delivery_delayed' then 'delivery_delayed'
    else null
  end;
  v_next := case p_type
    when 'delivered' then 'delivered'
    when 'opened' then 'opened'
    when 'clicked' then 'clicked'
    when 'hard_bounce' then 'bounced'
    when 'bounced' then 'bounced'
    when 'complaint' then 'complained'
    when 'complained' then 'complained'
    when 'failed' then 'failed'
    else null
  end;

  v_url := null;
  if v_event = 'clicked'
     and p_url is not null
     and char_length(p_url) <= 2000
     and p_url ~* '^https?://'
     and p_url !~ '[[:cntrl:][:space:]]' then
    v_url := p_url;
  end if;
  v_at := coalesce(p_occurred_at, pg_catalog.now());

  if v_event is not null then
    insert into public.newsletter_events (send_id, message_id, event, url, occurred_at)
    select v_id, p_message_id, v_event, v_url, v_at
    where not exists (
      select 1
      from public.newsletter_events e
      where e.message_id = p_message_id
        and e.event = v_event
        and e.occurred_at = v_at
        and e.url is not distinct from v_url
    );
  end if;

  if p_type in ('soft_bounce', 'delivery_delayed') then
    update public.email_sends
    set updated_at = pg_catalog.now()
    where id = v_id;
    return;
  end if;
  if v_next is null then
    return;
  end if;

  v_rank := case v_status
    when 'complained' then 70
    when 'bounced' then 60
    when 'clicked' then 50
    when 'opened' then 40
    when 'delivered' then 30
    when 'failed' then 20
    else 10
  end;
  v_next_rank := case v_next
    when 'complained' then 70
    when 'bounced' then 60
    when 'clicked' then 50
    when 'opened' then 40
    when 'delivered' then 30
    when 'failed' then 20
    else 10
  end;
  if v_next_rank <= v_rank then
    return;
  end if;

  update public.email_sends
  set status = v_next,
      updated_at = pg_catalog.now()
  where id = v_id;

  if v_next = 'bounced' then
    v_reason := 'hard_bounce';
    v_action := 'bounce';
  elsif v_next = 'complained' then
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

revoke all on function private.email_record_event(text, text, text, text, timestamptz) from public;
revoke all on function private.email_record_event(text, text, text, text, timestamptz) from anon, authenticated;
grant execute on function private.email_record_event(text, text, text, text, timestamptz) to service_role;

comment on function private.email_record_event(text, text, text, text, timestamptz) is
  'Stores one provider event and moves the send status forward. A hard bounce or complaint suppresses that address hash. A click may store a URL. Does not send mail.';

create or replace function public.email_record_event(
  p_message_id text,
  p_type text,
  p_email_hash text,
  p_url text default null,
  p_occurred_at timestamptz default null
) returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform private.email_record_event(p_message_id, p_type, p_email_hash, p_url, p_occurred_at);
end;
$fn$;

revoke all on function public.email_record_event(text, text, text, text, timestamptz) from public;
revoke all on function public.email_record_event(text, text, text, text, timestamptz) from anon, authenticated;
grant execute on function public.email_record_event(text, text, text, text, timestamptz) to service_role;

comment on function public.email_record_event(text, text, text, text, timestamptz) is
  'Service role wrapper for private.email_record_event. Does not send mail.';

create or replace function private.email_is_suppressed(p_email_hash text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.email_suppressions s
    where s.email_hash = p_email_hash
  );
$fn$;

revoke all on function private.email_is_suppressed(text) from public;
revoke all on function private.email_is_suppressed(text) from anon, authenticated;
grant execute on function private.email_is_suppressed(text) to service_role;

create or replace function public.email_is_suppressed(p_email_hash text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select private.email_is_suppressed(p_email_hash);
$fn$;

revoke all on function public.email_is_suppressed(text) from public;
revoke all on function public.email_is_suppressed(text) from anon, authenticated;
grant execute on function public.email_is_suppressed(text) to service_role;

comment on function public.email_is_suppressed(text) is
  'True when the address hash is suppressed. Service role only. Does not send mail.';

create or replace function public.email_recipients(p_campaign_id uuid)
returns table (user_id uuid, address text, unsubscribe_token text)
language sql
security definer
set search_path = ''
as $fn$
  select r.user_id, r.address, r.unsubscribe_token
  from private.email_recipients(p_campaign_id) r;
$fn$;

revoke all on function public.email_recipients(uuid) from public;
revoke all on function public.email_recipients(uuid) from anon, authenticated;
grant execute on function public.email_recipients(uuid) to service_role;

comment on function public.email_recipients(uuid) is
  'Service role wrapper for private.email_recipients. Does not send mail.';

create or replace function private.email_send_gate(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_campaign public.email_campaigns%rowtype;
  v_master boolean;
  v_batch integer;
  v_pause integer;
  v_issue_status text;
  v_mail_ready text;
  v_send boolean;
begin
  select * into v_campaign
  from public.email_campaigns c
  where c.id = p_campaign_id;
  if v_campaign.id is null then
    return pg_catalog.jsonb_build_object('found', false);
  end if;
  select s.master_enabled, s.batch_size, s.batch_pause_ms
    into v_master, v_batch, v_pause
  from public.email_settings s
  where s.id;
  v_issue_status := null;
  v_mail_ready := 'false';
  v_send := false;
  if v_campaign.kind = 'digest' then
    select i.status, coalesce(i.payload ->> 'mail_ready', 'false')
      into v_issue_status, v_mail_ready
    from public.digest_issues i
    where i.id = v_campaign.digest_issue_id;
    select d.send_enabled into v_send
    from public.digest_settings d
    where d.id;
  end if;
  return pg_catalog.jsonb_build_object(
    'found', true,
    'status', v_campaign.status,
    'kind', v_campaign.kind,
    'category', v_campaign.category,
    'subject', v_campaign.subject,
    'preheader', v_campaign.preheader,
    'body_text', v_campaign.body_text,
    'body_html', v_campaign.body_html_sanitised,
    'master_enabled', coalesce(v_master, false),
    'batch_size', coalesce(v_batch, 50),
    'batch_pause_ms', coalesce(v_pause, 1500),
    'issue_status', v_issue_status,
    'issue_mail_ready', coalesce(v_mail_ready, 'false') = 'true',
    'issue_send_enabled', coalesce(v_send, false)
  );
end;
$fn$;

revoke all on function private.email_send_gate(uuid) from public;
revoke all on function private.email_send_gate(uuid) from anon, authenticated;
grant execute on function private.email_send_gate(uuid) to service_role;

create or replace function public.email_send_gate(p_campaign_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $fn$
  select private.email_send_gate(p_campaign_id);
$fn$;

revoke all on function public.email_send_gate(uuid) from public;
revoke all on function public.email_send_gate(uuid) from anon, authenticated;
grant execute on function public.email_send_gate(uuid) to service_role;

comment on function public.email_send_gate(uuid) is
  'Campaign and master switch for the sender. No address is returned. Service role only. Does not send mail.';

create or replace function private.email_log_send(
  p_campaign_id uuid,
  p_user_id uuid,
  p_email_hash text,
  p_is_test boolean,
  p_status text,
  p_skip_reason text,
  p_provider_message_id text,
  p_send_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user uuid;
  v_reason text;
  v_provider text;
  v_id uuid;
  v_current text;
  v_test boolean;
begin
  if p_campaign_id is null or not exists (
    select 1 from public.email_campaigns c where c.id = p_campaign_id
  ) then
    return pg_catalog.jsonb_build_object('ok', false);
  end if;
  if p_email_hash is null or p_email_hash !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('ok', false);
  end if;
  if p_status not in ('queued', 'skipped', 'sent', 'failed') then
    return pg_catalog.jsonb_build_object('ok', false);
  end if;

  perform 1 from public.email_campaigns c where c.id = p_campaign_id for update;

  v_test := coalesce(p_is_test, false);
  v_reason := null;
  if p_skip_reason is not null and pg_catalog.btrim(p_skip_reason) <> '' then
    if p_skip_reason !~ '^[a-z0-9_]{1,80}$' then
      return pg_catalog.jsonb_build_object('ok', false);
    end if;
    v_reason := p_skip_reason;
  end if;
  v_provider := null;
  if p_provider_message_id is not null and pg_catalog.btrim(p_provider_message_id) <> '' then
    if char_length(p_provider_message_id) > 200 or p_provider_message_id ~ '[[:cntrl:]]' then
      return pg_catalog.jsonb_build_object('ok', false);
    end if;
    v_provider := pg_catalog.btrim(p_provider_message_id);
  end if;
  if p_user_id is not null and exists (
    select 1 from public.members m where m.user_id = p_user_id
  ) then
    v_user := p_user_id;
  else
    v_user := null;
  end if;

  if p_send_id is not null then
    select s.status into v_current
    from public.email_sends s
    where s.id = p_send_id
      and s.campaign_id = p_campaign_id
    for update;
    if v_current is null then
      return pg_catalog.jsonb_build_object('ok', false);
    end if;
    if v_current in ('delivered', 'opened', 'clicked', 'bounced', 'complained')
       or (v_current = 'sent' and p_status is distinct from 'sent')
       or (v_current = 'skipped' and p_status is distinct from 'skipped') then
      return pg_catalog.jsonb_build_object('ok', true, 'id', p_send_id, 'status', v_current, 'send', false);
    end if;
    update public.email_sends
    set status = p_status,
        skip_reason = v_reason,
        provider_message_id = coalesce(v_provider, provider_message_id),
        updated_at = pg_catalog.now()
    where id = p_send_id;
    return pg_catalog.jsonb_build_object('ok', true, 'id', p_send_id, 'status', p_status, 'send', false);
  end if;

  if v_test is false and v_user is not null then
    select s.id, s.status into v_id, v_current
    from public.email_sends s
    where s.campaign_id = p_campaign_id
      and s.user_id = v_user
      and s.is_test = false
    for update;
    if v_id is not null then
      if v_current in ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'skipped') then
        return pg_catalog.jsonb_build_object('ok', true, 'id', v_id, 'status', v_current, 'send', false);
      end if;
      update public.email_sends
      set status = p_status,
          skip_reason = v_reason,
          provider_message_id = coalesce(v_provider, provider_message_id),
          attempt = attempt + 1,
          updated_at = pg_catalog.now()
      where id = v_id;
      return pg_catalog.jsonb_build_object(
        'ok', true,
        'id', v_id,
        'status', p_status,
        'send', p_status = 'queued'
      );
    end if;
  end if;

  insert into public.email_sends (
    campaign_id, user_id, email_hash, status, skip_reason,
    provider_message_id, is_test, attempt
  ) values (
    p_campaign_id, v_user, p_email_hash, p_status, v_reason,
    v_provider, v_test, 1
  )
  returning id into v_id;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'id', v_id,
    'status', p_status,
    'send', p_status = 'queued'
  );
end;
$fn$;

revoke all on function private.email_log_send(uuid, uuid, text, boolean, text, text, text, uuid) from public;
revoke all on function private.email_log_send(uuid, uuid, text, boolean, text, text, text, uuid) from anon, authenticated;
grant execute on function private.email_log_send(uuid, uuid, text, boolean, text, text, text, uuid) to service_role;

create or replace function public.email_log_send(
  p_campaign_id uuid,
  p_user_id uuid,
  p_email_hash text,
  p_is_test boolean,
  p_status text,
  p_skip_reason text,
  p_provider_message_id text,
  p_send_id uuid
) returns jsonb
language sql
security definer
set search_path = ''
as $fn$
  select private.email_log_send(
    p_campaign_id,
    p_user_id,
    p_email_hash,
    p_is_test,
    p_status,
    p_skip_reason,
    p_provider_message_id,
    p_send_id
  );
$fn$;

revoke all on function public.email_log_send(uuid, uuid, text, boolean, text, text, text, uuid) from public;
revoke all on function public.email_log_send(uuid, uuid, text, boolean, text, text, text, uuid) from anon, authenticated;
grant execute on function public.email_log_send(uuid, uuid, text, boolean, text, text, text, uuid) to service_role;

comment on function public.email_log_send(uuid, uuid, text, boolean, text, text, text, uuid) is
  'Writes one send log row. A live row that is already sent is not sent again. Service role only. Does not send mail.';

create or replace function private.email_set_campaign_progress(
  p_campaign_id uuid,
  p_status text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_status text;
begin
  if p_status not in ('sending', 'sent') then
    return pg_catalog.jsonb_build_object('ok', false);
  end if;
  select c.status into v_status
  from public.email_campaigns c
  where c.id = p_campaign_id
  for update;
  if v_status is null then
    return pg_catalog.jsonb_build_object('ok', false);
  end if;
  if p_status = 'sending' and v_status not in ('approved', 'sending') then
    return pg_catalog.jsonb_build_object('ok', false, 'status', v_status);
  end if;
  if p_status = 'sent' and v_status not in ('sending', 'sent') then
    return pg_catalog.jsonb_build_object('ok', false, 'status', v_status);
  end if;
  update public.email_campaigns
  set status = p_status
  where id = p_campaign_id;
  return pg_catalog.jsonb_build_object('ok', true, 'status', p_status);
end;
$fn$;

revoke all on function private.email_set_campaign_progress(uuid, text) from public;
revoke all on function private.email_set_campaign_progress(uuid, text) from anon, authenticated;
grant execute on function private.email_set_campaign_progress(uuid, text) to service_role;

create or replace function public.email_set_campaign_progress(
  p_campaign_id uuid,
  p_status text
) returns jsonb
language sql
security definer
set search_path = ''
as $fn$
  select private.email_set_campaign_progress(p_campaign_id, p_status);
$fn$;

revoke all on function public.email_set_campaign_progress(uuid, text) from public;
revoke all on function public.email_set_campaign_progress(uuid, text) from anon, authenticated;
grant execute on function public.email_set_campaign_progress(uuid, text) to service_role;

comment on function public.email_set_campaign_progress(uuid, text) is
  'Moves a campaign from approved to sending, or from sending to sent. Service role only. Does not send mail.';

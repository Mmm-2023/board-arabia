-- Deliverability: pause a newsletter when complaints or bounces cross the line.
-- Does not send mail. Does not schedule anything. Does not call a network.
-- The master switch default is unchanged and stays off.
-- Does not add a second-factor check.
-- Apply after 20261230120000_staff_aal1_access.sql.
-- Factory does not apply migrations.

alter table public.email_campaigns drop constraint if exists email_campaigns_status_check;
alter table public.email_campaigns add constraint email_campaigns_status_check check (
  status in ('draft', 'approved', 'test_sent', 'sending', 'sent', 'cancelled', 'paused')
);

comment on column public.email_campaigns.status is
  'draft, approved, test_sent, sending, sent, cancelled, or paused. A pause stops further batches.';

alter table public.email_settings
  add column if not exists pause_reason text,
  add column if not exists paused_at timestamptz;

alter table public.email_settings drop constraint if exists email_settings_pause_reason_check;
alter table public.email_settings add constraint email_settings_pause_reason_check check (
  pause_reason is null or pause_reason in ('complaint_rate', 'bounce_rate')
);

comment on column public.email_settings.pause_reason is
  'complaint_rate or bounce_rate while sending is paused. Null when it is not. The master switch is not turned on here.';

create table if not exists public.email_pause_log (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns (id) on delete cascade,
  reason text not null,
  delivered integer not null,
  complaints integer not null,
  bounces integer not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint email_pause_log_reason_check check (reason in ('complaint_rate', 'bounce_rate')),
  constraint email_pause_log_counts_check check (
    delivered >= 0 and complaints >= 0 and bounces >= 0
  )
);

comment on table public.email_pause_log is
  'Why a newsletter was paused. Counts only. No address is stored.';

create index if not exists email_pause_log_campaign_idx
  on public.email_pause_log (campaign_id);

alter table public.email_pause_log enable row level security;
alter table public.email_pause_log force row level security;
revoke all on table public.email_pause_log from public;
revoke all on table public.email_pause_log from anon, authenticated, service_role;

create or replace function private.email_pause_reason(
  p_delivered bigint,
  p_complaints bigint,
  p_bounces bigint
) returns text
language sql
immutable
security definer
set search_path = ''
as $fn$
  select case
    when coalesce(p_delivered, 0) < 100 then ''
    when coalesce(p_complaints, 0) * 1000 >= p_delivered then 'complaint_rate'
    when coalesce(p_bounces, 0) * 25 >= p_delivered then 'bounce_rate'
    else ''
  end;
$fn$;

revoke all on function private.email_pause_reason(bigint, bigint, bigint) from public;
revoke all on function private.email_pause_reason(bigint, bigint, bigint) from anon, authenticated, service_role;

comment on function private.email_pause_reason(bigint, bigint, bigint) is
  'complaint_rate at or above 0.1 percent, else bounce_rate at or above 4 percent, and only once delivered is at least 100. Does not send mail.';

create or replace function private.email_campaign_rates(p_campaign_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select pg_catalog.jsonb_build_object(
    'delivered', count(distinct e.send_id) filter (where e.event = 'delivered'),
    'complaints', count(distinct e.send_id) filter (where e.event = 'complained'),
    'bounces', count(distinct e.send_id) filter (where e.event = 'bounced')
  )
  from public.newsletter_events e
  join public.email_sends s on s.id = e.send_id
  where s.campaign_id = p_campaign_id
    and s.is_test = false;
$fn$;

revoke all on function private.email_campaign_rates(uuid) from public;
revoke all on function private.email_campaign_rates(uuid) from anon, authenticated, service_role;

create or replace function public.email_campaign_rates(p_campaign_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select private.email_campaign_rates(p_campaign_id);
$fn$;

revoke all on function public.email_campaign_rates(uuid) from public;
revoke all on function public.email_campaign_rates(uuid) from anon, authenticated;
grant execute on function public.email_campaign_rates(uuid) to service_role;

comment on function public.email_campaign_rates(uuid) is
  'Delivered, complaint, and bounce counts for one newsletter. Service role only. Does not send mail.';

create or replace function private.email_apply_pause(p_campaign_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_rates jsonb;
  v_delivered integer;
  v_complaints integer;
  v_bounces integer;
begin
  if p_campaign_id is null or p_reason not in ('complaint_rate', 'bounce_rate') then
    return;
  end if;
  if not exists (select 1 from public.email_campaigns c where c.id = p_campaign_id) then
    return;
  end if;

  update public.email_campaigns
  set status = 'paused'
  where id = p_campaign_id
    and status in ('sending', 'test_sent', 'paused');

  update public.email_settings
  set master_enabled = false,
      pause_reason = coalesce(pause_reason, p_reason),
      paused_at = coalesce(paused_at, pg_catalog.now())
  where id;

  if exists (
    select 1
    from public.email_pause_log l
    where l.campaign_id = p_campaign_id
      and l.reason = p_reason
  ) then
    return;
  end if;

  v_rates := private.email_campaign_rates(p_campaign_id);
  v_delivered := coalesce((v_rates ->> 'delivered')::integer, 0);
  v_complaints := coalesce((v_rates ->> 'complaints')::integer, 0);
  v_bounces := coalesce((v_rates ->> 'bounces')::integer, 0);
  insert into public.email_pause_log (campaign_id, reason, delivered, complaints, bounces)
  values (p_campaign_id, p_reason, v_delivered, v_complaints, v_bounces);
end;
$fn$;

revoke all on function private.email_apply_pause(uuid, text) from public;
revoke all on function private.email_apply_pause(uuid, text) from anon, authenticated, service_role;

create or replace function public.email_apply_pause(p_campaign_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform private.email_apply_pause(p_campaign_id, p_reason);
end;
$fn$;

revoke all on function public.email_apply_pause(uuid, text) from public;
revoke all on function public.email_apply_pause(uuid, text) from anon, authenticated;
grant execute on function public.email_apply_pause(uuid, text) to service_role;

comment on function public.email_apply_pause(uuid, text) is
  'Pauses one newsletter and turns the master switch off. Service role only. Does not send mail.';

create or replace function private.email_pause_from_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_campaign uuid;
  v_delivered bigint;
  v_complaints bigint;
  v_bounces bigint;
  v_reason text;
begin
  if new.event is distinct from 'bounced' and new.event is distinct from 'complained' then
    return new;
  end if;
  select s.campaign_id into v_campaign
  from public.email_sends s
  where s.id = new.send_id
    and s.is_test = false;
  if v_campaign is null then
    return new;
  end if;
  select
    count(distinct e.send_id) filter (where e.event = 'delivered'),
    count(distinct e.send_id) filter (where e.event = 'complained'),
    count(distinct e.send_id) filter (where e.event = 'bounced')
  into v_delivered, v_complaints, v_bounces
  from public.newsletter_events e
  join public.email_sends s on s.id = e.send_id
  where s.campaign_id = v_campaign
    and s.is_test = false;
  v_reason := private.email_pause_reason(v_delivered, v_complaints, v_bounces);
  if v_reason <> '' then
    perform private.email_apply_pause(v_campaign, v_reason);
  end if;
  return new;
end;
$fn$;

revoke all on function private.email_pause_from_event() from public, anon, authenticated;

drop trigger if exists email_pause_on_newsletter_event on public.newsletter_events;
create trigger email_pause_on_newsletter_event
  after insert on public.newsletter_events
  for each row execute function private.email_pause_from_event();

create or replace function public.staff_resume_email_pause()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_paused boolean;
begin
  if not private.is_owner() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select s.pause_reason is not null into v_paused
  from public.email_settings s
  where s.id;
  if coalesce(v_paused, false) is not true
     and not exists (select 1 from public.email_campaigns c where c.status = 'paused') then
    return pg_catalog.jsonb_build_object('ok', true, 'resumed', false, 'master_enabled', false);
  end if;
  update public.email_campaigns
  set status = 'sending'
  where status = 'paused';
  update public.email_settings
  set pause_reason = null,
      paused_at = null,
      master_enabled = false,
      updated_by = auth.uid(),
      updated_at = pg_catalog.now()
  where id;
  insert into public.email_master_log (enabled, actor_id)
  values (false, auth.uid());
  return pg_catalog.jsonb_build_object('ok', true, 'resumed', true, 'master_enabled', false);
end;
$fn$;

revoke all on function public.staff_resume_email_pause() from public, anon;
grant execute on function public.staff_resume_email_pause() to authenticated;

comment on function public.staff_resume_email_pause() is
  'The owner clears a pause. The master switch stays off. Does not send mail.';

create or replace function public.staff_email_screen()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_master boolean;
  v_owner boolean;
  v_pause text;
  v_rows jsonb;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select s.master_enabled, s.pause_reason
    into v_master, v_pause
  from public.email_settings s
  where s.id;
  v_owner := private.is_owner();
  select coalesce(pg_catalog.jsonb_agg(item.payload order by item.created_at desc), '[]'::jsonb)
    into v_rows
  from (
    select c.created_at,
      pg_catalog.jsonb_build_object(
        'id', c.id,
        'kind', c.kind,
        'category', c.category,
        'subject', c.subject,
        'preheader', c.preheader,
        'body_text', c.body_text,
        'status', c.status,
        'audience_tiers', pg_catalog.to_jsonb(c.audience_tiers),
        'digest_issue_id', c.digest_issue_id,
        'created_at', c.created_at,
        'approved', c.approved_at is not null,
        'audience', private.email_audience_counts(c.audience_tiers, c.category),
        'release', public.staff_email_release_gate(c.id),
        'log', pg_catalog.jsonb_build_object(
          'queued', (
            select count(*) from public.email_sends s
            where s.campaign_id = c.id and s.status = 'queued' and s.is_test = false
          ),
          'skipped', (
            select count(*) from public.email_sends s
            where s.campaign_id = c.id and s.status = 'skipped' and s.is_test = false
          ),
          'sent', (
            select count(*) from public.email_sends s
            where s.campaign_id = c.id and s.status = 'sent' and s.is_test = false
          ),
          'delivered', (
            select count(*) from public.email_sends s
            where s.campaign_id = c.id and s.status = 'delivered' and s.is_test = false
          ),
          'bounced', (
            select count(*) from public.email_sends s
            where s.campaign_id = c.id and s.status = 'bounced' and s.is_test = false
          ),
          'complained', (
            select count(*) from public.email_sends s
            where s.campaign_id = c.id and s.status = 'complained' and s.is_test = false
          ),
          'failed', (
            select count(*) from public.email_sends s
            where s.campaign_id = c.id and s.status = 'failed' and s.is_test = false
          ),
          'test', (
            select count(*) from public.email_sends s
            where s.campaign_id = c.id and s.is_test
          ),
          'events', private.email_newsletter_event_rows(c.id)
        )
      ) as payload
    from public.email_campaigns c
    order by c.created_at desc
    limit 40
  ) item;
  return pg_catalog.jsonb_build_object(
    'master_enabled', coalesce(v_master, false),
    'is_owner', v_owner,
    'pause_reason', coalesce(v_pause, ''),
    'campaigns', coalesce(v_rows, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.staff_email_screen() from public, anon;
grant execute on function public.staff_email_screen() to authenticated;

comment on function public.staff_email_screen() is
  'Admin letter list, audience counts, send log counts, and any pause reason. No address is returned. Does not send mail.';

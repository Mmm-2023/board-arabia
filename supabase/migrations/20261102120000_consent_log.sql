-- Phase 1 consent log and legacy application attribution.
-- consent_log is insert-only through the consent-log edge function (service role).
-- No IP address column. No user agent column.
-- Direct anon and authenticated insert/select are revoked.
-- Rows older than 13 months are deleted by purge_expired_consent_log.
-- Applications gain first-touch and last-touch columns. Client insert cannot set them.

alter table public.applications
  add column if not exists ft_source text,
  add column if not exists ft_medium text,
  add column if not exists ft_campaign text,
  add column if not exists ft_content text,
  add column if not exists ft_term text,
  add column if not exists ft_referrer_host text,
  add column if not exists ft_landing_path text,
  add column if not exists ft_at timestamptz,
  add column if not exists lt_source text,
  add column if not exists lt_medium text,
  add column if not exists lt_campaign text,
  add column if not exists analytics_id uuid,
  add column if not exists attribution_version smallint;

alter table public.applications drop constraint if exists applications_attribution_version_check;
alter table public.applications
  add constraint applications_attribution_version_check
  check (attribution_version is null or attribution_version = 1);

alter table public.applications drop constraint if exists applications_ft_source_token;
alter table public.applications
  add constraint applications_ft_source_token
  check (ft_source is null or (char_length(ft_source) <= 100 and ft_source = lower(ft_source) and ft_source !~ '@' and ft_source !~ '[0-9]{8,}'));

alter table public.applications drop constraint if exists applications_ft_medium_token;
alter table public.applications
  add constraint applications_ft_medium_token
  check (ft_medium is null or (char_length(ft_medium) <= 100 and ft_medium = lower(ft_medium) and ft_medium !~ '@' and ft_medium !~ '[0-9]{8,}'));

alter table public.applications drop constraint if exists applications_ft_campaign_token;
alter table public.applications
  add constraint applications_ft_campaign_token
  check (ft_campaign is null or (char_length(ft_campaign) <= 100 and ft_campaign = lower(ft_campaign) and ft_campaign !~ '@' and ft_campaign !~ '[0-9]{8,}'));

alter table public.applications drop constraint if exists applications_ft_content_token;
alter table public.applications
  add constraint applications_ft_content_token
  check (ft_content is null or (char_length(ft_content) <= 100 and ft_content = lower(ft_content) and ft_content !~ '@' and ft_content !~ '[0-9]{8,}'));

alter table public.applications drop constraint if exists applications_ft_term_token;
alter table public.applications
  add constraint applications_ft_term_token
  check (ft_term is null or (char_length(ft_term) <= 100 and ft_term = lower(ft_term) and ft_term !~ '@' and ft_term !~ '[0-9]{8,}'));

alter table public.applications drop constraint if exists applications_ft_referrer_host_token;
alter table public.applications
  add constraint applications_ft_referrer_host_token
  check (ft_referrer_host is null or (char_length(ft_referrer_host) <= 100 and ft_referrer_host = lower(ft_referrer_host) and ft_referrer_host !~ '@'));

alter table public.applications drop constraint if exists applications_ft_landing_path_token;
alter table public.applications
  add constraint applications_ft_landing_path_token
  check (ft_landing_path is null or (char_length(ft_landing_path) <= 100 and ft_landing_path = lower(ft_landing_path) and ft_landing_path !~ '@'));

alter table public.applications drop constraint if exists applications_lt_source_token;
alter table public.applications
  add constraint applications_lt_source_token
  check (lt_source is null or (char_length(lt_source) <= 100 and lt_source = lower(lt_source) and lt_source !~ '@' and lt_source !~ '[0-9]{8,}'));

alter table public.applications drop constraint if exists applications_lt_medium_token;
alter table public.applications
  add constraint applications_lt_medium_token
  check (lt_medium is null or (char_length(lt_medium) <= 100 and lt_medium = lower(lt_medium) and lt_medium !~ '@' and lt_medium !~ '[0-9]{8,}'));

alter table public.applications drop constraint if exists applications_lt_campaign_token;
alter table public.applications
  add constraint applications_lt_campaign_token
  check (lt_campaign is null or (char_length(lt_campaign) <= 100 and lt_campaign = lower(lt_campaign) and lt_campaign !~ '@' and lt_campaign !~ '[0-9]{8,}'));

comment on column public.applications.ft_source is 'First-touch utm_source. No financial band, phone, CR, or statement.';
comment on column public.applications.analytics_id is 'Set only when analytics consent was given. Null still attributes from ft_ columns.';

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
    and ft_source is null
    and ft_medium is null
    and ft_campaign is null
    and ft_content is null
    and ft_term is null
    and ft_referrer_host is null
    and ft_landing_path is null
    and ft_at is null
    and lt_source is null
    and lt_medium is null
    and lt_campaign is null
    and analytics_id is null
    and attribution_version is null
  );

create table if not exists public.consent_log (
  id uuid primary key default gen_random_uuid(),
  consent_id uuid not null,
  choice text not null,
  banner_version text not null,
  notice_version text not null,
  language text not null,
  user_id uuid,
  created_at timestamptz not null default now(),
  constraint consent_log_choice_check check (choice in ('accept', 'reject')),
  constraint consent_log_language_check check (language in ('en', 'ar')),
  constraint consent_log_banner_version_check check (char_length(banner_version) between 1 and 32),
  constraint consent_log_notice_version_check check (char_length(notice_version) between 1 and 32),
  constraint consent_log_user_fk foreign key (user_id) references auth.users (id) on delete set null
);

comment on table public.consent_log is
  'Consent choices only. No IP address and no user agent. Written by the consent-log edge function. Retained 13 months.';

create index if not exists consent_log_created_at_idx on public.consent_log (created_at);
create index if not exists consent_log_consent_id_created_idx on public.consent_log (consent_id, created_at desc);

alter table public.consent_log enable row level security;
alter table public.consent_log force row level security;

revoke all on table public.consent_log from public, anon, authenticated;
grant insert, select on table public.consent_log to service_role;

create or replace function public.purge_expired_consent_log()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.consent_log
  where created_at < now() - interval '13 months';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

comment on function public.purge_expired_consent_log() is
  'Deletes consent_log rows older than 13 months. Scheduled nightly when pg_cron is available.';

revoke all on function public.purge_expired_consent_log() from public, anon, authenticated;
grant execute on function public.purge_expired_consent_log() to service_role;

do $cron$
begin
  begin
    create extension if not exists pg_cron with schema extensions;
  exception
    when others then
      raise notice 'pg_cron unavailable, consent retention function remains for a scheduler: %', sqlerrm;
      return;
  end;
  if exists (select 1 from cron.job where jobname = 'consent_log_retention_13m') then
    perform cron.unschedule('consent_log_retention_13m');
  end if;
  perform cron.schedule(
    'consent_log_retention_13m',
    '20 3 * * *',
    'select public.purge_expired_consent_log()'
  );
exception
  when others then
    raise notice 'consent_log cron schedule skipped: %', sqlerrm;
end
$cron$;

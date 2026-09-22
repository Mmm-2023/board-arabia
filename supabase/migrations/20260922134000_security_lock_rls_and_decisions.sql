-- SECURITY LOCK (applied on iirqbizwanyhgkhanntq)
-- Drop client UPDATE of applications; tighten anon INSERT; least-privilege grants.

drop policy if exists applications_update_staff on public.applications;

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
  );

drop policy if exists applications_select_staff on public.applications;
create policy applications_select_staff on public.applications
  for select to authenticated
  using (exists (select 1 from public.staff_users s where s.user_id = auth.uid()));

revoke all on table public.applications from anon, authenticated;
grant insert on table public.applications to anon, authenticated;
grant select on table public.applications to authenticated;

revoke all on table public.staff_users from anon;
revoke all on table public.staff_users from authenticated;
grant select, insert on table public.staff_users to authenticated;

revoke all on table public.email_events from anon, authenticated;
grant select on table public.email_events to authenticated;

create table if not exists public.apply_rate_limits (
  rate_key text primary key,
  window_start timestamptz not null default now(),
  hit_count int not null default 0
);
alter table public.apply_rate_limits enable row level security;
revoke all on table public.apply_rate_limits from anon, authenticated;

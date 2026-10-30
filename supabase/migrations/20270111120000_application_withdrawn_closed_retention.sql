-- Widen public.applications status to withdrawn and closed.
-- Keep every status the current check already allows.
-- Add withdrawn and closed to the 12 month application delete.
-- The clock stays decision_at, the timestamp the plan already uses.
-- No other retention rule changes.
-- Apply this file only, after 20270110120000_majlis_reminder_windows.sql.
-- Do not apply it from the app or from CI.
-- Slot 20270111120000.

alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications
  add constraint applications_status_check
  check (status in (
    'pending',
    'verified',
    'declined',
    'accepted',
    'rejected',
    'admitted',
    'withdrawn',
    'closed'
  ));

create or replace function public.retention_sweep_plan(p_apply boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
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
  retention_days int := 30;
  ai_jobs uuid[] := '{}';
  ai_due_files text[] := '{}';
  ai_queued_files text[] := '{}';
  ai_files text[] := '{}';
  dd_decks uuid[] := '{}';
  dd_jobs uuid[] := '{}';
  dd_reports uuid[] := '{}';
  dd_due_files text[] := '{}';
  dd_queued_files text[] := '{}';
  dd_files text[] := '{}';
  access_ids uuid[] := '{}';
  majlis_due uuid[] := '{}';
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
      and not exists (select 1 from public.majlis_applications app where app.user_id = c.user_id)
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
      and not exists (select 1 from public.majlis_applications app where app.user_id = c.user_id)
    order by c.created_at
    limit 200
  ) due;

  -- LEGAL CHANGE: 12 months after your last majlis, after a decline, after an
  -- undecided majlis date, or after the last update when every request was cancelled.
  select coalesce(array_agg(user_id), '{}') into majlis_due
  from (
    select c.user_id
    from public.candidates c
    where c.request_state = 'open'
      and exists (select 1 from public.majlis_applications app where app.user_id = c.user_id)
      and not exists (select 1 from public.members m where m.user_id = c.user_id)
      and not exists (select 1 from public.staff_users s where s.user_id = c.user_id)
      and (
        (
          exists (
            select 1 from public.majlis_applications acc
            where acc.user_id = c.user_id
              and acc.status in ('accepted', 'waitlist')
          )
          and not exists (
            select 1
            from public.majlis_applications acc
            join public.majlis_events e on e.id = acc.event_id
            where acc.user_id = c.user_id
              and acc.status in ('accepted', 'waitlist')
              and e.ends_at > now() - interval '12 months'
          )
        )
        or (
          not exists (
            select 1 from public.majlis_applications acc
            where acc.user_id = c.user_id
              and acc.status in ('accepted', 'waitlist')
          )
          and exists (
            select 1 from public.majlis_applications pend
            where pend.user_id = c.user_id
              and pend.status = 'pending'
          )
          and not exists (
            select 1
            from public.majlis_applications pend
            join public.majlis_events e on e.id = pend.event_id
            where pend.user_id = c.user_id
              and pend.status = 'pending'
              and e.ends_at > now() - interval '12 months'
          )
        )
        or (
          not exists (
            select 1 from public.majlis_applications acc
            where acc.user_id = c.user_id
              and acc.status in ('accepted', 'waitlist', 'pending')
          )
          and (
            select max(rej.decided_at)
            from public.majlis_applications rej
            where rej.user_id = c.user_id
              and rej.status = 'rejected'
          ) < now() - interval '12 months'
        )
        or (
          not exists (
            select 1 from public.majlis_applications other
            where other.user_id = c.user_id
              and other.status in ('accepted', 'waitlist', 'pending', 'rejected')
          )
          and (
            select max(can.updated_at)
            from public.majlis_applications can
            where can.user_id = c.user_id
              and can.status = 'cancelled'
          ) < now() - interval '12 months'
        )
      )
    order by c.created_at
    limit 500
  ) due_majlis;

  select coalesce(array_agg(id), '{}') into applications
  from (
    select a.id
    from public.applications a
    where a.status in ('rejected', 'declined', 'withdrawn', 'closed')
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

  select s.retention_days into retention_days
  from public.ai_tool_settings s
  where s.id;
  if retention_days is null or retention_days < 1 then
    retention_days := 30;
  end if;

  select coalesce(array_agg(due.id), '{}'), coalesce(array_agg(due.storage_path), '{}')
    into ai_jobs, ai_due_files
  from (
    select j.id, j.storage_path
    from public.ai_tool_jobs j
    where j.created_at < now() - make_interval(days => retention_days)
    order by j.created_at
    limit 500
  ) due;

  select coalesce(array_agg(q.storage_path), '{}') into ai_queued_files
  from (
    select storage_path
    from public.ai_tool_file_purge
    order by created_at
    limit 500
  ) q;

  select coalesce(array_agg(distinct path), '{}') into ai_files
  from (
    select unnest(coalesce(ai_due_files, '{}'::text[]) || coalesce(ai_queued_files, '{}'::text[])) as path
  ) paths
  where path is not null and path <> '';

  select coalesce(array_agg(due.id), '{}'), coalesce(array_agg(due.storage_path), '{}')
    into dd_decks, dd_due_files
  from (
    select d.id, d.storage_path
    from public.due_diligence_decks d
    where d.created_at < now() - make_interval(days => retention_days)
    order by d.created_at
    limit 500
  ) due;

  select coalesce(array_agg(due.id), '{}') into dd_jobs
  from (
    select j.id
    from public.due_diligence_jobs j
    where j.created_at < now() - make_interval(days => retention_days)
    order by j.created_at
    limit 500
  ) due;

  select coalesce(array_agg(due.id), '{}') into dd_reports
  from (
    select r.id
    from public.due_diligence_reports r
    where r.created_at < now() - make_interval(days => retention_days)
    order by r.created_at
    limit 500
  ) due;

  select coalesce(array_agg(q.storage_path), '{}') into dd_queued_files
  from (
    select storage_path
    from public.due_diligence_file_purge
    order by created_at
    limit 500
  ) q;

  select coalesce(array_agg(distinct path), '{}') into dd_files
  from (
    select unnest(coalesce(dd_due_files, '{}'::text[]) || coalesce(dd_queued_files, '{}'::text[])) as path
  ) paths
  where path is not null and path <> '';

  select coalesce(array_agg(id), '{}') into access_ids
  from (
    select l.id
    from public.staff_access_log l
    where l.created_at < now() - interval '13 months'
    order by l.created_at
    limit 2000
  ) old_access;

  all_ids := unverified || never_submitted || decided || majlis_due;

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
    insert into public.ai_tool_file_purge (storage_path)
    select distinct path
    from unnest(coalesce(ai_due_files, '{}'::text[])) as path
    where path is not null and path <> ''
    on conflict (storage_path) do nothing;

    delete from public.ai_tool_outputs where job_id = any(coalesce(ai_jobs, '{}'::uuid[]));
    delete from public.ai_tool_notes where job_id = any(coalesce(ai_jobs, '{}'::uuid[]));
    delete from public.ai_tool_consents where job_id = any(coalesce(ai_jobs, '{}'::uuid[]));
    delete from public.ai_tool_jobs where id = any(coalesce(ai_jobs, '{}'::uuid[]));

    insert into public.due_diligence_file_purge (storage_path)
    select distinct path
    from unnest(coalesce(dd_due_files, '{}'::text[])) as path
    where path is not null and path <> ''
    on conflict (storage_path) do nothing;

    delete from public.due_diligence_reports
    where id = any(coalesce(dd_reports, '{}'::uuid[]))
      or deck_id = any(coalesce(dd_decks, '{}'::uuid[]))
      or job_id = any(coalesce(dd_jobs, '{}'::uuid[]));
    delete from public.due_diligence_jobs
    where id = any(coalesce(dd_jobs, '{}'::uuid[]))
      or deck_id = any(coalesce(dd_decks, '{}'::uuid[]));
    delete from public.due_diligence_decks
    where id = any(coalesce(dd_decks, '{}'::uuid[]));

    delete from public.staff_access_log
    where id = any(coalesce(access_ids, '{}'::uuid[]));

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
    update public.majlis_applications
      set seat_held = false,
          status = case
            when status in ('received', 'pending', 'accepted', 'waitlist') then 'cancelled'
            else status
          end
      where user_id = any(all_ids);
    delete from public.majlis_applications
      where user_id = any(all_ids);

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
    'majlis_due', to_jsonb(majlis_due),
    'applications', to_jsonb(applications),
    'members', to_jsonb(members),
    'invites', to_jsonb(invites),
    'reminders', to_jsonb(reminders),
    'consent', to_jsonb(consent_ids),
    'events', event_count,
    'cache', cache_count,
    'invites_returned', returned_count,
    'ai_tool_jobs', to_jsonb(ai_jobs),
    'ai_tool_files', to_jsonb(ai_files),
    'ai_tool_retention_days', retention_days,
    'dd_decks', to_jsonb(dd_decks),
    'dd_jobs', to_jsonb(dd_jobs),
    'dd_reports', to_jsonb(dd_reports),
    'dd_files', to_jsonb(dd_files),
    'staff_access_log', to_jsonb(access_ids)
  );
end;
$$;

revoke all on function public.retention_sweep_plan(boolean) from public, anon, authenticated;
grant execute on function public.retention_sweep_plan(boolean) to service_role;

comment on function public.retention_sweep_plan(boolean) is
  'Retention plan. p_apply false lists rows. p_apply true deletes unverified sign-ups at 7 days, confirmed accounts that never submit at 120 days, and free accounts with a majlis request 12 months after your last majlis or after rejection. Cancelled-only accounts go 12 months after the last update. Declined or closed requests go at 12 months. Rejected, declined, withdrawn, and closed applications go 12 months after decision_at. Members and staff are not deleted. Does not send mail.';


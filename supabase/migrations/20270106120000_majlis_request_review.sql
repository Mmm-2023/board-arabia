-- MJ-3b-2 staff review of majlis requests.
-- Apply after 20270105120000. The operator applies this file via MCP.
-- Do not apply it from the app, from CI, or with supabase db push.
-- No schedule. This file does not send mail. The master switch is not changed.
-- Reuses public.majlis_applications and public.review_majlis_application.
-- No new policy on that table. form_snapshot is read only by the staff definer.
-- Accept and reject write an audit row of ids only. A full event becomes waitlist.
-- Only an accepted request holds a seat. The virtual seat cap from 20270102120000 stays.

create table if not exists public.majlis_application_audits (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  actor_user_id uuid not null,
  decision text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint majlis_application_audits_decision_check check (
    decision in ('accepted', 'waitlist', 'rejected')
  )
);

comment on table public.majlis_application_audits is
  'Staff accept, waitlist, or reject. Columns are the actor id, the time, the decision, and the request id. No names, emails, phones, or message text.';

create index if not exists majlis_application_audits_request_idx
  on public.majlis_application_audits (application_id, created_at desc);

alter table public.majlis_application_audits enable row level security;
alter table public.majlis_application_audits force row level security;
revoke all on table public.majlis_application_audits from public, anon, authenticated;

create table if not exists public.majlis_request_mail_drafts (
  kind text primary key,
  subject text not null,
  body text not null,
  updated_by uuid,
  updated_at timestamptz not null default pg_catalog.now(),
  send_enabled boolean not null default false,
  constraint majlis_request_mail_drafts_kind_check check (kind in ('accept', 'decline')),
  constraint majlis_request_mail_drafts_subject_len check (char_length(btrim(subject)) between 1 and 160),
  constraint majlis_request_mail_drafts_body_len check (char_length(btrim(body)) between 1 and 4000),
  constraint majlis_request_mail_drafts_send_off check (send_enabled = false)
);

comment on table public.majlis_request_mail_drafts is
  'Editable accept and decline wording. Drafts only. send_enabled cannot be true. Nothing in this table is sent.';

alter table public.majlis_request_mail_drafts enable row level security;
alter table public.majlis_request_mail_drafts force row level security;
revoke all on table public.majlis_request_mail_drafts from public, anon, authenticated;

insert into public.majlis_request_mail_drafts (kind, subject, body, send_enabled)
values
  (
    'accept',
    'DRAFT FOR MICHAEL: Majlis request accepted',
    $draft$DRAFT FOR MICHAEL. This wording is not approved. Nothing is sent.

Hello,

Your request to attend this majlis is accepted. Sign in to your free Board Arabia account to open the join link.

Our admin team$draft$,
    false
  ),
  (
    'decline',
    'DRAFT FOR MICHAEL: Majlis request declined',
    $draft$DRAFT FOR MICHAEL. This wording is not approved. Nothing is sent.

Hello,

Your request to attend this majlis was not accepted this time.

Our admin team$draft$,
    false
  )
on conflict (kind) do nothing;

create or replace function public.review_majlis_application(p_id uuid, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_app public.majlis_applications%rowtype;
  v_verified timestamptz;
  v_decision text;
  v_cap integer;
  v_format text;
  v_host uuid;
  v_used integer := 0;
  v_event uuid;
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if p_decision not in ('accepted', 'waitlist', 'rejected') then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select * into v_app
  from public.majlis_applications
  where id = p_id
  for update;

  if v_app.id is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select c.email_verified_at into v_verified
  from public.candidates c
  where c.user_id = v_app.user_id;

  -- Board Arabia email code only. auth.users.email_confirmed_at is not read.
  if v_verified is null then
    raise exception 'email_unverified' using errcode = '42501';
  end if;

  v_decision := p_decision;
  v_event := v_app.event_id;

  if v_decision = 'accepted' then
    select e.capacity, e.format, e.host_member_id
      into v_cap, v_format, v_host
    from public.majlis_events e
    where e.id = v_event
    for update;

    if v_format = 'virtual' and v_cap is not null
       and private.majlis_virtual_member_cap(v_host) < v_cap then
      v_cap := private.majlis_virtual_member_cap(v_host);
    end if;

    if pg_catalog.to_regclass('public.majlis_rsvps') is not null then
      select count(*)::integer into v_used
      from public.majlis_rsvps r
      where r.event_id = v_event
        and r.status = 'registered';
    end if;

    v_used := coalesce(v_used, 0) + coalesce((
      select count(*)::integer
      from public.majlis_applications a
      where a.event_id = v_event
        and a.status = 'accepted'
        and a.id is distinct from v_app.id
    ), 0);

    if v_cap is not null and v_used >= v_cap then
      v_decision := 'waitlist';
    end if;
  end if;

  update public.majlis_applications
    set status = v_decision,
        decided_by = auth.uid(),
        decided_at = pg_catalog.now(),
        verified_at = v_verified
    where id = v_app.id;

  insert into public.majlis_application_audits (application_id, actor_user_id, decision, created_at)
  values (v_app.id, auth.uid(), v_decision, pg_catalog.clock_timestamp());

  return pg_catalog.jsonb_build_object('ok', true, 'status', v_decision);
end;
$fn$;

revoke all on function public.review_majlis_application(uuid, text) from public, anon;
grant execute on function public.review_majlis_application(uuid, text) to authenticated;

comment on function public.review_majlis_application(uuid, text) is
  'Staff decision. Accept and waitlist are blocked until the Board Arabia email code is confirmed. A full event, using the same seat cap as RSVP, stores waitlist and does not hold a seat. Writes an audit row of ids only. Does not send mail.';

create or replace function public.staff_list_majlis_requests()
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
    select pg_catalog.jsonb_agg(q.row_json order by q.sort_key, q.submitted_at desc nulls last)
    from (
      select
        pg_catalog.jsonb_build_object(
          'id', a.id,
          'event_id', a.event_id,
          'event_title', e.title,
          'starts_at', e.starts_at,
          'ends_at', e.ends_at,
          'status', a.status,
          'submitted_at', a.submitted_at,
          'seat_held', a.seat_held,
          'email_verified', (c.email_verified_at is not null),
          'full_name', coalesce(a.form_snapshot->>'full_name', ''),
          'phone', coalesce(a.form_snapshot->>'phone', ''),
          'company', coalesce(a.form_snapshot->>'company', ''),
          'role', coalesce(a.form_snapshot->>'role', ''),
          'linkedin', coalesce(a.form_snapshot->>'linkedin', ''),
          'why', coalesce(a.form_snapshot->>'why', '')
        ) as row_json,
        case a.status when 'pending' then 0 when 'received' then 1 else 2 end as sort_key,
        a.submitted_at
      from public.majlis_applications a
      join public.majlis_events e on e.id = a.event_id
      left join public.candidates c on c.user_id = a.user_id
    ) q
  ), '[]'::jsonb);
end;
$fn$;

revoke all on function public.staff_list_majlis_requests() from public, anon;
grant execute on function public.staff_list_majlis_requests() to authenticated;

comment on function public.staff_list_majlis_requests() is
  'Staff list of majlis requests, including the form fields needed to check fit. No email address. Hosts, attendees, partners, and anon are refused.';

create or replace function public.staff_majlis_request_drafts()
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
        'kind', d.kind,
        'subject', d.subject,
        'body', d.body,
        'updated_at', d.updated_at,
        'send_enabled', d.send_enabled
      )
      order by d.kind
    )
    from public.majlis_request_mail_drafts d
  ), '[]'::jsonb);
end;
$fn$;

revoke all on function public.staff_majlis_request_drafts() from public, anon;
grant execute on function public.staff_majlis_request_drafts() to authenticated;

comment on function public.staff_majlis_request_drafts() is
  'Staff read of the accept and decline drafts. Sending stays off.';

create or replace function public.staff_save_majlis_request_draft(
  p_kind text,
  p_subject text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_kind text := btrim(coalesce(p_kind, ''));
  v_subject text := btrim(coalesce(p_subject, ''));
  v_body text := btrim(coalesce(p_body, ''));
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if v_kind not in ('accept', 'decline')
     or char_length(v_subject) < 1
     or char_length(v_subject) > 160
     or char_length(v_body) < 1
     or char_length(v_body) > 4000
  then
    raise exception 'draft' using errcode = '22023';
  end if;

  insert into public.majlis_request_mail_drafts (kind, subject, body, updated_by, updated_at, send_enabled)
  values (v_kind, v_subject, v_body, auth.uid(), pg_catalog.now(), false)
  on conflict (kind) do update
    set subject = excluded.subject,
        body = excluded.body,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at,
        send_enabled = false;

  return pg_catalog.jsonb_build_object('ok', true, 'send_enabled', false);
end;
$fn$;

revoke all on function public.staff_save_majlis_request_draft(text, text, text) from public, anon;
grant execute on function public.staff_save_majlis_request_draft(text, text, text) to authenticated;

comment on function public.staff_save_majlis_request_draft(text, text, text) is
  'Saves an accept or decline draft. Forces sending off. Does not send mail.';

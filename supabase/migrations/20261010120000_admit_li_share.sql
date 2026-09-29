-- Admitted member LinkedIn share state.
-- Flags stay in Edge secrets and default off. This table does not turn sending on.
-- Service role only. Members do not read or write these rows directly.

create table if not exists public.admit_li_share (
  user_id uuid primary key references public.members(user_id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  seat_label text not null default 'Founding Member',
  token text,
  post_text text,
  sent_at timestamptz,
  clicked_at timestamptz,
  dismissed_at timestamptz,
  reminder_sent_at timestamptz,
  suppressed_at timestamptz,
  opted_out_at timestamptz,
  created_at timestamptz not null default now(),
  constraint admit_li_share_seat_label_len check (char_length(seat_label) between 1 and 80),
  constraint admit_li_share_token_charset check (
    token is null or token ~ '^[A-Za-z0-9_-]{20,128}$'
  ),
  constraint admit_li_share_post_len check (post_text is null or char_length(post_text) <= 4000)
);

create unique index if not exists admit_li_share_token_idx
  on public.admit_li_share (token)
  where token is not null;

create index if not exists admit_li_share_reminder_due_idx
  on public.admit_li_share (sent_at)
  where sent_at is not null
    and clicked_at is null
    and reminder_sent_at is null
    and suppressed_at is null
    and opted_out_at is null;

alter table public.admit_li_share enable row level security;

revoke all on table public.admit_li_share from public, anon, authenticated;

comment on table public.admit_li_share is
  'One share email, one click stamp, one dismiss, and one reminder per member. Edge flags gate sending.';

create or replace function public.claim_admit_li_share_send(
  p_user_id uuid,
  p_application_id uuid,
  p_token text,
  p_seat_label text,
  p_post_text text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  issued jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user_id is null
    or p_token is null
    or p_token !~ '^[A-Za-z0-9_-]{20,128}$'
    or p_seat_label is null
    or char_length(trim(p_seat_label)) = 0
    or char_length(trim(p_seat_label)) > 80
    or p_post_text is null
    or char_length(p_post_text) = 0
    or char_length(p_post_text) > 4000
  then
    return null;
  end if;

  insert into public.admit_li_share (
    user_id, application_id, seat_label, token, post_text, sent_at
  )
  values (
    p_user_id,
    p_application_id,
    trim(p_seat_label),
    p_token,
    p_post_text,
    now()
  )
  on conflict (user_id) do update
    set application_id = coalesce(excluded.application_id, public.admit_li_share.application_id),
        seat_label = excluded.seat_label,
        token = coalesce(public.admit_li_share.token, excluded.token),
        post_text = coalesce(public.admit_li_share.post_text, excluded.post_text),
        sent_at = now()
    where public.admit_li_share.sent_at is null
  returning jsonb_build_object(
    'token', public.admit_li_share.token,
    'post_text', public.admit_li_share.post_text
  ) into issued;

  return issued;
end;
$$;

revoke all on function public.claim_admit_li_share_send(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_admit_li_share_send(uuid, uuid, text, text, text) to service_role;

comment on function public.claim_admit_li_share_send(uuid, uuid, text, text, text) is
  'Service role only. One send claim. A second caller updates zero rows.';

create or replace function public.release_admit_li_share_send(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  released uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.admit_li_share
  set sent_at = null
  where user_id = p_user_id
    and sent_at is not null
    and clicked_at is null
    and reminder_sent_at is null
  returning user_id into released;

  return released is not null;
end;
$$;

revoke all on function public.release_admit_li_share_send(uuid) from public, anon, authenticated;
grant execute on function public.release_admit_li_share_send(uuid) to service_role;

comment on function public.release_admit_li_share_send(uuid) is
  'Service role only. Clears a failed or dry-run send so it can be tried once more.';

create or replace function public.ensure_admit_li_share_token(
  p_user_id uuid,
  p_token text,
  p_seat_label text,
  p_post_text text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  issued text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user_id is null
    or p_token is null
    or p_token !~ '^[A-Za-z0-9_-]{20,128}$'
    or p_post_text is null
    or char_length(p_post_text) = 0
    or char_length(p_post_text) > 4000
  then
    return null;
  end if;

  insert into public.admit_li_share (user_id, seat_label, token, post_text)
  values (p_user_id, left(trim(coalesce(p_seat_label, 'Founding Member')), 80), p_token, p_post_text)
  on conflict (user_id) do update
    set token = coalesce(public.admit_li_share.token, excluded.token),
        post_text = coalesce(public.admit_li_share.post_text, excluded.post_text)
    where public.admit_li_share.dismissed_at is null
      and public.admit_li_share.clicked_at is null
  returning public.admit_li_share.token into issued;

  return issued;
end;
$$;

revoke all on function public.ensure_admit_li_share_token(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.ensure_admit_li_share_token(uuid, text, text, text) to service_role;

comment on function public.ensure_admit_li_share_token(uuid, text, text, text) is
  'Service role only. Mints a click token for the Home card. Hidden after dismiss or click.';

create or replace function public.dismiss_admit_li_share(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  dismissed uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user_id is null then
    return false;
  end if;

  insert into public.admit_li_share (user_id, seat_label, dismissed_at)
  values (p_user_id, 'Founding Member', now())
  on conflict (user_id) do update
    set dismissed_at = coalesce(public.admit_li_share.dismissed_at, now())
  returning user_id into dismissed;

  return dismissed is not null;
end;
$$;

revoke all on function public.dismiss_admit_li_share(uuid) from public, anon, authenticated;
grant execute on function public.dismiss_admit_li_share(uuid) to service_role;

comment on function public.dismiss_admit_li_share(uuid) is
  'Service role only. Hides the Home card. Does not opt the member out of the email reminder.';

create or replace function public.mark_admit_li_share_clicked(p_token text)
returns table (
  user_id uuid,
  seat_label text,
  post_text text,
  full_name text,
  headline text,
  company text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{20,128}$' then
    return;
  end if;

  update public.admit_li_share
  set clicked_at = coalesce(clicked_at, now())
  where token = p_token;

  return query
  select
    s.user_id,
    s.seat_label,
    s.post_text,
    p.full_name,
    p.headline,
    p.company
  from public.admit_li_share s
  left join public.profiles p on p.user_id = s.user_id
  where s.token = p_token;
end;
$$;

revoke all on function public.mark_admit_li_share_clicked(text) from public, anon, authenticated;
grant execute on function public.mark_admit_li_share_clicked(text) to service_role;

comment on function public.mark_admit_li_share_clicked(text) is
  'Service role only. Records a first-party share click. The caller redirects to LinkedIn.';

create or replace function public.due_admit_li_share_reminders()
returns table (
  user_id uuid,
  email text,
  application_id uuid,
  sent_at timestamptz,
  clicked_at timestamptz,
  reminder_sent_at timestamptz,
  suppressed_at timestamptz,
  opted_out_at timestamptz,
  token text,
  seat_label text,
  post_text text,
  full_name text,
  headline text,
  company text,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    s.user_id,
    m.email,
    s.application_id,
    s.sent_at,
    s.clicked_at,
    s.reminder_sent_at,
    s.suppressed_at,
    s.opted_out_at,
    s.token,
    s.seat_label,
    s.post_text,
    p.full_name,
    p.headline,
    p.company,
    m.status
  from public.admit_li_share s
  join public.members m on m.user_id = s.user_id
  left join public.profiles p on p.user_id = s.user_id
  where s.sent_at is not null
    and s.sent_at <= now() - interval '3 days'
    and s.clicked_at is null
    and s.reminder_sent_at is null
    and s.suppressed_at is null
    and s.opted_out_at is null
    and m.status in ('invited', 'active')
    and m.email is not null
  order by s.sent_at
  limit 40;
end;
$$;

revoke all on function public.due_admit_li_share_reminders() from public, anon, authenticated;
grant execute on function public.due_admit_li_share_reminders() to service_role;

comment on function public.due_admit_li_share_reminders() is
  'Service role only. Share emails at least 3 days old with no click, suppress, or opt-out.';

create or replace function public.claim_admit_li_share_reminder(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.admit_li_share s
  set reminder_sent_at = now()
  from public.members m
  where s.user_id = p_user_id
    and m.user_id = s.user_id
    and s.sent_at is not null
    and s.sent_at <= now() - interval '3 days'
    and s.clicked_at is null
    and s.reminder_sent_at is null
    and s.suppressed_at is null
    and s.opted_out_at is null
    and m.status in ('invited', 'active')
    and m.email is not null
  returning s.user_id into claimed;

  return claimed is not null;
end;
$$;

revoke all on function public.claim_admit_li_share_reminder(uuid) from public, anon, authenticated;
grant execute on function public.claim_admit_li_share_reminder(uuid) to service_role;

comment on function public.claim_admit_li_share_reminder(uuid) is
  'Service role only. Atomic claim for the single 3 day reminder.';

create or replace function public.release_admit_li_share_reminder(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  released uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.admit_li_share
  set reminder_sent_at = null
  where user_id = p_user_id
    and reminder_sent_at is not null
    and clicked_at is null
  returning user_id into released;

  return released is not null;
end;
$$;

revoke all on function public.release_admit_li_share_reminder(uuid) from public, anon, authenticated;
grant execute on function public.release_admit_li_share_reminder(uuid) to service_role;

comment on function public.release_admit_li_share_reminder(uuid) is
  'Service role only. Clears a failed or dry-run reminder so the next run can send once.';

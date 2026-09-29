-- One reminder per unused email invite, claimed before send.
-- Scheduler is the GitHub Action workflow invite-reminders, which stays a no-op
-- until INVITE_REMINDER_SECRET is set. pg_cron and pg_net are not used.

alter table public.member_invites
  add column if not exists reminder_sent_at timestamptz;

comment on column public.member_invites.reminder_sent_at is
  'Claimed when the single 7-day unused-invite reminder is taken. Null means not sent.';

create index if not exists member_invites_reminder_due_idx
  on public.member_invites (created_at)
  where reminder_sent_at is null
    and channel = 'email'
    and status in ('pending', 'opened')
    and applied_at is null
    and application_id is null;

create or replace function public.due_member_invite_reminders()
returns table (
  id uuid,
  token text,
  recipient_email text,
  created_at timestamptz,
  expires_at timestamptz,
  status text,
  channel text,
  applied_at timestamptz,
  application_id uuid,
  reminder_sent_at timestamptz,
  inviter_name text,
  inviter_headline text,
  inviter_company text
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
    i.id,
    i.token,
    i.recipient_email,
    i.created_at,
    i.expires_at,
    i.status,
    i.channel,
    i.applied_at,
    i.application_id,
    i.reminder_sent_at,
    coalesce(nullif(trim(p.full_name), ''), 'A Board Arabia member'),
    nullif(trim(p.headline), ''),
    nullif(trim(p.company), '')
  from public.member_invites i
  left join public.profiles p on p.user_id = i.inviter_member_id
  where i.reminder_sent_at is null
    and i.channel = 'email'
    and i.status in ('pending', 'opened')
    and i.applied_at is null
    and i.application_id is null
    and i.recipient_email is not null
    and i.created_at <= now() - interval '7 days'
    and i.expires_at > now()
  order by i.created_at
  limit 40;
end;
$$;

revoke all on function public.due_member_invite_reminders() from public, anon, authenticated;
grant execute on function public.due_member_invite_reminders() to service_role;

comment on function public.due_member_invite_reminders() is
  'Service role only. Unused email invites at least 7 days old. Invoke remind-member-invites with INVITE_REMINDER_SECRET.';

create or replace function public.claim_member_invite_reminder(p_invite_id uuid)
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

  update public.member_invites
  set reminder_sent_at = now()
  where id = p_invite_id
    and reminder_sent_at is null
    and channel = 'email'
    and status in ('pending', 'opened')
    and applied_at is null
    and application_id is null
    and recipient_email is not null
    and created_at <= now() - interval '7 days'
    and expires_at > now()
  returning id into claimed;

  return claimed is not null;
end;
$$;

revoke all on function public.claim_member_invite_reminder(uuid) from public, anon, authenticated;
grant execute on function public.claim_member_invite_reminder(uuid) to service_role;

comment on function public.claim_member_invite_reminder(uuid) is
  'Service role only. Atomic claim. A second caller updates zero rows.';

create or replace function public.release_member_invite_reminder(p_invite_id uuid)
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

  update public.member_invites
  set reminder_sent_at = null
  where id = p_invite_id
    and reminder_sent_at is not null
    and channel = 'email'
    and status in ('pending', 'opened')
    and applied_at is null
    and application_id is null
  returning id into released;

  return released is not null;
end;
$$;

revoke all on function public.release_member_invite_reminder(uuid) from public, anon, authenticated;
grant execute on function public.release_member_invite_reminder(uuid) to service_role;

comment on function public.release_member_invite_reminder(uuid) is
  'Service role only. Clears a claim after a dry-run or a failed send so the one reminder can be retried. Does not clear a claim after the invite is used.';

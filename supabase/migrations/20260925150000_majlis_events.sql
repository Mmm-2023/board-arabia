-- Majlis slice 1. Host applications stay pending until staff Accept or Reject.
-- No seed rows. No RSVP table. Venue address is masked on the member view.

create table public.majlis_events (
  id uuid primary key default gen_random_uuid(),
  host_member_id uuid not null references public.members(user_id) on delete cascade,
  title text not null,
  description text not null,
  region text not null,
  focus_tags text[] not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Riyadh',
  capacity int not null,
  venue_name text not null,
  venue_address text not null,
  venue_visibility text not null default 'members_on_rsvp',
  status text not null default 'pending_approval',
  rejection_feedback text,
  admin_note text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint majlis_events_title_len check (char_length(trim(title)) between 1 and 160),
  constraint majlis_events_description_len check (char_length(trim(description)) between 1 and 2000),
  constraint majlis_events_region_check check (
    region in (
      'Riyadh',
      'Makkah',
      'Madinah',
      'Eastern Province',
      'Asir',
      'Tabuk',
      'Hail',
      'Northern Borders',
      'Jazan',
      'Najran',
      'Al Bahah',
      'Al Jawf',
      'Qassim'
    )
  ),
  constraint majlis_events_focus_tags_check check (
    cardinality(focus_tags) between 1 and 8
  ),
  constraint majlis_events_time_check check (ends_at > starts_at),
  constraint majlis_events_timezone_check check (timezone = 'Asia/Riyadh'),
  constraint majlis_events_capacity_check check (capacity between 1 and 500),
  constraint majlis_events_venue_name_len check (char_length(trim(venue_name)) between 1 and 200),
  constraint majlis_events_venue_address_len check (char_length(trim(venue_address)) between 1 and 500),
  constraint majlis_events_venue_visibility_check check (
    venue_visibility in ('members_on_rsvp', 'members_always')
  ),
  constraint majlis_events_status_check check (
    status in ('pending_approval', 'published', 'rejected')
  ),
  constraint majlis_events_rejection_feedback_check check (
    (
      status = 'rejected'
      and rejection_feedback is not null
      and char_length(trim(rejection_feedback)) between 1 and 2000
    )
    or (status <> 'rejected' and rejection_feedback is null)
  ),
  constraint majlis_events_publish_audit_check check (
    status <> 'published'
    or (approved_by is not null and approved_at is not null)
  ),
  constraint majlis_events_pending_clean_check check (
    status <> 'pending_approval'
    or (
      approved_by is null
      and approved_at is null
      and rejection_feedback is null
      and admin_note is null
    )
  )
);

create index majlis_events_status_starts_idx on public.majlis_events (status, starts_at);
create index majlis_events_host_idx on public.majlis_events (host_member_id, created_at desc);

drop trigger if exists majlis_events_set_updated_at on public.majlis_events;
create trigger majlis_events_set_updated_at
  before update on public.majlis_events
  for each row execute function public.set_updated_at();

create or replace function private.majlis_events_guard_client_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'pending_approval'
      or new.approved_by is not null
      or new.approved_at is not null
      or new.rejection_feedback is not null
      or new.admin_note is not null
      or new.host_member_id is distinct from auth.uid() then
      raise exception 'host_cannot_publish' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'host_cannot_publish' using errcode = '42501';
end;
$$;

revoke all on function private.majlis_events_guard_client_write() from public, anon, authenticated;

drop trigger if exists majlis_events_guard_client_write on public.majlis_events;
create trigger majlis_events_guard_client_write
  before insert or update on public.majlis_events
  for each row execute function private.majlis_events_guard_client_write();

create or replace function private.majlis_events_guard_focus_tags()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  tag text;
begin
  if new.focus_tags is null or cardinality(new.focus_tags) < 1 or cardinality(new.focus_tags) > 8 then
    raise exception 'focus_tags_invalid' using errcode = '23514';
  end if;
  foreach tag in array new.focus_tags loop
    if tag is null or char_length(trim(tag)) < 1 or char_length(trim(tag)) > 40 then
      raise exception 'focus_tags_invalid' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function private.majlis_events_guard_focus_tags() from public, anon, authenticated;

drop trigger if exists majlis_events_guard_focus_tags on public.majlis_events;
create trigger majlis_events_guard_focus_tags
  before insert or update on public.majlis_events
  for each row execute function private.majlis_events_guard_focus_tags();

alter table public.majlis_events enable row level security;
alter table public.majlis_events force row level security;

revoke all on table public.majlis_events from public, anon, authenticated;

grant insert (
  host_member_id,
  title,
  description,
  region,
  focus_tags,
  starts_at,
  ends_at,
  timezone,
  capacity,
  venue_name,
  venue_address,
  venue_visibility,
  status
) on table public.majlis_events to authenticated;

drop policy if exists majlis_events_insert_own_pending on public.majlis_events;
create policy majlis_events_insert_own_pending on public.majlis_events
  for insert to authenticated
  with check (
    host_member_id = auth.uid()
    and status = 'pending_approval'
    and approved_by is null
    and approved_at is null
    and rejection_feedback is null
    and admin_note is null
    and exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and m.status in ('invited', 'active')
        and m.seat in ('ksa', 'intl')
    )
  );

create table public.majlis_decisions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.majlis_events(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  note text,
  created_at timestamptz not null default now(),
  constraint majlis_decisions_action_check check (action in ('accept', 'reject')),
  constraint majlis_decisions_reject_note_check check (
    action <> 'reject' or (note is not null and char_length(trim(note)) between 1 and 2000)
  )
);

create index majlis_decisions_event_idx on public.majlis_decisions (event_id, created_at desc);

alter table public.majlis_decisions enable row level security;
alter table public.majlis_decisions force row level security;

revoke all on table public.majlis_decisions from public, anon, authenticated;

grant select on table public.majlis_decisions to authenticated;

drop policy if exists majlis_decisions_select_staff on public.majlis_decisions;
create policy majlis_decisions_select_staff on public.majlis_decisions
  for select to authenticated
  using (exists (select 1 from public.staff_users s where s.user_id = auth.uid()));

create table public.majlis_apply_limits (
  member_id uuid primary key references public.members(user_id) on delete cascade,
  window_start timestamptz not null default now(),
  hit_count int not null default 0
);

alter table public.majlis_apply_limits enable row level security;
alter table public.majlis_apply_limits force row level security;
revoke all on table public.majlis_apply_limits from public, anon, authenticated;

create or replace function public.majlis_consume_apply_slot(p_member uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  slot public.majlis_apply_limits%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.majlis_apply_limits (member_id, window_start, hit_count)
  values (p_member, now(), 1)
  on conflict (member_id) do update
    set
      window_start = case
        when majlis_apply_limits.window_start < now() - interval '1 hour' then now()
        else majlis_apply_limits.window_start
      end,
      hit_count = case
        when majlis_apply_limits.window_start < now() - interval '1 hour' then 1
        else majlis_apply_limits.hit_count + 1
      end
  returning * into slot;

  if slot.hit_count > 6 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
end;
$$;

revoke all on function public.majlis_consume_apply_slot(uuid) from public, anon, authenticated;
grant execute on function public.majlis_consume_apply_slot(uuid) to service_role;

create or replace view public.majlis_events_member
with (security_barrier = true, security_invoker = false)
as
select
  e.id,
  e.host_member_id,
  e.title,
  e.description,
  e.region,
  e.focus_tags,
  e.starts_at,
  e.ends_at,
  e.timezone,
  e.capacity,
  e.venue_name,
  case
    when e.host_member_id = auth.uid()
      or exists (select 1 from public.staff_users s where s.user_id = auth.uid())
    then e.venue_address
    else null
  end as venue_address,
  e.venue_visibility,
  e.status,
  case
    when e.host_member_id = auth.uid()
      or exists (select 1 from public.staff_users s where s.user_id = auth.uid())
    then e.rejection_feedback
    else null
  end as rejection_feedback,
  case
    when exists (select 1 from public.staff_users s where s.user_id = auth.uid())
    then e.admin_note
    else null
  end as admin_note,
  case
    when exists (select 1 from public.staff_users s where s.user_id = auth.uid())
    then e.approved_at
    else null
  end as approved_at,
  e.created_at
from public.majlis_events e
where
  exists (select 1 from public.staff_users s where s.user_id = auth.uid())
  or (
    e.host_member_id = auth.uid()
    and exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and m.status in ('invited', 'active')
        and m.seat in ('ksa', 'intl')
    )
  )
  or (
    e.status = 'published'
    and exists (
      select 1
      from public.members m
      where m.user_id = auth.uid()
        and m.status in ('invited', 'active')
        and m.seat in ('ksa', 'intl')
    )
  );

revoke all on table public.majlis_events_member from public, anon, authenticated;
grant select on table public.majlis_events_member to authenticated;

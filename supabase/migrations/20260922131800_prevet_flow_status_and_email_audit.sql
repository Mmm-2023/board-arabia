-- Documented mirror of applied remote migration prevet_flow_status_and_email_audit
-- Already applied on project iirqbizwanyhgkhanntq via Supabase MCP.

alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications
  add constraint applications_status_check
  check (status in ('pending', 'accepted', 'rejected'));

alter table public.applications
  add column if not exists invite_event_id text,
  add column if not exists invite_sent_at timestamptz,
  add column if not exists decision_at timestamptz,
  add column if not exists decision_by uuid references auth.users(id);

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  application_id uuid references public.applications(id) on delete set null,
  kind text not null,
  recipient text not null,
  subject text not null,
  status text not null default 'queued',
  provider text,
  provider_id text,
  detail text,
  payload jsonb
);

alter table public.email_events enable row level security;

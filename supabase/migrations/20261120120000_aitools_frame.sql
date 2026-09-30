-- Shared frame for four member AI tools.
-- Jobs, outputs, consents, prior notes, staff flags, and a retention setting.
-- Uploaded files stay in Storage. Delete and the retention sweep remove them
-- with the Storage API, not with a delete on storage.objects.
-- Apply after review. Not applied by the authoring agent.
-- Redeploy ai-tool-job (new) and retention-sweep after this migration.

create table public.ai_tool_settings (
  id boolean primary key default true,
  retention_days integer not null default 30,
  updated_at timestamptz not null default now(),
  constraint ai_tool_settings_one_row check (id),
  constraint ai_tool_settings_days check (retention_days between 1 and 3650)
);

insert into public.ai_tool_settings (id, retention_days)
values (true, 30);

create table public.ai_tool_flags (
  tool_key text primary key,
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  constraint ai_tool_flags_tool_key_check check (
    tool_key in ('cfo_check', 'market_brief', 'term_sheet_review', 'pricing_sense_check')
  )
);

insert into public.ai_tool_flags (tool_key, enabled) values
  ('cfo_check', false),
  ('market_brief', false),
  ('term_sheet_review', false),
  ('pricing_sense_check', false);

create table public.ai_tool_jobs (
  id uuid primary key,
  member_id uuid not null references public.members (user_id) on delete cascade,
  tool_key text not null,
  status text not null default 'queued',
  step text not null default 'intake',
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  byte_size integer not null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_tool_jobs_tool_key_check check (
    tool_key in ('cfo_check', 'market_brief', 'term_sheet_review', 'pricing_sense_check')
  ),
  constraint ai_tool_jobs_status_check check (
    status in ('queued', 'reading', 'checking', 'writing', 'ready', 'failed')
  ),
  constraint ai_tool_jobs_step_check check (
    step in ('intake', 'draft', 'done')
  ),
  constraint ai_tool_jobs_path_check check (
    storage_path = member_id::text || '/' || id::text || '/source.pdf'
    or storage_path = member_id::text || '/' || id::text || '/source.txt'
    or storage_path = member_id::text || '/' || id::text || '/source.csv'
    or storage_path = member_id::text || '/' || id::text || '/source.xlsx'
    or storage_path = member_id::text || '/' || id::text || '/source.docx'
  ),
  constraint ai_tool_jobs_file_name_check check (
    char_length(btrim(file_name)) between 1 and 180
    and file_name !~ '[[:cntrl:]]'
  ),
  constraint ai_tool_jobs_mime_check check (
    mime_type in (
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  ),
  constraint ai_tool_jobs_byte_size_check check (
    byte_size > 0 and byte_size <= 15728640
  ),
  constraint ai_tool_jobs_error_check check (
    error is null or char_length(error) <= 200
  )
);

create table public.ai_tool_outputs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.ai_tool_jobs (id) on delete cascade,
  member_id uuid not null references public.members (user_id) on delete cascade,
  tool_key text not null,
  body jsonb not null,
  created_at timestamptz not null default now(),
  constraint ai_tool_outputs_tool_key_check check (
    tool_key in ('cfo_check', 'market_brief', 'term_sheet_review', 'pricing_sense_check')
  ),
  constraint ai_tool_outputs_body_check check (
    jsonb_typeof(body) = 'object'
    and octet_length(body::text) <= 65535
  )
);

create table public.ai_tool_consents (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (user_id) on delete cascade,
  tool_key text not null,
  copy_version text not null,
  accepted_at timestamptz not null,
  job_id uuid not null unique,
  constraint ai_tool_consents_tool_key_check check (
    tool_key in ('cfo_check', 'market_brief', 'term_sheet_review', 'pricing_sense_check')
  ),
  constraint ai_tool_consents_version_check check (
    char_length(btrim(copy_version)) between 1 and 80
    and copy_version !~ '[[:cntrl:]]'
  )
);

create table public.ai_tool_notes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (user_id) on delete cascade,
  tool_key text not null,
  job_id uuid not null unique references public.ai_tool_jobs (id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint ai_tool_notes_tool_key_check check (
    tool_key in ('cfo_check', 'market_brief', 'term_sheet_review', 'pricing_sense_check')
  ),
  constraint ai_tool_notes_title_check check (
    char_length(btrim(title)) between 1 and 180
  ),
  constraint ai_tool_notes_body_check check (
    char_length(body) between 1 and 2000
  )
);

create table public.ai_tool_file_purge (
  storage_path text primary key,
  created_at timestamptz not null default now(),
  constraint ai_tool_file_purge_path_check check (
    char_length(storage_path) between 3 and 300
    and storage_path !~ '[[:cntrl:]]'
    and position('..' in storage_path) = 0
  )
);

comment on table public.ai_tool_settings is
  'Retention days for AI tool uploads and outputs. Default 30. Staff can change it.';

comment on table public.ai_tool_flags is
  'Per-tool staff flags. All four default off until a later tool PR turns one on.';

comment on table public.ai_tool_jobs is
  'One run of a member AI tool. The file lives in the ai-tool-uploads bucket.';

comment on table public.ai_tool_outputs is
  'Placeholder or later tool output for one job. Deleted with the job.';

comment on table public.ai_tool_consents is
  'Consent captured before a run: member, tool, copy version, time, and job.';

comment on table public.ai_tool_notes is
  'Prior notes for one member and one tool, one row per job.';

comment on table public.ai_tool_file_purge is
  'Storage paths still to remove after a job is deleted. No email addresses.';

create index ai_tool_jobs_member_tool_idx
  on public.ai_tool_jobs (member_id, tool_key, created_at desc);

create index ai_tool_outputs_member_idx
  on public.ai_tool_outputs (member_id, created_at desc);

create index ai_tool_notes_member_tool_idx
  on public.ai_tool_notes (member_id, tool_key, created_at desc);

create index ai_tool_consents_member_tool_idx
  on public.ai_tool_consents (member_id, tool_key, accepted_at desc);

drop trigger if exists ai_tool_jobs_set_updated_at on public.ai_tool_jobs;
create trigger ai_tool_jobs_set_updated_at
  before update on public.ai_tool_jobs
  for each row execute function public.set_updated_at();

drop trigger if exists ai_tool_flags_set_updated_at on public.ai_tool_flags;
create trigger ai_tool_flags_set_updated_at
  before update on public.ai_tool_flags
  for each row execute function public.set_updated_at();

drop trigger if exists ai_tool_settings_set_updated_at on public.ai_tool_settings;
create trigger ai_tool_settings_set_updated_at
  before update on public.ai_tool_settings
  for each row execute function public.set_updated_at();

alter table public.ai_tool_settings enable row level security;
alter table public.ai_tool_flags enable row level security;
alter table public.ai_tool_jobs enable row level security;
alter table public.ai_tool_outputs enable row level security;
alter table public.ai_tool_consents enable row level security;
alter table public.ai_tool_notes enable row level security;
alter table public.ai_tool_file_purge enable row level security;

alter table public.ai_tool_settings force row level security;
alter table public.ai_tool_flags force row level security;
alter table public.ai_tool_jobs force row level security;
alter table public.ai_tool_outputs force row level security;
alter table public.ai_tool_consents force row level security;
alter table public.ai_tool_notes force row level security;
alter table public.ai_tool_file_purge force row level security;

revoke all on table public.ai_tool_settings from public, anon, authenticated;
revoke all on table public.ai_tool_flags from public, anon, authenticated;
revoke all on table public.ai_tool_jobs from public, anon, authenticated;
revoke all on table public.ai_tool_outputs from public, anon, authenticated;
revoke all on table public.ai_tool_consents from public, anon, authenticated;
revoke all on table public.ai_tool_notes from public, anon, authenticated;
revoke all on table public.ai_tool_file_purge from public, anon, authenticated;

grant select on table public.ai_tool_settings to authenticated;
grant select on table public.ai_tool_flags to authenticated;
grant select on table public.ai_tool_jobs to authenticated;
grant select on table public.ai_tool_outputs to authenticated;
grant select on table public.ai_tool_consents to authenticated;
grant select on table public.ai_tool_notes to authenticated;

grant all on table public.ai_tool_settings to service_role;
grant all on table public.ai_tool_flags to service_role;
grant all on table public.ai_tool_jobs to service_role;
grant all on table public.ai_tool_outputs to service_role;
grant all on table public.ai_tool_consents to service_role;
grant all on table public.ai_tool_notes to service_role;
grant all on table public.ai_tool_file_purge to service_role;

drop policy if exists ai_tool_settings_select on public.ai_tool_settings;
create policy ai_tool_settings_select on public.ai_tool_settings
  for select to authenticated
  using (
    private.is_staff()
    or exists (
      select 1 from public.members m
      where m.user_id = (select auth.uid())
        and m.status in ('invited', 'active')
    )
  );

drop policy if exists ai_tool_flags_select on public.ai_tool_flags;
create policy ai_tool_flags_select on public.ai_tool_flags
  for select to authenticated
  using (
    private.is_staff()
    or exists (
      select 1 from public.members m
      where m.user_id = (select auth.uid())
        and m.status in ('invited', 'active')
    )
  );

drop policy if exists ai_tool_jobs_select_own on public.ai_tool_jobs;
create policy ai_tool_jobs_select_own on public.ai_tool_jobs
  for select to authenticated
  using (member_id = (select auth.uid()));

drop policy if exists ai_tool_jobs_select_staff on public.ai_tool_jobs;
create policy ai_tool_jobs_select_staff on public.ai_tool_jobs
  for select to authenticated
  using (private.is_staff());

drop policy if exists ai_tool_outputs_select_own on public.ai_tool_outputs;
create policy ai_tool_outputs_select_own on public.ai_tool_outputs
  for select to authenticated
  using (member_id = (select auth.uid()));

drop policy if exists ai_tool_outputs_select_staff on public.ai_tool_outputs;
create policy ai_tool_outputs_select_staff on public.ai_tool_outputs
  for select to authenticated
  using (private.is_staff());

drop policy if exists ai_tool_consents_select_own on public.ai_tool_consents;
create policy ai_tool_consents_select_own on public.ai_tool_consents
  for select to authenticated
  using (member_id = (select auth.uid()));

drop policy if exists ai_tool_consents_select_staff on public.ai_tool_consents;
create policy ai_tool_consents_select_staff on public.ai_tool_consents
  for select to authenticated
  using (private.is_staff());

drop policy if exists ai_tool_notes_select_own on public.ai_tool_notes;
create policy ai_tool_notes_select_own on public.ai_tool_notes
  for select to authenticated
  using (member_id = (select auth.uid()));

drop policy if exists ai_tool_notes_select_staff on public.ai_tool_notes;
create policy ai_tool_notes_select_staff on public.ai_tool_notes
  for select to authenticated
  using (private.is_staff());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ai-tool-uploads',
  'ai-tool-uploads',
  false,
  15728640,
  array[
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists ai_tool_uploads_select_own on storage.objects;
create policy ai_tool_uploads_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'ai-tool-uploads'
    and name ~ (
      '^' || (select auth.uid())::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/source\.(pdf|txt|csv|xlsx|docx)$'
    )
  );

drop policy if exists ai_tool_uploads_insert_own on storage.objects;
create policy ai_tool_uploads_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ai-tool-uploads'
    and name ~ (
      '^' || (select auth.uid())::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/source\.(pdf|txt|csv|xlsx|docx)$'
    )
    and exists (
      select 1 from public.members m
      where m.user_id = (select auth.uid())
        and m.status in ('invited', 'active')
    )
  );

drop policy if exists ai_tool_uploads_delete_own on storage.objects;
create policy ai_tool_uploads_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ai-tool-uploads'
    and name ~ (
      '^' || (select auth.uid())::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/source\.(pdf|txt|csv|xlsx|docx)$'
    )
  );

create or replace function public.read_ai_tool_frame()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer;
begin
  if auth.uid() is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not (
    private.is_staff()
    or exists (
      select 1 from public.members m
      where m.user_id = auth.uid()
        and m.status in ('invited', 'active')
    )
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select s.retention_days into v_days
  from public.ai_tool_settings s
  where s.id;

  return jsonb_build_object(
    'retention_days', coalesce(v_days, 30),
    'tools', coalesce((
      select jsonb_agg(
        jsonb_build_object('tool_key', f.tool_key, 'enabled', f.enabled)
        order by f.tool_key
      )
      from public.ai_tool_flags f
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.set_ai_tool_retention(p_days integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_days is null or p_days < 1 or p_days > 3650 then
    raise exception 'bad_days' using errcode = '22023';
  end if;
  update public.ai_tool_settings
  set retention_days = p_days
  where id;
  return jsonb_build_object('ok', true, 'retention_days', p_days);
end;
$$;

create or replace function public.set_ai_tool_flag(p_tool text, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_staff() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_tool not in ('cfo_check', 'market_brief', 'term_sheet_review', 'pricing_sense_check') then
    raise exception 'bad_tool' using errcode = '22023';
  end if;
  if p_enabled is null then
    raise exception 'bad_flag' using errcode = '22023';
  end if;
  update public.ai_tool_flags
  set enabled = p_enabled
  where tool_key = p_tool;
  return jsonb_build_object('ok', true, 'tool_key', p_tool, 'enabled', p_enabled);
end;
$$;

create or replace function public.record_ai_tool_consent(
  p_tool text,
  p_job_id uuid,
  p_copy_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_row public.ai_tool_consents%rowtype;
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_tool not in ('cfo_check', 'market_brief', 'term_sheet_review', 'pricing_sense_check') then
    raise exception 'bad_tool' using errcode = '22023';
  end if;
  if p_job_id is null or p_copy_version is null or char_length(btrim(p_copy_version)) not between 1 and 80 then
    raise exception 'bad_consent' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.members m
    where m.user_id = v_owner
      and m.status in ('invited', 'active')
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  insert into public.ai_tool_consents (member_id, tool_key, copy_version, accepted_at, job_id)
  values (v_owner, p_tool, btrim(p_copy_version), now(), p_job_id)
  on conflict (job_id) do update
    set copy_version = excluded.copy_version,
        accepted_at = now()
    where public.ai_tool_consents.member_id = excluded.member_id
      and public.ai_tool_consents.tool_key = excluded.tool_key
  returning * into v_row;

  if v_row.id is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'job_id', v_row.job_id,
    'tool_key', v_row.tool_key,
    'copy_version', v_row.copy_version,
    'accepted_at', v_row.accepted_at
  );
end;
$$;

create or replace function public.list_own_ai_tool_jobs(p_tool text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_tool is not null and p_tool not in ('cfo_check', 'market_brief', 'term_sheet_review', 'pricing_sense_check') then
    raise exception 'bad_tool' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(rows))
    from (
      select
        j.id,
        j.tool_key,
        j.status,
        j.step,
        j.file_name,
        coalesce(n.title, j.file_name) as title,
        j.created_at
      from public.ai_tool_jobs j
      left join public.ai_tool_notes n
        on n.job_id = j.id
       and n.member_id = j.member_id
      where j.member_id = v_owner
        and (p_tool is null or j.tool_key = p_tool)
      order by j.created_at desc
      limit 20
    ) rows
  ), '[]'::jsonb);
end;
$$;

create or replace function public.delete_own_ai_tool_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_path text;
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select j.storage_path into v_path
  from public.ai_tool_jobs j
  where j.id = p_job_id
    and j.member_id = v_owner;

  if v_path is null or position(v_owner::text || '/' in v_path) <> 1 then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  delete from public.ai_tool_outputs
  where job_id = p_job_id
    and member_id = v_owner;

  delete from public.ai_tool_notes
  where job_id = p_job_id
    and member_id = v_owner;

  delete from public.ai_tool_consents
  where job_id = p_job_id
    and member_id = v_owner;

  delete from public.ai_tool_jobs
  where id = p_job_id
    and member_id = v_owner;

  return jsonb_build_object('ok', true, 'storage_path', v_path);
end;
$$;

revoke all on function public.read_ai_tool_frame() from public, anon;
revoke all on function public.set_ai_tool_retention(integer) from public, anon;
revoke all on function public.set_ai_tool_flag(text, boolean) from public, anon;
revoke all on function public.record_ai_tool_consent(text, uuid, text) from public, anon;
revoke all on function public.list_own_ai_tool_jobs(text) from public, anon;
revoke all on function public.delete_own_ai_tool_job(uuid) from public, anon;

grant execute on function public.read_ai_tool_frame() to authenticated;
grant execute on function public.set_ai_tool_retention(integer) to authenticated;
grant execute on function public.set_ai_tool_flag(text, boolean) to authenticated;
grant execute on function public.record_ai_tool_consent(text, uuid, text) to authenticated;
grant execute on function public.list_own_ai_tool_jobs(text) to authenticated;
grant execute on function public.delete_own_ai_tool_job(uuid) to authenticated;

create or replace function public.retention_sweep_plan(p_apply boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, private
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
    order by c.created_at
    limit 200
  ) due;

  select coalesce(array_agg(id), '{}') into applications
  from (
    select a.id
    from public.applications a
    where a.status in ('rejected', 'declined')
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

  all_ids := unverified || never_submitted || decided;

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
    'ai_tool_retention_days', retention_days
  );
end;
$$;

revoke all on function public.retention_sweep_plan(boolean) from public, anon, authenticated;
grant execute on function public.retention_sweep_plan(boolean) to service_role;

comment on function public.retention_sweep_plan(boolean) is
  'Retention plan. p_apply false lists rows. p_apply true deletes unverified sign-ups at 7 days, confirmed accounts that never submit at 120 days, declined or closed requests and legacy applications at 12 months, anonymises members 24 months after left_at, and purges consent_log at 13 months. It also queues AI tool files older than the retention setting and deletes those jobs, outputs, consents, and notes. candidate_events and candidate_notes go with the candidate. Members and staff are not deleted. Decline does not return a peer invite. Storage files are removed by the retention-sweep Edge function.';

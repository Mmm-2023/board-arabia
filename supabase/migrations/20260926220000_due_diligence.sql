-- Member Due Diligence. Private pitch decks, check jobs, and saved notes.
-- A member reads only their own rows. Staff may select for audit.
-- Apply on project iirqbizwanyhgkhanntq after review. Not applied by the authoring agent.
-- Public sources only. No deal verdict is stored.

create table public.due_diligence_decks (
  id uuid primary key,
  member_id uuid not null references public.members (user_id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  byte_size integer not null,
  company_url text,
  created_at timestamptz not null default now(),
  constraint due_diligence_decks_id_member_key unique (id, member_id),
  constraint due_diligence_decks_path_check check (
    storage_path = member_id::text || '/' || id::text || '/source.pdf'
    or storage_path = member_id::text || '/' || id::text || '/source.pptx'
  ),
  constraint due_diligence_decks_file_name_check check (
    char_length(btrim(file_name)) between 1 and 180
    and file_name !~ '[[:cntrl:]]'
  ),
  constraint due_diligence_decks_mime_check check (
    mime_type in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    )
  ),
  constraint due_diligence_decks_byte_size_check check (
    byte_size > 0 and byte_size <= 15728640
  ),
  constraint due_diligence_decks_company_url_check check (
    company_url is null
    or (
      char_length(company_url) <= 300
      and company_url ~ '^https://'
    )
  )
);

create table public.due_diligence_jobs (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null,
  member_id uuid not null references public.members (user_id) on delete cascade,
  status text not null default 'queued',
  progress integer not null default 5,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint due_diligence_jobs_deck_member_fkey
    foreign key (deck_id, member_id)
    references public.due_diligence_decks (id, member_id)
    on delete cascade,
  constraint due_diligence_jobs_status_check check (
    status in ('queued', 'reading', 'checking', 'writing', 'ready', 'failed')
  ),
  constraint due_diligence_jobs_progress_check check (progress between 0 and 100),
  constraint due_diligence_jobs_error_check check (
    error is null or char_length(error) <= 200
  )
);

create unique index due_diligence_one_active_job
  on public.due_diligence_jobs (member_id)
  where status in ('queued', 'reading', 'checking', 'writing');

create table public.due_diligence_reports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.due_diligence_jobs (id) on delete cascade,
  deck_id uuid not null,
  member_id uuid not null references public.members (user_id) on delete cascade,
  file_name text not null,
  company_label text not null,
  sector_label text not null,
  ask_label text not null,
  disclaimer text not null,
  publicly_consistent_pct integer,
  not_publicly_verifiable_pct integer,
  claims jsonb not null,
  sources jsonb not null,
  next_steps jsonb not null,
  created_at timestamptz not null default now(),
  constraint due_diligence_reports_deck_member_fkey
    foreign key (deck_id, member_id)
    references public.due_diligence_decks (id, member_id)
    on delete cascade,
  constraint due_diligence_reports_file_name_check check (
    char_length(btrim(file_name)) between 1 and 180
  ),
  constraint due_diligence_reports_label_check check (
    char_length(company_label) between 1 and 120
    and char_length(sector_label) between 1 and 80
    and char_length(ask_label) between 1 and 200
    and char_length(disclaimer) between 20 and 400
  ),
  constraint due_diligence_reports_pct_check check (
    (
      publicly_consistent_pct is null
      and not_publicly_verifiable_pct is null
    )
    or (
      publicly_consistent_pct between 0 and 100
      and not_publicly_verifiable_pct between 0 and 100
      and publicly_consistent_pct + not_publicly_verifiable_pct = 100
    )
  ),
  constraint due_diligence_reports_claims_check check (
    jsonb_typeof(claims) = 'array'
    and jsonb_array_length(claims) <= 12
  ),
  constraint due_diligence_reports_sources_check check (
    jsonb_typeof(sources) = 'array'
    and jsonb_array_length(sources) <= 8
  ),
  constraint due_diligence_reports_steps_check check (
    jsonb_typeof(next_steps) = 'array'
    and jsonb_array_length(next_steps) between 1 and 8
  )
);

create index due_diligence_decks_member_created_idx
  on public.due_diligence_decks (member_id, created_at desc);

create index due_diligence_jobs_member_created_idx
  on public.due_diligence_jobs (member_id, created_at desc);

create index due_diligence_reports_member_created_idx
  on public.due_diligence_reports (member_id, created_at desc);

drop trigger if exists due_diligence_jobs_set_updated_at on public.due_diligence_jobs;
create trigger due_diligence_jobs_set_updated_at
  before update on public.due_diligence_jobs
  for each row execute function public.set_updated_at();

alter table public.due_diligence_decks enable row level security;
alter table public.due_diligence_jobs enable row level security;
alter table public.due_diligence_reports enable row level security;
alter table public.due_diligence_decks force row level security;
alter table public.due_diligence_jobs force row level security;
alter table public.due_diligence_reports force row level security;

revoke all on table public.due_diligence_decks from public, anon, authenticated;
revoke all on table public.due_diligence_jobs from public, anon, authenticated;
revoke all on table public.due_diligence_reports from public, anon, authenticated;

grant select on table public.due_diligence_decks to authenticated;
grant select on table public.due_diligence_jobs to authenticated;
grant select on table public.due_diligence_reports to authenticated;
grant all on table public.due_diligence_decks to service_role;
grant all on table public.due_diligence_jobs to service_role;
grant all on table public.due_diligence_reports to service_role;

drop policy if exists due_diligence_decks_select_own on public.due_diligence_decks;
create policy due_diligence_decks_select_own on public.due_diligence_decks
  for select to authenticated
  using (
    member_id = (select auth.uid())
    and exists (
      select 1 from public.members m
      where m.user_id = (select auth.uid())
        and m.status in ('invited', 'active')
    )
  );

drop policy if exists due_diligence_decks_select_staff on public.due_diligence_decks;
create policy due_diligence_decks_select_staff on public.due_diligence_decks
  for select to authenticated
  using (private.is_staff());

drop policy if exists due_diligence_jobs_select_own on public.due_diligence_jobs;
create policy due_diligence_jobs_select_own on public.due_diligence_jobs
  for select to authenticated
  using (
    member_id = (select auth.uid())
    and exists (
      select 1 from public.members m
      where m.user_id = (select auth.uid())
        and m.status in ('invited', 'active')
    )
  );

drop policy if exists due_diligence_jobs_select_staff on public.due_diligence_jobs;
create policy due_diligence_jobs_select_staff on public.due_diligence_jobs
  for select to authenticated
  using (private.is_staff());

drop policy if exists due_diligence_reports_select_own on public.due_diligence_reports;
create policy due_diligence_reports_select_own on public.due_diligence_reports
  for select to authenticated
  using (
    member_id = (select auth.uid())
    and exists (
      select 1 from public.members m
      where m.user_id = (select auth.uid())
        and m.status in ('invited', 'active')
    )
  );

drop policy if exists due_diligence_reports_select_staff on public.due_diligence_reports;
create policy due_diligence_reports_select_staff on public.due_diligence_reports
  for select to authenticated
  using (private.is_staff());

-- Five runs per member per 24 hours. One active job. Service role only.
create table public.due_diligence_run_windows (
  member_id uuid primary key references public.members (user_id) on delete cascade,
  window_start timestamptz not null default now(),
  hit_count integer not null default 0,
  constraint due_diligence_run_windows_hit_count_check check (hit_count >= 0)
);

alter table public.due_diligence_run_windows enable row level security;
alter table public.due_diligence_run_windows force row level security;
revoke all on table public.due_diligence_run_windows from public, anon, authenticated;
grant all on table public.due_diligence_run_windows to service_role;

create or replace function public.due_diligence_consume_run(p_member uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  slot public.due_diligence_run_windows%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.due_diligence_jobs j
    where j.member_id = p_member
      and j.status in ('queued', 'reading', 'checking', 'writing')
  ) then
    raise exception 'in_flight' using errcode = '54000';
  end if;

  insert into public.due_diligence_run_windows (member_id, window_start, hit_count)
  values (p_member, now(), 1)
  on conflict (member_id) do update
    set
      window_start = case
        when due_diligence_run_windows.window_start < now() - interval '24 hours' then now()
        else due_diligence_run_windows.window_start
      end,
      hit_count = case
        when due_diligence_run_windows.window_start < now() - interval '24 hours' then 1
        else due_diligence_run_windows.hit_count + 1
      end
  returning * into slot;

  if slot.hit_count > 5 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
end;
$$;

revoke all on function public.due_diligence_consume_run(uuid) from public, anon, authenticated;
grant execute on function public.due_diligence_consume_run(uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'due-diligence-decks',
  'due-diligence-decks',
  false,
  15728640,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists due_diligence_decks_storage_select_own on storage.objects;
create policy due_diligence_decks_storage_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'due-diligence-decks'
    and name ~ (
      '^' || (select auth.uid())::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/source\.(pdf|pptx)$'
    )
    and exists (
      select 1 from public.members m
      where m.user_id = (select auth.uid())
        and m.status in ('invited', 'active')
    )
  );

drop policy if exists due_diligence_decks_storage_insert_own on storage.objects;
create policy due_diligence_decks_storage_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'due-diligence-decks'
    and name ~ (
      '^' || (select auth.uid())::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/source\.(pdf|pptx)$'
    )
    and exists (
      select 1 from public.members m
      where m.user_id = (select auth.uid())
        and m.status in ('invited', 'active')
    )
  );

drop policy if exists due_diligence_decks_storage_select_staff on storage.objects;
create policy due_diligence_decks_storage_select_staff on storage.objects
  for select to authenticated
  using (
    bucket_id = 'due-diligence-decks'
    and private.is_staff()
  );

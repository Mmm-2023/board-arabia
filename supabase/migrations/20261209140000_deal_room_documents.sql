-- Deal room document vault.
-- Apply this file only, after 20261209120000_application_answers_at_admission.sql.
-- Do not apply it from the app, from CI, or against a live database from this PR.
--
-- Private bucket deal-room-documents. Path shape is {room_id}/{document_id}/source.
-- Members have no storage select. The Edge function is the only member read path.
-- Staff storage select runs only when shared_with_admin_at is set, and that read
-- calls private.note_staff_shared_read.
--
-- Retention waits 30 days after rooms.closed_at. closed_at is set when a room
-- is closed or archived. Decided 6 Oct 2026. This is not 30 days from upload.
-- Change private.deal_room_document_retention_interval to switch that wait.
-- An uploader delete removes the object in the Edge function at once.

alter table public.rooms
  add column if not exists closed_at timestamptz;

comment on column public.rooms.closed_at is
  'Set when the room is closed or archived. Document retention counts 30 days from this time.';

create table if not exists public.room_documents (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  uploaded_by uuid not null references auth.users (id),
  storage_path text not null unique,
  file_name text not null,
  mime text not null,
  size_bytes bigint not null,
  page_count integer not null,
  download_allowed boolean not null default false,
  access_expires_at timestamptz,
  shared_with_admin_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  deleted_at timestamptz,
  constraint room_documents_mime_check check (mime in ('application/pdf', 'image/png', 'image/jpeg')),
  constraint room_documents_size_check check (size_bytes > 0 and size_bytes <= 20971520),
  constraint room_documents_page_check check (page_count >= 1 and page_count <= 40),
  constraint room_documents_name_check check (
    char_length(file_name) between 1 and 180
    and file_name ~ '^[A-Za-z0-9._ ()-]+$'
  ),
  constraint room_documents_path_check check (
    storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/source$'
  )
);

create index if not exists room_documents_room_idx
  on public.room_documents (room_id)
  where deleted_at is null;

create table if not exists public.room_document_member_access (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  document_id uuid references public.room_documents (id) on delete cascade,
  member_id uuid not null references public.members (user_id) on delete cascade,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default pg_catalog.now()
);

create unique index if not exists room_document_member_access_room_uidx
  on public.room_document_member_access (room_id, member_id)
  where document_id is null;

create unique index if not exists room_document_member_access_doc_uidx
  on public.room_document_member_access (document_id, member_id)
  where document_id is not null;

create table if not exists public.room_document_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  document_id uuid not null references public.room_documents (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  actor_id uuid not null references auth.users (id),
  action text not null,
  at timestamptz not null default pg_catalog.now(),
  constraint room_document_events_action_check check (
    action in ('view', 'download', 'upload', 'delete', 'expire', 'revoke')
  )
);

create index if not exists room_document_events_room_idx
  on public.room_document_events (room_id, at desc);

create table if not exists public.room_document_file_purge (
  storage_path text primary key,
  created_at timestamptz not null default pg_catalog.now()
);

alter table public.room_documents enable row level security;
alter table public.room_documents force row level security;
alter table public.room_document_member_access enable row level security;
alter table public.room_document_member_access force row level security;
alter table public.room_document_events enable row level security;
alter table public.room_document_events force row level security;
alter table public.room_document_file_purge enable row level security;
alter table public.room_document_file_purge force row level security;

revoke all on table public.room_documents from public, anon, authenticated, service_role;
revoke all on table public.room_document_member_access from public, anon, authenticated, service_role;
revoke all on table public.room_document_events from public, anon, authenticated, service_role;
revoke all on table public.room_document_file_purge from public, anon, authenticated, service_role;

grant select on table public.room_documents to authenticated;
grant select on table public.room_document_events to authenticated;
grant select, insert, update, delete on table public.room_documents to service_role;
grant select, insert, update, delete on table public.room_document_member_access to service_role;
grant select, insert, update, delete on table public.room_document_events to service_role;
grant select, insert, update, delete on table public.room_document_file_purge to service_role;

create or replace function private.deal_room_document_retention_interval()
returns interval
language sql
immutable
security invoker
set search_path = ''
as $$
  select interval '30 days';
$$;

revoke all on function private.deal_room_document_retention_interval() from public, anon, authenticated;

create or replace function private.room_document_same_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_room uuid;
begin
  if new.document_id is null then
    return new;
  end if;
  select d.room_id into found_room
  from public.room_documents d
  where d.id = new.document_id;
  if found_room is null or found_room is distinct from new.room_id then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return new;
end;
$$;

revoke all on function private.room_document_same_room() from public, anon, authenticated;

drop trigger if exists room_document_member_access_same_room on public.room_document_member_access;
create trigger room_document_member_access_same_room
  before insert or update on public.room_document_member_access
  for each row execute function private.room_document_same_room();

create or replace function private.room_document_blocked(p_document_id uuid, p_room_id uuid, p_actor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_document_member_access a
    where a.room_id = p_room_id
      and a.member_id = p_actor
      and (a.document_id is null or a.document_id = p_document_id)
      and (
        a.revoked_at is not null
        or (a.expires_at is not null and a.expires_at <= pg_catalog.now())
      )
  );
$$;

revoke all on function private.room_document_blocked(uuid, uuid, uuid) from public, anon, authenticated;

-- hidden: no metadata. expired: accepted, but view and download stop. open: may view.
create or replace function private.room_document_hold(p_document_id uuid, p_actor uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  doc public.room_documents%rowtype;
  room_status text;
  invite text;
begin
  if p_actor is null or p_document_id is null then
    return 'hidden';
  end if;
  select * into doc
  from public.room_documents d
  where d.id = p_document_id
    and d.deleted_at is null;
  if not found then
    return 'hidden';
  end if;
  select r.status into room_status from public.rooms r where r.id = doc.room_id;
  select p.invite_status into invite
  from public.room_participants p
  where p.room_id = doc.room_id
    and p.member_id = p_actor;
  if invite is distinct from 'accepted' then
    return 'hidden';
  end if;
  if room_status is distinct from 'open' then
    return 'expired';
  end if;
  if doc.access_expires_at is not null and doc.access_expires_at <= pg_catalog.now() then
    return 'expired';
  end if;
  if private.room_document_blocked(doc.id, doc.room_id, p_actor) then
    return 'expired';
  end if;
  return 'open';
end;
$$;

revoke all on function private.room_document_hold(uuid, uuid) from public, anon, authenticated;

create or replace function private.room_document_readable(p_document_id uuid, p_actor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.room_document_hold(p_document_id, p_actor) = 'open';
$$;

revoke all on function private.room_document_readable(uuid, uuid) from public, anon;
grant execute on function private.room_document_readable(uuid, uuid) to authenticated;

create or replace function private.actor_owns_room(p_room_id uuid, p_actor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_participants p
    where p.room_id = p_room_id
      and p.member_id = p_actor
      and p.role = 'owner'
      and p.invite_status = 'accepted'
  );
$$;

revoke all on function private.actor_owns_room(uuid, uuid) from public, anon;
grant execute on function private.actor_owns_room(uuid, uuid) to authenticated;

create or replace function private.room_document_staff_may_read_path(p_name text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_id uuid;
begin
  if not private.is_staff() then
    return false;
  end if;
  select d.id into found_id
  from public.room_documents d
  where d.storage_path = p_name
    and d.shared_with_admin_at is not null
    and d.deleted_at is null
  limit 1;
  if found_id is null then
    return false;
  end if;
  perform private.note_staff_shared_read('room_documents', found_id);
  return true;
end;
$$;

revoke all on function private.room_document_staff_may_read_path(text) from public, anon;
grant execute on function private.room_document_staff_may_read_path(text) to authenticated;

create or replace function private.revoke_room_document_access(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.room_document_member_access
  set revoked_at = pg_catalog.now()
  where room_id = p_room_id
    and revoked_at is null;

  insert into public.room_document_member_access (room_id, document_id, member_id, revoked_at)
  select p.room_id, null, p.member_id, pg_catalog.now()
  from public.room_participants p
  where p.room_id = p_room_id
    and not exists (
      select 1
      from public.room_document_member_access a
      where a.room_id = p.room_id
        and a.document_id is null
        and a.member_id = p.member_id
    );
end;
$$;

revoke all on function private.revoke_room_document_access(uuid) from public, anon, authenticated;

create or replace function private.rooms_stamp_closed_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('closed', 'archived') and new.closed_at is null then
    new.closed_at := pg_catalog.now();
  end if;
  return new;
end;
$$;

revoke all on function private.rooms_stamp_closed_at() from public, anon, authenticated;

drop trigger if exists rooms_stamp_closed_at on public.rooms;
create trigger rooms_stamp_closed_at
  before update of status on public.rooms
  for each row execute function private.rooms_stamp_closed_at();

create or replace function private.rooms_revoke_documents_on_close()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('closed', 'archived') and old.status is distinct from new.status then
    perform private.revoke_room_document_access(new.id);
  end if;
  return null;
end;
$$;

revoke all on function private.rooms_revoke_documents_on_close() from public, anon, authenticated;

drop trigger if exists rooms_revoke_documents_on_close on public.rooms;
create trigger rooms_revoke_documents_on_close
  after update of status on public.rooms
  for each row execute function private.rooms_revoke_documents_on_close();

drop policy if exists room_documents_select_participant on public.room_documents;
create policy room_documents_select_participant
  on public.room_documents
  for select
  to authenticated
  using (private.room_document_readable(id, (select auth.uid())));

drop policy if exists room_document_events_select_owner on public.room_document_events;
create policy room_document_events_select_owner
  on public.room_document_events
  for select
  to authenticated
  using (private.actor_owns_room(room_id, (select auth.uid())));

-- No insert, update, or delete policy. Clients cannot write events.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'deal-room-documents',
  'deal-room-documents',
  false,
  20971520,
  array['application/pdf', 'image/png', 'image/jpeg']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage upsert, replace, and delete read the object row before they write it.
-- This select policy is that read. Staff pass it only when the uploader shared
-- the file. Members have no select, insert, update, or delete policy, so they
-- cannot list, upsert, or delete the bucket. The Edge function writes with
-- the service role.
drop policy if exists deal_room_documents_storage_select_member on storage.objects;
drop policy if exists deal_room_documents_storage_select_shared_staff on storage.objects;
create policy deal_room_documents_storage_select_shared_staff
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'deal-room-documents'
    and private.room_document_staff_may_read_path(name)
  );

create or replace function private.room_document_actor_accepted(p_room_id uuid, p_actor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_participants p
    join public.rooms r on r.id = p.room_id
    where p.room_id = p_room_id
      and p.member_id = p_actor
      and p.invite_status = 'accepted'
      and r.status = 'open'
  );
$$;

revoke all on function private.room_document_actor_accepted(uuid, uuid) from public, anon, authenticated;

create or replace function public.list_room_documents(p_actor uuid, p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  accepted boolean;
  owner boolean;
begin
  perform private.assert_service_role();
  if p_actor is null or p_room_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select exists (
    select 1
    from public.room_participants p
    where p.room_id = p_room_id
      and p.member_id = p_actor
      and p.invite_status = 'accepted'
  ) into accepted;
  if not accepted then
    raise exception 'not_participant' using errcode = '42501';
  end if;
  owner := private.actor_owns_room(p_room_id, p_actor);
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'documents', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', d.id,
        'file_name', d.file_name,
        'mime', d.mime,
        'size_bytes', d.size_bytes,
        'page_count', d.page_count,
        'download_allowed', d.download_allowed,
        'access_expires_at', d.access_expires_at,
        'shared_with_admin', d.shared_with_admin_at is not null,
        'uploaded_by_me', d.uploaded_by = p_actor,
        'expired', private.room_document_hold(d.id, p_actor) = 'expired',
        'created_at', d.created_at
      ) order by d.created_at desc)
      from public.room_documents d
      where d.room_id = p_room_id
        and d.deleted_at is null
        and private.room_document_hold(d.id, p_actor) in ('open', 'expired')
    ), '[]'::jsonb),
    'events', case when owner then coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', e.id,
        'document_id', e.document_id,
        'file_name', d.file_name,
        'member_name', coalesce(nullif(pg_catalog.btrim(pr.full_name), ''), 'Member'),
        'action', e.action,
        'at', e.at
      ) order by e.at desc)
      from public.room_document_events e
      join public.room_documents d on d.id = e.document_id
      left join public.profiles pr on pr.user_id = e.actor_id
      where e.room_id = p_room_id
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

revoke all on function public.list_room_documents(uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_room_documents(uuid, uuid) to service_role;

create or replace function public.room_document_open_for(p_actor uuid, p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.room_documents%rowtype;
  hold text;
begin
  perform private.assert_service_role();
  if p_actor is null or p_document_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into doc
  from public.room_documents d
  where d.id = p_document_id
    and d.deleted_at is null;
  if not found then
    return pg_catalog.jsonb_build_object('ok', true, 'hold', 'hidden');
  end if;
  hold := private.room_document_hold(doc.id, p_actor);
  if hold = 'hidden' then
    return pg_catalog.jsonb_build_object('ok', true, 'hold', 'hidden');
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'hold', hold,
    'room_id', doc.room_id,
    'storage_path', doc.storage_path,
    'file_name', doc.file_name,
    'mime', doc.mime,
    'download_allowed', doc.download_allowed,
    'uploaded_by', doc.uploaded_by
  );
end;
$$;

revoke all on function public.room_document_open_for(uuid, uuid) from public, anon, authenticated;
grant execute on function public.room_document_open_for(uuid, uuid) to service_role;

create or replace function public.room_document_viewer_identity(p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_name text;
  found_email text;
begin
  perform private.assert_service_role();
  if p_actor is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select m.email, pr.full_name
    into found_email, found_name
  from public.members m
  left join public.profiles pr on pr.user_id = m.user_id
  where m.user_id = p_actor;
  if found_email is null or pg_catalog.btrim(found_email) = '' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return pg_catalog.jsonb_build_object(
    'full_name', coalesce(nullif(pg_catalog.btrim(found_name), ''), 'Member'),
    'email', pg_catalog.btrim(found_email)
  );
end;
$$;

revoke all on function public.room_document_viewer_identity(uuid) from public, anon, authenticated;
grant execute on function public.room_document_viewer_identity(uuid) to service_role;

create or replace function public.insert_room_document(
  p_actor uuid,
  p_room_id uuid,
  p_file_name text,
  p_mime text,
  p_size_bytes bigint,
  p_page_count integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  new_path text;
  clean_name text;
begin
  perform private.assert_service_role();
  if p_actor is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not private.room_document_actor_accepted(p_room_id, p_actor) then
    raise exception 'not_participant' using errcode = '42501';
  end if;
  if p_mime is null or p_mime not in ('application/pdf', 'image/png', 'image/jpeg') then
    raise exception 'invalid_file' using errcode = '22023';
  end if;
  if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 20971520 then
    raise exception 'too_large' using errcode = '22023';
  end if;
  if p_page_count is null or p_page_count < 1 or p_page_count > 40 then
    raise exception 'too_many_pages' using errcode = '22023';
  end if;
  clean_name := pg_catalog.btrim(coalesce(p_file_name, ''));
  if clean_name !~ '^[A-Za-z0-9._ ()-]{1,180}$' then
    raise exception 'invalid_file' using errcode = '22023';
  end if;
  new_id := pg_catalog.gen_random_uuid();
  new_path := p_room_id::text || '/' || new_id::text || '/source';
  insert into public.room_documents (
    id, room_id, uploaded_by, storage_path, file_name, mime, size_bytes, page_count
  ) values (
    new_id, p_room_id, p_actor, new_path, clean_name, p_mime, p_size_bytes, p_page_count
  );
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'id', new_id,
    'storage_path', new_path,
    'file_name', clean_name
  );
end;
$$;

revoke all on function public.insert_room_document(uuid, uuid, text, text, bigint, integer) from public, anon, authenticated;
grant execute on function public.insert_room_document(uuid, uuid, text, text, bigint, integer) to service_role;

create or replace function public.record_room_document_event(
  p_actor uuid,
  p_document_id uuid,
  p_action text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.room_documents%rowtype;
  hold text;
begin
  perform private.assert_service_role();
  if p_action is null or p_action not in ('view', 'download', 'upload', 'delete', 'expire', 'revoke') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  select * into doc from public.room_documents where id = p_document_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_action in ('view', 'download') then
    hold := private.room_document_hold(doc.id, p_actor);
    if hold is distinct from 'open' then
      raise exception 'not_participant' using errcode = '42501';
    end if;
    if p_action = 'download' and doc.download_allowed is distinct from true then
      raise exception 'download_off' using errcode = '42501';
    end if;
  end if;
  insert into public.room_document_events (document_id, room_id, actor_id, action)
  values (doc.id, doc.room_id, p_actor, p_action);
end;
$$;

revoke all on function public.record_room_document_event(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_room_document_event(uuid, uuid, text) to service_role;

create or replace function public.set_room_document_expiry(
  p_actor uuid,
  p_room_id uuid,
  p_document_id uuid,
  p_member_id uuid,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_service_role();
  if not private.actor_owns_room(p_room_id, p_actor) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if p_member_id is null then
    if p_document_id is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    update public.room_documents
    set access_expires_at = p_expires_at
    where id = p_document_id
      and room_id = p_room_id
      and deleted_at is null;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    return pg_catalog.jsonb_build_object('ok', true);
  end if;
  if not exists (
    select 1 from public.room_participants p
    where p.room_id = p_room_id and p.member_id = p_member_id
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_document_id is null then
    update public.room_document_member_access
    set expires_at = p_expires_at,
        revoked_at = case when p_expires_at is null then revoked_at else null end
    where room_id = p_room_id
      and member_id = p_member_id
      and document_id is null;
    if not found then
      insert into public.room_document_member_access (room_id, document_id, member_id, expires_at)
      values (p_room_id, null, p_member_id, p_expires_at);
    end if;
  else
    update public.room_document_member_access
    set expires_at = p_expires_at,
        revoked_at = case when p_expires_at is null then revoked_at else null end
    where document_id = p_document_id
      and member_id = p_member_id;
    if not found then
      insert into public.room_document_member_access (room_id, document_id, member_id, expires_at)
      values (p_room_id, p_document_id, p_member_id, p_expires_at);
    end if;
  end if;
  return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.set_room_document_expiry(uuid, uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.set_room_document_expiry(uuid, uuid, uuid, uuid, timestamptz) to service_role;

create or replace function public.set_room_document_download(
  p_actor uuid,
  p_document_id uuid,
  p_allowed boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.room_documents%rowtype;
begin
  perform private.assert_service_role();
  if p_allowed is null then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  select * into doc
  from public.room_documents
  where id = p_document_id
    and deleted_at is null;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not private.actor_owns_room(doc.room_id, p_actor) and doc.uploaded_by is distinct from p_actor then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.room_documents
  set download_allowed = p_allowed
  where id = doc.id;
  return pg_catalog.jsonb_build_object('ok', true, 'download_allowed', p_allowed);
end;
$$;

revoke all on function public.set_room_document_download(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_room_document_download(uuid, uuid, boolean) to service_role;

create or replace function public.revoke_room_document_member(
  p_actor uuid,
  p_room_id uuid,
  p_member_id uuid,
  p_document_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_service_role();
  if not private.actor_owns_room(p_room_id, p_actor) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if p_member_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_document_id is null then
    update public.room_document_member_access
    set revoked_at = pg_catalog.now()
    where room_id = p_room_id
      and member_id = p_member_id
      and document_id is null;
    if not found then
      insert into public.room_document_member_access (room_id, document_id, member_id, revoked_at)
      values (p_room_id, null, p_member_id, pg_catalog.now());
    end if;
  else
    update public.room_document_member_access
    set revoked_at = pg_catalog.now()
    where room_id = p_room_id
      and document_id = p_document_id
      and member_id = p_member_id;
    if not found then
      insert into public.room_document_member_access (room_id, document_id, member_id, revoked_at)
      values (p_room_id, p_document_id, p_member_id, pg_catalog.now());
    end if;
  end if;
  return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.revoke_room_document_member(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.revoke_room_document_member(uuid, uuid, uuid, uuid) to service_role;

create or replace function public.delete_room_document(
  p_actor uuid,
  p_document_id uuid,
  p_queue boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.room_documents%rowtype;
begin
  perform private.assert_service_role();
  select * into doc from public.room_documents where id = p_document_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if doc.deleted_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not private.actor_owns_room(doc.room_id, p_actor) and doc.uploaded_by is distinct from p_actor then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_queue then
    insert into public.room_document_file_purge (storage_path)
    values (doc.storage_path)
    on conflict (storage_path) do nothing;
  end if;
  delete from public.room_documents where id = doc.id;
  return pg_catalog.jsonb_build_object('ok', true, 'storage_path', doc.storage_path);
end;
$$;

revoke all on function public.delete_room_document(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.delete_room_document(uuid, uuid, boolean) to service_role;

create or replace function public.ack_room_document_purge(p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_service_role();
  delete from public.room_document_file_purge where storage_path = p_path;
end;
$$;

revoke all on function public.ack_room_document_purge(text) from public, anon, authenticated;
grant execute on function public.ack_room_document_purge(text) to service_role;

create or replace function public.share_room_document_with_admin(p_actor uuid, p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  doc public.room_documents%rowtype;
begin
  perform private.assert_service_role();
  select * into doc
  from public.room_documents
  where id = p_document_id
    and deleted_at is null;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if doc.uploaded_by is distinct from p_actor then
    raise exception 'not_uploader' using errcode = '42501';
  end if;
  update public.room_documents
  set shared_with_admin_at = coalesce(shared_with_admin_at, pg_catalog.now())
  where id = doc.id;
  return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.share_room_document_with_admin(uuid, uuid) from public, anon, authenticated;
grant execute on function public.share_room_document_with_admin(uuid, uuid) to service_role;

create or replace function public.deal_room_document_retention(p_apply boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  due_ids uuid[];
  due_paths text[];
  queued text[];
  paths text[];
begin
  perform private.assert_service_role();
  select coalesce(pg_catalog.array_agg(due.id), '{}'::uuid[]),
         coalesce(pg_catalog.array_agg(due.storage_path), '{}'::text[])
    into due_ids, due_paths
  from (
    select d.id, d.storage_path
    from public.room_documents d
    join public.rooms r on r.id = d.room_id
    where r.status in ('closed', 'archived')
      and r.closed_at is not null
      and r.closed_at < pg_catalog.now() - private.deal_room_document_retention_interval()
    order by r.closed_at
    limit 500
  ) due;

  select coalesce(pg_catalog.array_agg(q.storage_path), '{}'::text[]) into queued
  from (
    select storage_path
    from public.room_document_file_purge
    order by created_at
    limit 500
  ) q;

  select coalesce(pg_catalog.array_agg(distinct path), '{}'::text[]) into paths
  from (
    select pg_catalog.unnest(coalesce(due_paths, '{}'::text[]) || coalesce(queued, '{}'::text[])) as path
  ) listed
  where path is not null and path <> '';

  if p_apply then
    insert into public.room_document_file_purge (storage_path)
    select distinct path
    from pg_catalog.unnest(coalesce(due_paths, '{}'::text[])) as path
    where path is not null and path <> ''
    on conflict (storage_path) do nothing;

    delete from public.room_documents
    where id = any (coalesce(due_ids, '{}'::uuid[]));
  end if;

  return pg_catalog.jsonb_build_object(
    'document_ids', pg_catalog.to_jsonb(due_ids),
    'storage_paths', pg_catalog.to_jsonb(paths)
  );
end;
$$;

revoke all on function public.deal_room_document_retention(boolean) from public, anon, authenticated;
grant execute on function public.deal_room_document_retention(boolean) to service_role;

comment on function public.deal_room_document_retention(boolean) is
  'Lists deal room files whose room closed_at is older than 30 days. p_apply true deletes those rows and keeps the storage paths for the retention-sweep Edge function. Open rooms are not listed.';

-- Close and archive set closed_at. The trigger also stamps and revokes if a later path forgets.
create or replace function public.manage_member_deal_room(
  p_actor uuid,
  p_room_id uuid,
  p_action text,
  p_name text,
  p_purpose text,
  p_member_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_room public.rooms%rowtype;
  existing public.room_participants%rowtype;
  room_name text;
  room_purpose text;
begin
  perform private.assert_service_role();
  perform private.active_member(p_actor);
  if p_action = 'add' then
    return private.place_deal_invite(p_actor, p_room_id, p_member_id);
  end if;

  found_room := private.require_member_room(p_room_id, p_actor);

  if p_action = 'rename' then
    if found_room.status = 'archived' then
      raise exception 'room_archived' using errcode = '23514';
    end if;
    room_name := private.clean_room_line(p_name);
    if room_name is null or char_length(room_name) < 1 or char_length(room_name) > 160 then
      raise exception 'invalid_name' using errcode = '22023';
    end if;
    if p_purpose is null then
      room_purpose := found_room.purpose;
    else
      room_purpose := private.clean_room_line(p_purpose);
      if room_purpose is null or char_length(room_purpose) < 1 or char_length(room_purpose) > 400 then
        raise exception 'invalid_purpose' using errcode = '22023';
      end if;
    end if;
    update public.rooms
    set name = room_name,
        purpose = room_purpose,
        summary = room_purpose
    where id = found_room.id;
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'room_id', found_room.id,
      'name', room_name,
      'purpose', room_purpose
    );
  end if;

  if p_action = 'remove' then
    if found_room.status = 'archived' then
      raise exception 'room_archived' using errcode = '23514';
    end if;
    if p_member_id is not distinct from p_actor then
      raise exception 'cannot_remove_owner' using errcode = '22023';
    end if;
    select * into existing
    from public.room_participants
    where room_id = p_room_id
      and member_id = p_member_id;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if existing.role = 'owner' then
      raise exception 'cannot_remove_owner' using errcode = '22023';
    end if;
    if existing.invite_status = 'removed' then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    update public.room_participants
    set invite_status = 'removed',
        removed_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    where id = existing.id;
    perform private.sync_deal_room_count(p_room_id);
    return pg_catalog.jsonb_build_object('ok', true, 'room_id', p_room_id, 'invite_status', 'removed');
  end if;

  if p_action = 'close' then
    if found_room.status is distinct from 'open' then
      raise exception 'not_open' using errcode = '23514';
    end if;
    update public.rooms
    set status = 'closed',
        closed_at = coalesce(closed_at, pg_catalog.now())
    where id = found_room.id
      and status = 'open';
    perform private.revoke_room_document_access(found_room.id);
    return pg_catalog.jsonb_build_object('ok', true, 'room_id', found_room.id, 'status', 'closed');
  end if;

  if p_action = 'archive' then
    if found_room.status = 'archived' then
      raise exception 'room_archived' using errcode = '23514';
    end if;
    update public.rooms
    set status = 'archived',
        closed_at = coalesce(closed_at, pg_catalog.now())
    where id = found_room.id
      and status in ('open', 'closed');
    perform private.revoke_room_document_access(found_room.id);
    return pg_catalog.jsonb_build_object('ok', true, 'room_id', found_room.id, 'status', 'archived');
  end if;

  raise exception 'invalid_action' using errcode = '22023';
end;
$$;

revoke all on function public.manage_member_deal_room(uuid, uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.manage_member_deal_room(uuid, uuid, text, text, text, uuid) to service_role;

create or replace function public.close_any_deal_room(p_actor uuid, p_aal text, p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_room public.rooms%rowtype;
begin
  perform private.assert_service_role();
  if p_actor is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce(p_aal, '') is distinct from 'aal2' then
    raise exception 'mfa_required' using errcode = '42501';
  end if;
  if not private.actor_is_staff(p_actor) then
    raise exception 'not_staff' using errcode = '42501';
  end if;

  select * into found_room from public.rooms where id = p_room_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if found_room.status is distinct from 'open' then
    raise exception 'not_open' using errcode = '23514';
  end if;

  update public.rooms
  set status = 'closed',
      closed_at = coalesce(closed_at, pg_catalog.now())
  where id = found_room.id
    and status = 'open';

  perform private.revoke_room_document_access(found_room.id);

  return pg_catalog.jsonb_build_object('ok', true, 'room_id', found_room.id, 'status', 'closed');
end;
$$;

revoke all on function public.close_any_deal_room(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.close_any_deal_room(uuid, text, uuid) to service_role;

create or replace function public.list_all_deal_rooms(p_actor uuid, p_aal text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_service_role();
  if p_actor is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce(p_aal, '') is distinct from 'aal2' then
    raise exception 'mfa_required' using errcode = '42501';
  end if;
  if not private.actor_is_staff(p_actor) then
    raise exception 'not_staff' using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'rooms', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', r.id,
          'opened_by', r.opened_by,
          'status', r.status,
          'name', r.name,
          'purpose', r.purpose,
          'owner_member_id', r.owner_member_id,
          'mandate_id', r.mandate_id,
          're_opportunity_id', r.re_opportunity_id,
          'created_at', r.created_at,
          'document_count', (
            select count(*)::integer
            from public.room_documents d
            where d.room_id = r.id
              and d.deleted_at is null
          ),
          'participants', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'member_id', p.member_id,
                'role', p.role,
                'invite_status', p.invite_status
              )
              order by p.created_at
            )
            from public.room_participants p
            where p.room_id = r.id
          ), '[]'::jsonb)
        )
        order by r.created_at desc, r.name
      )
      from public.rooms r
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.list_all_deal_rooms(uuid, text) from public, anon, authenticated;
grant execute on function public.list_all_deal_rooms(uuid, text) to service_role;

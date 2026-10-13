import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationPath = path.join(root, 'supabase/migrations/20261209140000_deal_room_documents.sql')

const OWNER = '11111111-1111-4111-8111-111111111111'
const MEMBER = '22222222-2222-4222-8222-222222222222'
const INVITED = '33333333-3333-4333-8333-333333333333'
const DECLINED = '44444444-4444-4444-8444-444444444444'
const REMOVED = '55555555-5555-4555-8555-555555555555'
const STAFF = '66666666-6666-4666-8666-666666666666'
const OUTSIDER = '77777777-7777-4777-8777-777777777777'
const ROOM = '88888888-8888-4888-8888-888888888888'
const OLD_ROOM = '99999999-9999-4999-8999-999999999999'
const DOC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const EXPIRED = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const MEMBER_EXPIRED = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const REVOKED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const OLD_DOC = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const OPEN_PATH = `${ROOM}/${DOC}/source`
const OLD_PATH = `${OLD_ROOM}/${OLD_DOC}/source`

test('deal room document policies, expiry, staff share, and retention', () => {
  const migration = readFileSync(migrationPath, 'utf8')
  assert.match(migration, /room_document_events/)
  assert.equal(migration.includes('\u2014'), false)

  const dir = mkdtempSync(path.join(tmpdir(), 'ba-docs-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_docs_${process.pid}`
  writeFileSync(script, `${fixtureSql}\n\\i ${migrationPath}\n${assertSql}\n`)
  try {
    execFileSync('dropdb', ['--if-exists', db], { stdio: 'ignore' })
    execFileSync('createdb', [db], { stdio: 'ignore' })
    try {
      execFileSync('psql', ['-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-f', script], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      const failed = error as { stdout?: Buffer; stderr?: Buffer; message?: string }
      throw new Error(`${failed.stdout?.toString() ?? ''}\n${failed.stderr?.toString() ?? ''}\n${failed.message ?? ''}`)
    }
  } finally {
    execFileSync('dropdb', ['--if-exists', db], { stdio: 'ignore' })
    rmSync(dir, { recursive: true, force: true })
  }
})

const fixtureSql = `
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end
$roles$;

create schema if not exists auth;
create schema if not exists private;
create schema if not exists storage;
grant usage on schema public, private, auth, storage to anon, authenticated, service_role;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
$$;

grant execute on all functions in schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text
);

create table public.members (
  user_id uuid primary key references auth.users (id),
  status text,
  seat text,
  email text
);

create table public.profiles (
  user_id uuid primary key,
  full_name text
);

create table public.staff_users (
  user_id uuid primary key,
  role text not null,
  email text
);

create table public.rooms (
  id uuid primary key,
  opened_by text,
  status text,
  name text,
  purpose text,
  summary text,
  owner_member_id uuid,
  mandate_id uuid,
  re_opportunity_id uuid,
  created_at timestamptz
);

create table public.room_participants (
  id uuid primary key,
  room_id uuid,
  member_id uuid,
  role text,
  invite_status text,
  created_at timestamptz
);

create table storage.buckets (
  id text primary key,
  name text,
  public boolean,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key,
  bucket_id text,
  name text
);

alter table storage.objects enable row level security;
alter table storage.objects force row level security;
grant select on storage.objects to authenticated;

create table public.staff_read_probe (
  id integer generated always as identity primary key,
  table_name text,
  row_id uuid
);
grant select on public.staff_read_probe to authenticated;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_users s
    where s.user_id = auth.uid()
      and s.role in ('staff', 'master')
  )
  and (auth.jwt() ->> 'aal') = 'aal2';
$$;

grant execute on function private.is_staff() to authenticated, service_role;

create or replace function private.actor_is_staff(p_actor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_users s
    where s.user_id = p_actor
      and s.role in ('staff', 'master')
  );
$$;

create or replace function private.assert_service_role()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.note_staff_shared_read(p_table text, p_row_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.staff_read_probe (table_name, row_id) values (p_table, p_row_id);
end;
$$;

insert into auth.users (id, email) values
  ('${OWNER}', 'owner@example.com'),
  ('${MEMBER}', 'member@example.com'),
  ('${INVITED}', 'invited@example.com'),
  ('${DECLINED}', 'declined@example.com'),
  ('${REMOVED}', 'removed@example.com'),
  ('${STAFF}', 'staff@example.com'),
  ('${OUTSIDER}', 'outsider@example.com');

insert into public.members (user_id, status, seat, email) values
  ('${OWNER}', 'active', 'ksa', 'owner@example.com'),
  ('${MEMBER}', 'active', 'ksa', 'member@example.com'),
  ('${INVITED}', 'active', 'ksa', 'invited@example.com'),
  ('${DECLINED}', 'active', 'ksa', 'declined@example.com'),
  ('${REMOVED}', 'active', 'ksa', 'removed@example.com'),
  ('${OUTSIDER}', 'active', 'intl', 'outsider@example.com');

insert into public.profiles (user_id, full_name) values
  ('${OWNER}', 'Example Owner'),
  ('${MEMBER}', 'Example Member');

insert into public.staff_users (user_id, role, email) values
  ('${STAFF}', 'staff', 'staff@example.com');

insert into public.rooms (id, opened_by, status, name, purpose, summary, owner_member_id, created_at) values
  ('${ROOM}', 'member', 'open', 'Example room', 'A purpose', 'A purpose', '${OWNER}', now()),
  ('${OLD_ROOM}', 'member', 'closed', 'Old room', 'A purpose', 'A purpose', '${OWNER}', now() - interval '40 days');

insert into public.room_participants (id, room_id, member_id, role, invite_status, created_at) values
  ('10000000-0000-4000-8000-000000000001', '${ROOM}', '${OWNER}', 'owner', 'accepted', now()),
  ('10000000-0000-4000-8000-000000000002', '${ROOM}', '${MEMBER}', 'member', 'accepted', now()),
  ('10000000-0000-4000-8000-000000000003', '${ROOM}', '${INVITED}', 'member', 'invited', now()),
  ('10000000-0000-4000-8000-000000000004', '${ROOM}', '${DECLINED}', 'member', 'declined', now()),
  ('10000000-0000-4000-8000-000000000005', '${ROOM}', '${REMOVED}', 'member', 'removed', now()),
  ('10000000-0000-4000-8000-000000000006', '${OLD_ROOM}', '${OWNER}', 'owner', 'accepted', now());
`

const assertSql = `
alter table public.rooms
  alter column closed_at drop not null;

update public.rooms
set closed_at = now() - interval '31 days'
where id = '${OLD_ROOM}';

insert into public.room_documents (
  id, room_id, uploaded_by, storage_path, file_name, mime, size_bytes, page_count
) values
  ('${DOC}', '${ROOM}', '${OWNER}', '${OPEN_PATH}', 'Board pack.pdf', 'application/pdf', 1200, 2),
  ('${EXPIRED}', '${ROOM}', '${OWNER}', '${ROOM}/${EXPIRED}/source', 'Expired pack.pdf', 'application/pdf', 1200, 1),
  ('${MEMBER_EXPIRED}', '${ROOM}', '${OWNER}', '${ROOM}/${MEMBER_EXPIRED}/source', 'Member pack.pdf', 'application/pdf', 1200, 1),
  ('${REVOKED}', '${ROOM}', '${OWNER}', '${ROOM}/${REVOKED}/source', 'Revoked pack.pdf', 'application/pdf', 1200, 1),
  ('${OLD_DOC}', '${OLD_ROOM}', '${OWNER}', '${OLD_PATH}', 'Old pack.pdf', 'application/pdf', 900, 1);

update public.room_documents
set access_expires_at = now() - interval '1 hour'
where id = '${EXPIRED}';

insert into public.room_document_member_access (room_id, document_id, member_id, expires_at) values
  ('${ROOM}', '${MEMBER_EXPIRED}', '${MEMBER}', now() - interval '1 hour');

insert into public.room_document_member_access (room_id, document_id, member_id, revoked_at) values
  ('${ROOM}', '${REVOKED}', '${MEMBER}', now());

insert into public.room_document_events (document_id, room_id, actor_id, action) values
  ('${DOC}', '${ROOM}', '${MEMBER}', 'view');

insert into storage.objects (id, bucket_id, name) values
  ('12121212-1212-4121-8121-121212121212', 'deal-room-documents', '${OPEN_PATH}');

create or replace function pg_temp.fail(p_label text) returns void language plpgsql as $$
begin
  raise exception '%', p_label;
end;
$$;

create or replace function pg_temp.assume(p_sub text, p_aal text, p_role text) returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_sub, 'aal', p_aal, 'role', p_role)::text,
    false
  );
  execute format('set role %I', p_role);
end;
$$;

create or replace function pg_temp.service() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, false);
end;
$$;

do $checks$
declare
  n integer;
  probe integer;
  allowed boolean;
  plan jsonb;
  listed jsonb;
  names text;
begin
  select download_allowed into allowed from public.room_documents where id = '${DOC}';
  if allowed is distinct from false then perform pg_temp.fail('download default'); end if;

  perform pg_temp.assume('${MEMBER}', 'aal1', 'authenticated');
  select count(*) into n from public.room_documents;
  if n <> 1 then perform pg_temp.fail('member metadata ' || n::text); end if;
  if not exists (select 1 from public.room_documents where id = '${DOC}') then
    perform pg_temp.fail('member missing open file');
  end if;

  perform pg_temp.assume('${INVITED}', 'aal1', 'authenticated');
  select count(*) into n from public.room_documents;
  if n <> 0 then perform pg_temp.fail('invited metadata'); end if;

  perform pg_temp.assume('${DECLINED}', 'aal1', 'authenticated');
  select count(*) into n from public.room_documents;
  if n <> 0 then perform pg_temp.fail('declined metadata'); end if;

  perform pg_temp.assume('${REMOVED}', 'aal1', 'authenticated');
  select count(*) into n from public.room_documents;
  if n <> 0 then perform pg_temp.fail('removed metadata'); end if;

  perform pg_temp.assume('${OUTSIDER}', 'aal1', 'authenticated');
  select count(*) into n from public.room_documents;
  if n <> 0 then perform pg_temp.fail('outsider metadata'); end if;

  perform pg_temp.assume('${MEMBER}', 'aal1', 'authenticated');
  select count(*) into n from storage.objects where bucket_id = 'deal-room-documents';
  if n <> 0 then perform pg_temp.fail('member storage'); end if;

  begin
    insert into public.room_document_events (document_id, room_id, actor_id, action)
    values ('${DOC}', '${ROOM}', '${MEMBER}', 'view');
    perform pg_temp.fail('client insert event');
  exception when insufficient_privilege or check_violation then
    null;
  end;

  begin
    update public.room_document_events set action = 'download' where document_id = '${DOC}';
    if found then perform pg_temp.fail('client update event'); end if;
  exception when insufficient_privilege then
    null;
  end;

  begin
    delete from public.room_document_events where document_id = '${DOC}';
    if found then perform pg_temp.fail('client delete event'); end if;
  exception when insufficient_privilege then
    null;
  end;

  perform pg_temp.assume('${MEMBER}', 'aal1', 'authenticated');
  select count(*) into n from public.room_document_events;
  if n <> 0 then perform pg_temp.fail('member events visible'); end if;

  perform pg_temp.assume('${OWNER}', 'aal1', 'authenticated');
  select count(*) into n from public.room_document_events;
  if n <> 1 then perform pg_temp.fail('owner events ' || n::text); end if;

  perform pg_temp.assume('${STAFF}', 'aal1', 'authenticated');
  select count(*) into n from public.room_documents;
  if n <> 0 then perform pg_temp.fail('staff aal1 metadata'); end if;
  select count(*) into n from storage.objects where bucket_id = 'deal-room-documents';
  if n <> 0 then perform pg_temp.fail('staff aal1 storage'); end if;
  select count(*) into probe from public.staff_read_probe;
  if probe <> 0 then perform pg_temp.fail('staff aal1 hook'); end if;

  perform pg_temp.assume('${STAFF}', 'aal2', 'authenticated');
  select count(*) into n from public.room_documents;
  if n <> 0 then perform pg_temp.fail('staff aal2 sees rows'); end if;
  select count(*) into n from storage.objects where bucket_id = 'deal-room-documents';
  if n <> 0 then perform pg_temp.fail('staff aal2 unshared storage'); end if;
  select count(*) into probe from public.staff_read_probe;
  if probe <> 0 then perform pg_temp.fail('staff aal2 unshared hook'); end if;

  perform pg_temp.service();
  update public.room_documents set shared_with_admin_at = now() where id = '${DOC}';

  perform pg_temp.assume('${STAFF}', 'aal2', 'authenticated');
  select count(*) into n from storage.objects where bucket_id = 'deal-room-documents';
  if n <> 1 then perform pg_temp.fail('staff shared storage ' || n::text); end if;
  select count(*) into probe from public.staff_read_probe where table_name = 'room_documents' and row_id = '${DOC}';
  if probe < 1 then perform pg_temp.fail('staff shared hook'); end if;
  select count(*) into n from public.room_documents;
  if n <> 0 then perform pg_temp.fail('staff still sees rows'); end if;

  perform pg_temp.service();
  select public.list_all_deal_rooms('${STAFF}', 'aal1') into listed;
  perform pg_temp.fail('staff aal1 counts');
exception when others then
  if sqlerrm not like '%mfa_required%' then
    raise;
  end if;
end;
$checks$;

do $counts$
declare
  listed jsonb;
  plan jsonb;
  n integer;
  closed_at timestamptz;
  names text;
begin
  perform pg_temp.service();
  listed := public.list_all_deal_rooms('${STAFF}', 'aal2');
  if (listed -> 'rooms' -> 0 ->> 'document_count') is null then
    perform pg_temp.fail('missing count');
  end if;
  if listed::text ilike '%Board pack.pdf%' then perform pg_temp.fail('count leaked file name'); end if;
  if listed::text ilike '%@example.com%' then perform pg_temp.fail('count leaked email'); end if;

  plan := public.deal_room_document_retention(false);
  if not (plan -> 'storage_paths') ? '${OLD_PATH}' then perform pg_temp.fail('old path missing'); end if;
  if (plan -> 'storage_paths') ? '${OPEN_PATH}' then perform pg_temp.fail('open path listed'); end if;
  if exists (select 1 from public.room_documents where id = '${OLD_DOC}') is not true then
    perform pg_temp.fail('dry run deleted');
  end if;

  plan := public.deal_room_document_retention(true);
  if exists (select 1 from public.room_documents where id = '${OLD_DOC}') then
    perform pg_temp.fail('due row remains');
  end if;
  if not exists (select 1 from public.room_documents where id = '${DOC}') then
    perform pg_temp.fail('open row deleted');
  end if;
  if not (plan -> 'storage_paths') ? '${OLD_PATH}' then perform pg_temp.fail('apply hid path'); end if;

  perform public.close_any_deal_room('${STAFF}', 'aal2', '${ROOM}');
  select r.closed_at into closed_at from public.rooms r where r.id = '${ROOM}';
  if closed_at is null then perform pg_temp.fail('closed_at missing'); end if;

  perform pg_temp.assume('${MEMBER}', 'aal1', 'authenticated');
  select count(*) into n from public.room_documents where room_id = '${ROOM}';
  if n <> 0 then perform pg_temp.fail('closed room still readable'); end if;

  perform pg_temp.service();
  if public.room_document_open_for('${MEMBER}', '${DOC}') ->> 'hold' is distinct from 'expired' then
    perform pg_temp.fail('closed hold');
  end if;
  if public.room_document_open_for('${INVITED}', '${DOC}') ->> 'hold' is distinct from 'hidden' then
    perform pg_temp.fail('invited hold');
  end if;
  if public.room_document_open_for('${OUTSIDER}', '${DOC}') ->> 'hold' is distinct from 'hidden' then
    perform pg_temp.fail('outsider hold');
  end if;

  select string_agg(e.member_name, ',') into names
  from jsonb_to_recordset(public.list_room_documents('${OWNER}', '${ROOM}') -> 'events')
    as e(member_name text);
  if names is not null and names ilike '%@%' then perform pg_temp.fail('log email'); end if;
end;
$counts$;
`

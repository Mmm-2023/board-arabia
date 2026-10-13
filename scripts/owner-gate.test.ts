import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { staffChangeMessage, staffHeadcount, staffRoleLabel, staffRosterName, lastOwnerLocked } from '../src/lib/staffRoster.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261217120000_owner_staff_gate.sql'

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function weeklyStub(): string {
  const text = readFileSync(new URL('./weekly-intro-suggestions.test.ts', import.meta.url), 'utf8')
  const marker = 'const stubSql = `'
  const start = text.indexOf(marker)
  assert.ok(start > 0)
  const body = start + marker.length
  const end = text.indexOf('`\n\nconst assertSql', body)
  assert.ok(end > body)
  return text.slice(body, end)
}

test('owner gate migration is the reserved slot and stays owner only', () => {
  const sql = readFileSync(path.join(migrationsDir, migrationName), 'utf8')
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.equal(names.filter((name) => name.startsWith('20261217120000')).length, 1)
  assert.ok(names.indexOf(migrationName) > names.indexOf('20261213120000_rls_initplan_select_auth_uid.sql'))
  assert.ok(names.indexOf(migrationName) > names.indexOf('20261212120000_weekly_digest.sql'))
  assert.match(sql, /function private\.is_owner\(\)/)
  assert.match(sql, /s\.role = 'master'/)
  assert.match(sql, /\(auth\.jwt\(\) ->> 'aal'\) = 'aal2'/)
  assert.match(sql, /function public\.staff_set_role\(p_user uuid, p_role text\)/)
  assert.match(sql, /function public\.staff_remove\(p_user uuid\)/)
  assert.match(sql, /if not private\.is_staff\(\) then/)
  assert.match(sql, /if not private\.is_owner\(\) then/)
  assert.match(sql, /security definer/)
  assert.match(sql, /set search_path = ''/)
  assert.match(sql, /last_owner/)
  assert.match(sql, /owner_stays/)
  assert.match(sql, /private\.root_master/)
  assert.match(sql, /public\.staff_role_log/)
  assert.match(sql, /force row level security/)
  assert.match(sql, /revoke all on table public\.staff_role_log from public, anon, authenticated/)
  assert.match(sql, /revoke all on function public\.staff_set_role\(uuid, text\) from public, anon;/)
  assert.match(sql, /grant execute on function public\.staff_set_role\(uuid, text\) to authenticated;/)
  assert.match(sql, /revoke all on function public\.staff_remove\(uuid\) from public, anon;/)
  assert.match(sql, /grant execute on function public\.staff_remove\(uuid\) to authenticated;/)
  assert.equal(/grant execute on function public\.staff_set_role[\s\S]*to anon/.test(sql), false)
  assert.equal(/grant execute on function public\.staff_remove[\s\S]*to anon/.test(sql), false)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  assert.equal(sql.includes('the desk'), false)
  assert.equal(/nammco/i.test(sql), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql), false)
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(sql), false)
  assert.equal(/promote michael/i.test(sql), false)

  const setAt = sql.indexOf('function public.staff_set_role')
  const setBody = sql.slice(setAt, sql.indexOf('revoke all on function public.staff_set_role'))
  const checkAt = setBody.indexOf('if not private.is_staff()')
  const ownerAt = setBody.indexOf('if not private.is_owner()')
  const writeAt = setBody.search(/\bupdate\b/i)
  assert.ok(checkAt >= 0 && ownerAt > checkAt && writeAt > ownerAt)

  const hits: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist') continue
        walk(full)
        continue
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue
      const text = readFileSync(full, 'utf8')
      if (/promote michael/i.test(text)) hits.push(path.relative(root, full))
    }
  }
  walk(path.join(root, 'src'))
  assert.deepEqual(hits, [])
})

test('staff labels and the home count include every staff row', () => {
  assert.equal(staffRoleLabel('master'), 'Owner')
  assert.equal(staffRoleLabel('staff'), 'Admin')
  assert.equal(staffRosterName({ email: 'owner@example.com', display_name: 'Example Owner' }), 'Example Owner')
  assert.equal(staffRosterName({ email: 'owner@example.com', display_name: 'name@example.com' }), 'owner@example.com')
  assert.equal(lastOwnerLocked('master', [{ role: 'master' }]), true)
  assert.equal(lastOwnerLocked('master', [{ role: 'master' }, { role: 'master' }]), false)
  assert.equal(lastOwnerLocked('staff', [{ role: 'master' }]), false)
  assert.equal(staffHeadcount([{ role: 'master' }, { role: 'staff' }]), 2)
  assert.equal(staffChangeMessage('last_owner'), 'The last owner stays in place.')
  assert.equal(staffChangeMessage('owner_stays'), 'This owner stays in place.')
  assert.equal(staffChangeMessage('cannot_demote_master'), 'This owner stays in place.')
  assert.equal(staffChangeMessage('not_allowed'), 'Only an owner can change staff.')
  assert.equal(staffChangeMessage('mystery'), 'Could not update staff.')
  assert.equal(staffChangeMessage('not_allowed').includes('\u2014'), false)
})

test('settings lists staff by name and only an owner can change them', async () => {
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_ANON_KEY = 'example-anon-key'
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const preview = (await vite.ssrLoadModule('/src/pages/admin/context.tsx')) as {
      AdminPreview: (props: { room: Record<string, unknown>; children: ReactNode }) => ReactNode
    }
    const roster = (await vite.ssrLoadModule('/src/pages/admin/StaffRosterPanel.tsx')) as {
      StaffRosterPanel: () => ReactNode
    }
    const home = (await vite.ssrLoadModule('/src/pages/admin/AdminHome.tsx')) as {
      StaffDesk: () => ReactNode
    }
    const ownerHtml = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(preview.AdminPreview, { room: rosterRoom('master') }, createElement(roster.StaffRosterPanel)),
      ),
    )
    const staffHtml = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(preview.AdminPreview, { room: rosterRoom('staff') }, createElement(roster.StaffRosterPanel)),
      ),
    )
    const homeHtml = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(preview.AdminPreview, { room: rosterRoom('master') }, createElement(home.StaffDesk)),
      ),
    )
    assert.match(ownerHtml, /data-staff-roster="true"/)
    assert.match(ownerHtml, /Example Owner/)
    assert.match(ownerHtml, />Owner</)
    assert.match(ownerHtml, /Example Admin/)
    assert.equal(ownerHtml.includes('owner@example.com'), false)
    assert.match(ownerHtml, /data-last-owner="true"/)
    assert.match(ownerHtml, /The last owner stays in place/)
    assert.match(ownerHtml, /data-staff-manage="true"/)
    assert.match(ownerHtml, /<option value="master">Owner<\/option>/)
    assert.equal(staffHtml.includes('data-staff-manage'), false)
    assert.match(staffHtml, /Only an owner can change a role or remove staff/)
    assert.match(homeHtml, /data-staff-count="2"/)
    assert.match(read('src/pages/admin/SettingsPage.tsx'), /StaffRosterPanel/)
    assert.equal(ownerHtml.includes('\u2014'), false)
    assert.equal(/promote michael/i.test(ownerHtml), false)
  } finally {
    await vite.close()
  }
})

test('owner gate rules run on postgres with prior migrations', { timeout: 180_000 }, () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-owner-gate-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_owner_gate_${process.pid}`
  writeFileSync(script, [weeklyStub(), ...names.map(include), assertSql].join('\n'))
  try {
    execFileSync('dropdb', ['--if-exists', db], { stdio: 'ignore' })
    execFileSync('createdb', [db], { stdio: 'ignore' })
    try {
      execFileSync('psql', ['-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-f', script], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      const failed = error as { stdout?: Buffer; stderr?: Buffer }
      throw new Error(`${failed.stdout?.toString() ?? ''}\n${failed.stderr?.toString() ?? ''}`)
    }
  } finally {
    execFileSync('dropdb', ['--if-exists', db], { stdio: 'ignore' })
    rmSync(dir, { recursive: true, force: true })
  }
})

function rosterRoom(staffRole: 'master' | 'staff') {
  return {
    session: null,
    booting: false,
    isStaff: true,
    staffRole,
    loading: false,
    hasLoaded: true,
    listError: '',
    refreshError: '',
    queryDetail: '',
    panelFailed: {},
    actionNote: '',
    apps: [],
    members: [],
    peerInvites: [],
    events: [],
    staffRows: [
      {
        user_id: 'owner-1',
        email: 'owner@example.com',
        role: 'master',
        display_name: 'Example Owner',
        created_at: '2026-09-01T00:00:00.000Z',
      },
      {
        user_id: 'admin-1',
        email: 'admin@example.com',
        role: 'staff',
        display_name: 'Example Admin',
        created_at: '2026-09-02T00:00:00.000Z',
      },
    ],
    profileByUser: {},
    capacity: { ksa: 1, intl: 0, ksa_cap: 50, intl_cap: 50, total_cap: 100 },
    platform: null,
    refreshedAt: null,
    updatingId: null,
    dryRunInvite: null,
    email: 'owner@example.com',
    isMember: false,
    masterKnown: true,
    seatById: {},
    setSeat: () => {},
    draftFor: (_key: string, fallback: unknown) => fallback,
    setDraft: () => {},
    refresh: () => {},
    onAccept: async () => {},
    onAdmit: async () => {},
    onReject: async () => {},
    runInvite: async () => {},
    onMemberStatus: async () => {},
    onSaveCapacity: async () => {},
    signOut: async () => {},
  }
}

const assertSql = `
do $checks$
declare
  owner_id uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  member_id uuid := gen_random_uuid();
  stranger_id uuid := gen_random_uuid();
  result jsonb;
  member_before jsonb;
  member_after jsonb;
  logs int;
  listed jsonb;
begin
  insert into auth.users (id, email) values
    (owner_id, 'owner.gate@example.com'),
    (admin_id, 'admin.gate@example.com'),
    (member_id, 'member.gate@example.com');
  insert into public.staff_users (user_id, email, role) values
    (owner_id, 'owner.gate@example.com', 'master'),
    (admin_id, 'admin.gate@example.com', 'staff');
  insert into public.members (user_id, email, seat, status) values
    (owner_id, 'owner.gate@example.com', 'ksa', 'active'),
    (admin_id, 'admin.gate@example.com', 'intl', 'active'),
    (member_id, 'member.gate@example.com', 'ksa', 'invited');
  insert into public.staff_display_names (user_id, display_name)
  values (owner_id, 'Example Owner'), (admin_id, 'Example Admin');

  select jsonb_agg(jsonb_build_object('id', user_id, 'email', email, 'seat', seat, 'status', status) order by email)
    into member_before
  from public.members;

  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'aal', 'aal2', 'role', 'authenticated')::text, false);
  if private.is_owner() is not true then
    raise exception 'owner aal2 was not an owner';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'aal', 'aal1', 'role', 'authenticated')::text, false);
  if private.is_owner() then
    raise exception 'owner aal1 passed is_owner';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'aal', 'aal2', 'role', 'authenticated')::text, false);
  if private.is_owner() then
    raise exception 'admin passed is_owner';
  end if;
  if private.is_staff() is not true then
    raise exception 'admin aal2 was not staff';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', member_id, 'aal', 'aal2', 'role', 'authenticated')::text, false);
  if private.is_owner() or private.is_staff() then
    raise exception 'member passed a staff gate';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'aal', 'aal2', 'role', 'authenticated')::text, false);
  set role authenticated;
  begin
    perform public.staff_set_role(admin_id, 'master');
    raise exception 'admin created a master';
  exception
    when insufficient_privilege then
      if sqlerrm not ilike '%not_allowed%' then
        raise exception 'admin set role error %', sqlerrm;
      end if;
  end;
  begin
    perform public.staff_remove(owner_id);
    raise exception 'admin removed an owner';
  exception
    when insufficient_privilege then
      if sqlerrm not ilike '%not_allowed%' then
        raise exception 'admin remove error %', sqlerrm;
      end if;
  end;
  set role postgres;
  if (select role from public.staff_users where user_id = admin_id) is distinct from 'staff' then
    raise exception 'admin role changed';
  end if;
  if (select count(*) from public.staff_role_log) <> 0 then
    raise exception 'a refused call was logged';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', member_id, 'aal', 'aal2', 'role', 'authenticated')::text, false);
  set role authenticated;
  begin
    perform public.staff_set_role(admin_id, 'master');
    raise exception 'member changed staff';
  exception
    when insufficient_privilege then
      if sqlerrm not ilike '%not_allowed%' then
        raise exception 'member set role error %', sqlerrm;
      end if;
  end;
  set role postgres;

  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'aal', 'aal1', 'role', 'authenticated')::text, false);
  set role authenticated;
  begin
    perform public.staff_set_role(admin_id, 'master');
    raise exception 'aal1 owner changed staff';
  exception
    when insufficient_privilege then
      if sqlerrm not ilike '%not_allowed%' then
        raise exception 'aal1 owner error %', sqlerrm;
      end if;
  end;
  set role postgres;

  set role anon;
  begin
    perform public.staff_set_role(admin_id, 'master');
    raise exception 'anon set a role';
  exception
    when insufficient_privilege then
      if sqlerrm ilike '%not_allowed%' then
        raise exception 'anon reached staff_set_role';
      end if;
  end;
  set role postgres;

  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'aal', 'aal2', 'role', 'authenticated')::text, false);
  set role authenticated;
  begin
    perform public.staff_set_role(stranger_id, 'master');
    raise exception 'missing user became staff';
  exception
    when no_data_found then
      if sqlerrm not ilike '%not_found%' then
        raise exception 'missing user error %', sqlerrm;
      end if;
  end;
  begin
    perform public.staff_set_role(admin_id, 'Owner');
    raise exception 'label was stored as a role';
  exception
    when invalid_parameter_value then
      if sqlerrm not ilike '%invalid_role%' then
        raise exception 'invalid role error %', sqlerrm;
      end if;
  end;
  if (select count(*) from public.staff_users where role = 'master') <> 1 then
    raise exception 'a refused promote created a master';
  end if;

  result := public.staff_set_role(admin_id, 'master');
  if result->>'role' is distinct from 'master' then
    raise exception 'owner promote failed %', result;
  end if;
  result := public.staff_set_role(admin_id, 'staff');
  if result->>'role' is distinct from 'staff' then
    raise exception 'owner demote failed %', result;
  end if;
  begin
    perform public.staff_set_role(owner_id, 'staff');
    raise exception 'last owner was demoted';
  exception
    when insufficient_privilege then
      if sqlerrm not ilike '%last_owner%' then
        raise exception 'last owner demote error %', sqlerrm;
      end if;
  end;
  begin
    perform public.staff_remove(owner_id);
    raise exception 'last owner was removed';
  exception
    when insufficient_privilege then
      if sqlerrm not ilike '%last_owner%' then
        raise exception 'last owner remove error %', sqlerrm;
      end if;
  end;
  if (select role from public.staff_users where user_id = owner_id) is distinct from 'master' then
    raise exception 'last owner role changed';
  end if;

  perform public.staff_remove(admin_id);
  set role postgres;
  if exists (select 1 from public.staff_users where user_id = admin_id) then
    raise exception 'admin row remained';
  end if;
  select jsonb_agg(jsonb_build_object('id', user_id, 'email', email, 'seat', seat, 'status', status) order by email)
    into member_after
  from public.members;
  if member_before is distinct from member_after then
    raise exception 'members changed %', member_after;
  end if;
  if (select count(*) from public.staff_role_log where action = 'remove' and target_id = admin_id and previous_role = 'staff' and next_role is null) <> 1 then
    raise exception 'remove was not logged';
  end if;
  select count(*) into logs from public.staff_role_log where action = 'set_role';
  if logs <> 2 then
    raise exception 'expected two role logs, found %', logs;
  end if;

  set role authenticated;
  begin
    perform count(*) from public.staff_role_log;
    raise exception 'authenticated read the role log';
  exception
    when insufficient_privilege then
      null;
  end;
  begin
    perform set_config('ba.staff_role_write', 'on', true);
    update public.staff_users set role = 'staff' where user_id = owner_id;
    raise exception 'direct staff write was allowed';
  exception
    when insufficient_privilege then
      null;
  end;
  set role postgres;
  if (select role from public.staff_users where user_id = owner_id) is distinct from 'master' then
    raise exception 'direct write changed the owner';
  end if;

  perform set_config('request.jwt.claims', '{}', false);
  insert into public.staff_users (user_id, email, role)
  values (admin_id, 'admin.gate@example.com', 'master');
  insert into private.root_master (user_id) values (owner_id);
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'aal', 'aal2', 'role', 'authenticated')::text, false);
  set role authenticated;
  if private.is_owner() is not true then
    raise exception 'second owner was not an owner';
  end if;
  begin
    perform public.staff_set_role(owner_id, 'staff');
    raise exception 'pinned owner was demoted';
  exception
    when insufficient_privilege then
      if sqlerrm not ilike '%owner_stays%' then
        raise exception 'pinned demote error %', sqlerrm;
      end if;
  end;
  begin
    perform public.staff_remove(owner_id);
    raise exception 'pinned owner was removed';
  exception
    when insufficient_privilege then
      if sqlerrm not ilike '%owner_stays%' then
        raise exception 'pinned remove error %', sqlerrm;
      end if;
  end;
  set role postgres;
  if (select role from public.staff_users where user_id = owner_id) is distinct from 'master' then
    raise exception 'pinned owner role changed';
  end if;
  if member_before is distinct from (
    select jsonb_agg(jsonb_build_object('id', user_id, 'email', email, 'seat', seat, 'status', status) order by email)
    from public.members
  ) then
    raise exception 'members changed after the pinned owner checks';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'aal', 'aal2', 'role', 'authenticated')::text, false);
  set role authenticated;
  select jsonb_agg(jsonb_build_object('user_id', user_id, 'role', role, 'display_name', display_name) order by display_name)
    into listed
  from public.list_staff_directory();
  if not exists (
    select 1 from jsonb_array_elements(listed) row
    where row->>'display_name' = 'Example Owner' and row->>'role' = 'master' and row->>'user_id' = owner_id::text
  ) then
    raise exception 'directory missed the owner %', listed;
  end if;
  if listed::text like '%@%' then
    raise exception 'directory name leaked an address %', listed;
  end if;
  set role postgres;
end
$checks$;
`

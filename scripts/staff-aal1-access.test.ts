import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { staffApiDecision } from '../supabase/functions/_shared/staff_auth.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261230120000_staff_aal1_access.sql'

const STAFF = '11111111-1111-4111-8111-111111111111'
const MEMBER = '22222222-2222-4222-8222-222222222222'

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

test('staff aal1 passes staffApiDecision and the named migration drops only aal2', () => {
  assert.deepEqual(staffApiDecision({ userId: STAFF, role: 'staff', aal: 'aal1' }), {
    allow: true,
    role: 'staff',
  })
  assert.deepEqual(staffApiDecision({ userId: STAFF, role: 'master', aal: 'aal1' }), {
    allow: true,
    role: 'master',
  })
  assert.equal(staffApiDecision({ userId: MEMBER, role: null, aal: 'aal1' }).allow, false)

  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.ok(names.includes(migrationName))
  assert.equal(names.filter((name) => name.startsWith('20261230120000')).length, 1)
  assert.ok(names.indexOf(migrationName) > names.indexOf('20261228120000_push_registration.sql'))
  const covered = names.filter((name) => name <= migrationName)
  assert.equal(covered.at(-1), migrationName)
  assert.equal(covered.includes('20261223120000_email_campaign_ui.sql'), true)
  assert.equal(covered.includes('20261229120000_email_transactional.sql'), false)

  const sql = readFileSync(path.join(migrationsDir, migrationName), 'utf8')
  assert.equal(sql.includes("'aal2'"), false)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql), false)
  assert.equal(/nammco/i.test(sql), false)
  assert.equal(/supabase\.co/i.test(sql), false)
  for (const name of [
    'private.is_staff()',
    'private.is_master()',
    'private.is_owner()',
    'private.actor_is_staff(p_actor uuid)',
    'public.close_any_deal_room(p_actor uuid, p_aal text, p_room_id uuid)',
    'public.list_all_deal_rooms(p_actor uuid, p_aal text)',
  ]) {
    assert.match(sql, new RegExp(`function ${name.replace(/[()]/g, '\\$&')}`))
  }
  assert.equal(sql.match(/set search_path = ''/g)?.length, 6)
  assert.match(sql, /revoke all on function private\.is_staff\(\) from public, anon/)
  assert.match(sql, /grant execute on function private\.is_staff\(\) to authenticated, service_role/)
  assert.match(sql, /revoke all on function private\.actor_is_staff\(uuid\) from public, anon, authenticated/)
  assert.match(sql, /grant execute on function public\.close_any_deal_room\(uuid, text, uuid\) to service_role/)
  assert.match(sql, /grant execute on function public\.list_all_deal_rooms\(uuid, text\) to service_role/)
  assert.match(sql, /and coalesce\(auth\.role\(\), ''\) = 'service_role'/)
})

test('a staff session at aal1 passes is_staff', { timeout: 300_000 }, () => {
  const names = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql') && name <= migrationName)
    .sort()
  assert.equal(names.at(-1), migrationName)
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-aal1-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_aal1_${process.pid}`
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

const assertSql = `
do $checks$
declare
  staff_id uuid := '${STAFF}';
  member_id uuid := '${MEMBER}';
  empty_path boolean;
begin
  insert into auth.users (id, email) values
    (staff_id, 'staff.aal1@example.com'),
    (member_id, 'member.aal1@example.com');
  insert into public.staff_users (user_id, email, role) values
    (staff_id, 'staff.aal1@example.com', 'staff');

  select exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'is_staff'
      and exists (
        select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
        where cfg = 'search_path=""'
      )
  ) into empty_path;
  if empty_path is not true then
    raise exception 'is_staff search_path is not empty';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', staff_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  if private.is_staff() is not true then
    raise exception 'aal1 staff failed is_staff';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', member_id, 'aal', 'aal1', 'role', 'authenticated')::text,
    false
  );
  if private.is_staff() then
    raise exception 'member passed is_staff';
  end if;
end
$checks$;
`

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261203120000_staff_display_names.sql'

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

for (const title of [
  'staff display name migration sorts after the directory hide migration',
  'staff display name migration sorts after the migrations it follows',
]) {
  test(title, () => {
  const sql = readFileSync(path.join(migrationsDir, migrationName), 'utf8')
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.ok(names.includes(migrationName))
  assert.ok(migrationName > '20261202120000')
  assert.ok(migrationName > '20261201120000_intro_suggestions_directory_hidden.sql')
  assert.ok(migrationName < '20261206120000_staff_create_mandate.sql')
  assert.match(sql, /references public\.staff_users \(user_id\)/)
  assert.match(sql, /enable row level security/)
  assert.match(sql, /force row level security/)
  assert.match(sql, /revoke all on table public\.staff_display_names from public, anon, authenticated/)
  assert.match(sql, /private\.is_staff\(\)/)
  assert.match(sql, /auth\.uid\(\)/)
  assert.match(sql, /coalesce\(/)
  assert.match(sql, /position\('@'/)
  assert.equal(/alter table public\.staff_users/i.test(sql), false)
  assert.equal(/protect_master/i.test(sql), false)
  assert.equal(/create trigger/i.test(sql), false)
  assert.equal(/nammco/i.test(sql), false)
  assert.equal(sql.includes('the desk'), false)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql), false)
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(sql), false)
  })
}

test('staff display name rules run on postgres with prior migrations', { timeout: 180_000 }, () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  const include = (name: string) => `\\i ${path.join(migrationsDir, name)}`
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-staff-name-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_staff_name_${process.pid}`
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
  staff_a uuid := gen_random_uuid();
  staff_b uuid := gen_random_uuid();
  member_id uuid := gen_random_uuid();
  saved text;
  rows jsonb;
  named jsonb;
  unnamed jsonb;
  forced boolean;
  enabled boolean;
begin
  insert into public.staff_users (user_id, email, role) values
    (staff_a, 'staff.one@example.com', 'staff'),
    (staff_b, 'staff.two@example.com', 'master');
  insert into auth.users (id, email) values
    (staff_a, 'staff.one@example.com'),
    (staff_b, 'staff.two@example.com'),
    (member_id, 'member.one@example.com');
  insert into public.members (user_id, email, seat, status) values
    (member_id, 'member.one@example.com', 'ksa', 'active');

  select c.relrowsecurity, c.relforcerowsecurity into enabled, forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'staff_display_names';
  if enabled is not true or forced is not true then
    raise exception 'staff_display_names rls is not forced';
  end if;
  if has_table_privilege('anon', 'public.staff_display_names', 'select')
     or has_table_privilege('authenticated', 'public.staff_display_names', 'select')
     or has_table_privilege('anon', 'public.staff_display_names', 'insert')
     or has_table_privilege('authenticated', 'public.staff_display_names', 'insert')
     or has_table_privilege('anon', 'public.staff_display_names', 'update')
     or has_table_privilege('authenticated', 'public.staff_display_names', 'update') then
    raise exception 'client role has a table grant';
  end if;
  if has_function_privilege('anon', 'public.staff_get_own_display_name()', 'execute')
     or has_function_privilege('anon', 'public.staff_set_own_display_name(text)', 'execute') then
    raise exception 'anon can execute a display name rpc';
  end if;
  if not has_function_privilege('authenticated', 'public.staff_get_own_display_name()', 'execute')
     or not has_function_privilege('authenticated', 'public.staff_set_own_display_name(text)', 'execute') then
    raise exception 'authenticated cannot execute a display name rpc';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', staff_a, 'aal', 'aal1', 'role', 'authenticated')::text, false);
  set role authenticated;
  begin
    perform public.staff_set_own_display_name('Example Admin');
    raise exception 'aal1 staff set a name';
  exception
    when insufficient_privilege then
      if sqlerrm not ilike '%not_allowed%' then
        raise exception 'aal1 error %', sqlerrm;
      end if;
  end;
  set role postgres;

  perform set_config('request.jwt.claims', json_build_object('sub', member_id, 'aal', 'aal2', 'role', 'authenticated')::text, false);
  set role authenticated;
  begin
    perform public.staff_get_own_display_name();
    raise exception 'member read a staff name';
  exception
    when insufficient_privilege then
      if sqlerrm not ilike '%not_allowed%' then
        raise exception 'member error %', sqlerrm;
      end if;
  end;
  set role postgres;

  set role anon;
  begin
    perform public.staff_set_own_display_name('Example Admin');
    raise exception 'anon set a name';
  exception
    when insufficient_privilege then
      if sqlerrm ilike '%not_allowed%' then
        raise exception 'anon reached the function body';
      end if;
  end;
  set role postgres;

  perform set_config('request.jwt.claims', json_build_object('sub', staff_a, 'aal', 'aal2', 'role', 'authenticated')::text, false);
  set role authenticated;
  begin
    perform public.staff_set_own_display_name('name@example.com');
    raise exception 'at sign was stored';
  exception
    when invalid_parameter_value then
      null;
  end;
  begin
    perform public.staff_set_own_display_name('   ');
    raise exception 'blank name was stored';
  exception
    when invalid_parameter_value then
      null;
  end;
  saved := public.staff_set_own_display_name('  Example Admin  ');
  if saved is distinct from 'Example Admin' then
    raise exception 'saved name %', saved;
  end if;
  if public.staff_get_own_display_name() is distinct from 'Example Admin' then
    raise exception 'read name failed';
  end if;
  begin
    update public.staff_display_names set display_name = 'Other Person';
    raise exception 'authenticated updated the table';
  exception
    when insufficient_privilege then
      null;
  end;
  set role postgres;
  if (select count(*) from public.staff_display_names where user_id <> staff_a) <> 0 then
    raise exception 'a name was written for another user';
  end if;
  if (select display_name from public.staff_display_names where user_id = staff_a) is distinct from 'Example Admin' then
    raise exception 'first name changed';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', staff_b, 'aal', 'aal2', 'role', 'authenticated')::text, false);
  set role authenticated;
  if public.staff_get_own_display_name() is not null then
    raise exception 'second staff read the first name';
  end if;
  set role postgres;

  insert into public.staff_access_log (staff_user_id, member_id, object_type, action, created_at) values
    (staff_a, member_id, 'member', 'read', '2026-10-01 00:00:00+00'),
    (staff_b, member_id, 'member', 'read', '2026-10-02 00:00:00+00');

  perform set_config('request.jwt.claims', json_build_object('sub', staff_a, 'aal', 'aal2', 'role', 'authenticated')::text, false);
  set role authenticated;
  rows := public.staff_list_access_log(member_id);
  if jsonb_array_length(rows) is distinct from 2 then
    raise exception 'log length %', rows;
  end if;
  if not (rows->0 ? 'id' and rows->0 ? 'object_type' and rows->0 ? 'object_id' and rows->0 ? 'action' and rows->0 ? 'at' and rows->0 ? 'actor_name' and rows->0 ? 'actor_role') then
    raise exception 'log shape %', rows->0;
  end if;
  select value into named from jsonb_array_elements(rows) value where value->>'actor_role' = 'Admin';
  select value into unnamed from jsonb_array_elements(rows) value where value->>'actor_role' = 'Master';
  if named->>'actor_name' is distinct from 'Example Admin' then
    raise exception 'named actor %', named;
  end if;
  if unnamed->>'actor_name' is not null or unnamed->>'actor_role' is distinct from 'Master' then
    raise exception 'unnamed actor %', unnamed;
  end if;
  if position('@' in rows::text) <> 0 then
    raise exception 'log leaked an address %', rows;
  end if;
  set role postgres;
end
$checks$;
`

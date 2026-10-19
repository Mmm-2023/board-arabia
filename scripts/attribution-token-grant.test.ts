import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { registerCandidate } from '../supabase/functions/_shared/candidate_flow.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20270105120000_fix_attribution_token_grant.sql'
const priorName = '20270103120000_free_account_majlis.sql'
const createdId = '11111111-1111-4111-8111-111111111111'
const existingId = '22222222-2222-4222-8222-222222222222'
const email = 'ada@example.com'
const fullName = 'Ada Example'
const phone = '966500000000'
const token = 'tok_test_value'

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function migrationSql() {
  return readFileSync(path.join(migrationsDir, migrationName), 'utf8')
}

const generic = {
  error: 'Could not open the account. Try again.',
  error_code: 'server',
}

function deps(overrides: Record<string, unknown> = {}) {
  return {
    now: () => new Date('2026-09-30T08:00:00.000Z'),
    pepper: 'test-pepper',
    turnstileSecret: 'test-secret',
    site: 'https://boardarabia.com',
    verifyTurnstile: async () => true,
    emailIsMember: async () => false,
    findCandidate: async () => null,
    findAuthUserId: async () => null,
    createAuthUser: async () => ({ userId: createdId }),
    deleteAuthUser: async () => {},
    insertCandidate: async () => ({ error: `permission denied for ${email} ${fullName} ${phone} ${token}` }),
    issueCode: async () => 'ok' as const,
    voidLatestCode: async () => {},
    sendMail: async () => ({ ok: true, dryRun: false }),
    recordEvent: async () => {},
    claimInvite: async () => false,
    domainStatus: async () => 'ok' as const,
    mailboxOk: async () => true,
    consumeRegisterLimit: async () => 'ok' as const,
    ...overrides,
  }
}

function body() {
  return {
    full_name: fullName,
    email,
    role: 'chairperson',
    region: 'ksa_gcc',
    consent: true,
    turnstile_token: token,
    form_started_at: Date.parse('2026-09-30T07:59:00.000Z'),
    phone,
  }
}

async function capture(run: () => Promise<void>) {
  const logs: string[] = []
  const original = console.error
  console.error = (...args: unknown[]) => {
    logs.push(args.map((item) => String(item)).join(' '))
  }
  try {
    await run()
  } finally {
    console.error = original
  }
  return logs
}

function assertNoPersonalData(text: string) {
  assert.equal(text.includes(email), false)
  assert.equal(text.includes(fullName), false)
  assert.equal(text.includes('Ada'), false)
  assert.equal(text.includes(phone), false)
  assert.equal(text.includes(token), false)
  assert.equal(text.includes('test-pepper'), false)
  assert.equal(text.includes('test-secret'), false)
}

test('attribution token migration grants execute to service_role only', () => {
  const names = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
  assert.equal(names.includes(migrationName), true)
  assert.equal(names.includes(priorName), true)
  assert.ok(names.indexOf(migrationName) > names.indexOf(priorName))
  const sql = migrationSql()
  assert.match(sql, /grant execute on function private\.attribution_token\(text\) to service_role/)
  assert.match(sql, /to_regprocedure\('private\.attribution_token\(text\)'\)/)
  assert.equal(/to (public|anon|authenticated)\b/i.test(sql), false)
  assert.equal(/revoke execute on function private\.attribution_token/i.test(sql), false)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  assert.equal(sql.includes('the desk'), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql), false)
  assert.equal(/eyJ|sk_live|service_role_key|SUPABASE_SERVICE_ROLE|BEGIN PRIVATE KEY/i.test(sql), false)
  assert.equal(/cron|aal2/i.test(sql), false)
  assert.match(sql, /fix_attribution_token_grant/)
})

test('service_role can execute attribution_token after the grant, twice', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ba-at1-'))
  const script = path.join(dir, 'run.sql')
  const db = `ba_at1_${process.pid}`
  const sql = `
do $role$
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end
$role$;
create schema if not exists private;
create or replace function private.attribution_token(value text)
returns boolean
language sql
immutable
as $$ select true $$;
revoke all on function private.attribution_token(text) from public;
do $before$
begin
  if has_function_privilege('service_role', 'private.attribution_token(text)', 'execute') then
    raise exception 'service_role already had execute';
  end if;
end
$before$;
\\i ${path.join(migrationsDir, migrationName)}
\\i ${path.join(migrationsDir, migrationName)}
do $after$
begin
  if not has_function_privilege('service_role', 'private.attribution_token(text)', 'execute') then
    raise exception 'service_role lacks execute';
  end if;
end
$after$;
drop function private.attribution_token(text);
\\i ${path.join(migrationsDir, migrationName)}
`
  writeFileSync(script, sql)
  try {
    execFileSync('dropdb', ['--if-exists', db], { stdio: 'ignore' })
    execFileSync('createdb', [db], { stdio: 'ignore' })
    execFileSync('psql', ['-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-f', script], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const failed = error as { stdout?: Buffer; stderr?: Buffer; status?: number }
    if (failed.stdout || failed.stderr) {
      throw new Error(`${failed.stdout?.toString() ?? ''}\n${failed.stderr?.toString() ?? ''}`)
    }
    throw error
  } finally {
    try {
      execFileSync('dropdb', ['--if-exists', db], { stdio: 'ignore' })
    } catch {
      // The database was not created when Postgres is unavailable.
    }
    rmSync(dir, { recursive: true, force: true })
  }
})

test('failed candidate insert deletes the created auth user and logs no personal data', async () => {
  const deleted: string[] = []
  let mailed = 0
  let recorded = 0
  const logs = await capture(async () => {
    const outcome = await registerCandidate(
      body(),
      '203.0.113.5',
      deps({
        deleteAuthUser: async (userId: string) => {
          deleted.push(userId)
        },
        sendMail: async () => {
          mailed += 1
          return { ok: true, dryRun: false }
        },
        recordEvent: async () => {
          recorded += 1
        },
      }),
    )
    assert.equal(outcome.status, 400)
    assert.deepEqual(outcome.body, generic)
    assertNoPersonalData(JSON.stringify(outcome.body))
  })
  assert.deepEqual(deleted, [createdId])
  assert.equal(mailed, 0)
  assert.equal(recorded, 0)
  assert.deepEqual(logs, [
    JSON.stringify({ event: 'register_candidate_insert_failed', code: 'insert_failed' }),
  ])
  assertNoPersonalData(logs.join('\n'))
})

test('a sqlstate from the insert is logged and the created auth user is deleted', async () => {
  const deleted: string[] = []
  const logs = await capture(async () => {
    const outcome = await registerCandidate(
      body(),
      '203.0.113.5',
      deps({
        insertCandidate: async () => ({ error: '42501' }),
        deleteAuthUser: async (userId: string) => {
          deleted.push(userId)
        },
      }),
    )
    assert.equal(outcome.status, 400)
    assert.deepEqual(outcome.body, generic)
  })
  assert.deepEqual(deleted, [createdId])
  assert.deepEqual(logs, [
    JSON.stringify({ event: 'register_candidate_insert_failed', code: '42501' }),
  ])
})

test('a failed auth cleanup still returns the generic reply and logs no personal data', async () => {
  const logs = await capture(async () => {
    const outcome = await registerCandidate(
      body(),
      '203.0.113.5',
      deps({
        deleteAuthUser: async (userId: string) => {
          throw new Error(`delete failed for ${userId} ${email} ${fullName} ${phone} ${token}`)
        },
      }),
    )
    assert.equal(outcome.status, 400)
    assert.deepEqual(outcome.body, generic)
  })
  assert.deepEqual(logs, [
    JSON.stringify({ event: 'register_candidate_insert_failed', code: 'insert_failed' }),
    JSON.stringify({ event: 'register_auth_cleanup_failed', code: 'delete_failed' }),
  ])
  assertNoPersonalData(logs.join('\n'))
  assert.equal(logs.join('\n').includes(createdId), false)
})

test('an existing auth user is left in place when the candidate insert fails', async () => {
  const deleted: string[] = []
  let created = 0
  const logs = await capture(async () => {
    const outcome = await registerCandidate(
      body(),
      '203.0.113.5',
      deps({
        findAuthUserId: async () => existingId,
        createAuthUser: async () => {
          created += 1
          return { userId: createdId }
        },
        deleteAuthUser: async (userId: string) => {
          deleted.push(userId)
        },
        insertCandidate: async () => ({ error: '42501' }),
      }),
    )
    assert.equal(outcome.status, 400)
    assert.deepEqual(outcome.body, generic)
  })
  assert.equal(created, 0)
  assert.deepEqual(deleted, [])
  assert.deepEqual(logs, [])
})

test('register wiring calls deleteUser with the created id and does not log the insert message', () => {
  const admin = read('supabase/functions/_shared/candidate_admin.ts')
  const flow = read('supabase/functions/_shared/candidate_flow.ts')
  const insert = admin.split('insertCandidate:')[1]?.split('issueCode:')[0] ?? ''
  assert.match(admin, /admin\.auth\.admin\.deleteUser\(userId\)/)
  assert.match(insert, /failureClass\(error\.code\)/)
  assert.equal(insert.includes('error.message'), false)
  assert.match(flow, /createdAuthUser/)
  assert.match(flow, /deps\.deleteAuthUser\(userId\)/)
  assert.equal(flow.includes('\u2014'), false)
  assert.equal(admin.includes('\u2014'), false)
})

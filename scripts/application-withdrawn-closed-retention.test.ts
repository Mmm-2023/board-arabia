import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { applicationExpired } from '../supabase/functions/_shared/retention_plan.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20270111120000_application_withdrawn_closed_retention.sql'
const priorPlan = '20270103120000_free_account_majlis.sql'
const priorCheck = '20260922170000_wave1_members_profiles.sql'

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function statusList(sql: string) {
  const match = sql.match(/add constraint applications_status_check[\s\S]*?check \(status in \(([\s\S]*?)\)\)/)
  assert.ok(match, 'applications_status_check missing')
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1])
}

function planFunction(sql: string) {
  const start = sql.indexOf('create or replace function public.retention_sweep_plan')
  const end = sql.indexOf('$$;', start)
  assert.ok(start >= 0 && end > start)
  return sql.slice(start, end + 3)
}

const migration = read(`supabase/migrations/${migrationName}`)
const workflow = read('.github/workflows/retention-sweep.yml')
const invite = read('.github/workflows/invite-reminders.yml')

test('the applications check keeps every current status and adds withdrawn and closed', () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.equal(names.filter((name) => name.startsWith('20270111120000')).length, 1)
  assert.ok((names.at(-1) ?? '') >= migrationName)
  assert.ok(names.indexOf(migrationName) > names.indexOf('20270110120000_majlis_reminder_windows.sql'))
  const previous = statusList(read(`supabase/migrations/${priorCheck}`))
  assert.deepEqual(previous, ['pending', 'verified', 'declined', 'accepted', 'rejected', 'admitted'])
  assert.deepEqual(statusList(migration), [...previous, 'withdrawn', 'closed'])
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)
  assert.equal(/supabase\.co/i.test(migration), false)
  assert.equal(/nammco/i.test(migration), false)
  assert.equal(migration.toLowerCase().includes('the desk'), false)
  const addresses = migration.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []
  assert.deepEqual(addresses, [])
  const hosts = migration.match(/@[A-Za-z0-9.-]+/g) ?? []
  assert.deepEqual([...new Set(hosts)], ['@example.com'])
})

test('withdrawn and closed join the 12 month application delete on decision_at', () => {
  const previous = planFunction(read(`supabase/migrations/${priorPlan}`))
  const next = planFunction(migration)
  const needle = "    where a.status in ('rejected', 'declined')\n"
  const widened = "    where a.status in ('rejected', 'declined', 'withdrawn', 'closed')\n"
  assert.equal(previous.includes(needle), true)
  assert.equal(previous.split(needle).length, 2)
  assert.equal(next, previous.replace(needle, widened))
  const apps = next.split('into applications')[1]?.split('old_apps')[0] ?? ''
  assert.match(apps, /a\.status in \('rejected', 'declined', 'withdrawn', 'closed'\)/)
  assert.match(apps, /a\.decision_at is not null/)
  assert.match(apps, /a\.decision_at < now\(\) - interval '12 months'/)
  assert.match(apps, /order by a\.decision_at/)
  assert.match(apps, /not exists \(select 1 from public\.members m where m\.application_id = a\.id\)/)
  assert.match(next, /if p_apply then/)
  assert.match(next, /delete from public\.applications a/)
  assert.equal(next.includes("c.request_state in ('declined', 'closed')"), true)
  assert.equal(next.includes("interval '7 days'"), true)
  assert.equal(next.includes("interval '120 days'"), true)
  assert.equal(next.includes("interval '24 months'"), true)
  const now = new Date('2026-10-30T00:00:00.000Z')
  const old = '2025-10-29T00:00:00.000Z'
  const recent = '2026-10-01T00:00:00.000Z'
  for (const status of ['rejected', 'declined', 'withdrawn', 'closed']) {
    assert.equal(applicationExpired(status, old, now, false), true, status)
    assert.equal(applicationExpired(status, recent, now, false), false, status)
    assert.equal(applicationExpired(status, old, now, true), false, status)
  }
  assert.equal(applicationExpired('admitted', old, now, false), false)
  assert.equal(applicationExpired('pending', old, now, false), false)
  assert.equal(applicationExpired('withdrawn', null, now, false), false)
})

test('the retention job is gated and runs at 03:00 UTC', () => {
  assert.match(workflow, /schedule:\n {4}- cron: '0 3 \* \* \*'\n/)
  assert.equal(workflow.match(/^\s*- cron:/gm)?.length, 1)
  const jobs = workflow.split(/^jobs:\s*$/m)[1] ?? ''
  const sweep = jobs.split(/^ {2}sweep:\s*$/m)[1] ?? ''
  assert.match(sweep, /^ {4}if:\s*\$\{\{\s*vars\.RETENTION_SWEEP_ENABLED == 'true'\s*\}\}\s*$/m)
  const ifAt = sweep.search(/if:\s*\$\{\{\s*vars\.RETENTION_SWEEP_ENABLED == 'true'\s*\}\}/)
  const stepsAt = sweep.search(/^ {4}steps:\s*$/m)
  assert.ok(ifAt >= 0 && stepsAt > ifAt)
  assert.equal(sweep.match(/^\s*if:/gm)?.length, 1)
  const inviteDispatch = /^ {2}workflow_dispatch:\s*$/m.test(invite)
  assert.equal(/^ {2}workflow_dispatch:\s*$/m.test(workflow), inviteDispatch)
  assert.equal(inviteDispatch, true)
  assert.equal(workflow.includes('?dry_run=1'), false)
  assert.equal(workflow.includes('purge_orphans'), false)
})

test('the retention workflow uses secret references and no literal host', () => {
  assert.match(workflow, /x-retention-sweep:\s*\$\{RETENTION_SWEEP_SECRET\}/)
  assert.match(workflow, /\$\{origin\}\/functions\/v1\/retention-sweep/)
  assert.match(workflow, /\$\{\{\s*secrets\.RETENTION_SWEEP_SECRET\s*\}\}/)
  assert.match(workflow, /\$\{\{\s*secrets\.SUPABASE_URL\s*\}\}/)
  const secretNames = [...workflow.matchAll(/\$\{\{\s*secrets\.([A-Z0-9_]+)\s*\}\}/g)].map((match) => match[1])
  assert.deepEqual(secretNames, ['RETENTION_SWEEP_SECRET', 'SUPABASE_URL'])
  const withoutRefs = workflow
    .replace(/\$\{\{\s*secrets\.[A-Z0-9_]+\s*\}\}/g, '')
    .replace(/\$\{\{\s*vars\.RETENTION_SWEEP_ENABLED == 'true'\s*\}\}/g, '')
  assert.equal(withoutRefs.includes('secrets.'), false)
  assert.equal(/https?:\/\/\S+/i.test(withoutRefs), false)
  assert.equal(/supabase\.co/i.test(workflow), false)
  assert.equal(/iirqbizwanyhgkhanntq/.test(workflow), false)
  assert.equal(/eyJ[A-Za-z0-9_-]{10,}/.test(workflow), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(workflow), false)
  assert.equal(/apikey|access_token|refresh_token|service_role/i.test(workflow), false)
  assert.match(workflow, /\[redacted\]/)
  assert.match(workflow, /RETENTION_SWEEP_SECRET or SUPABASE_URL is unset/)
  assert.equal(workflow.includes('\u2014'), false)
  assert.equal(workflow.includes('\u2013'), false)
  assert.equal(read('.github/workflows/pages.yml').includes('RETENTION_SWEEP_ENABLED'), false)
})

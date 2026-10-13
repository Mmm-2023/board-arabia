import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { publicEntityHits } from './no-public-entity.test.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261219120000_operator_row_owner_lock.sql'
const ownerGateName = '20261217120000_owner_staff_gate.sql'
const operatorSeedName = '20261126120000_ai_report_operator.sql'

const lockClause =
  /select\s+s\.user_id\s+from\s+public\.staff_users\s+s\s+where\s+s\.role\s*=\s*'master'\s+order\s+by\s+s\.user_id\s+for\s+update/i

function readMigration(name: string) {
  return readFileSync(path.join(migrationsDir, name), 'utf8')
}

function sliceFn(sql: string, startMark: string, endMark: string) {
  const start = sql.indexOf(startMark)
  assert.ok(start >= 0, startMark)
  const end = sql.indexOf(endMark, start)
  assert.ok(end > start, endMark)
  return sql.slice(start, end)
}

function pinsOwnerLock(body: string, label: string) {
  const staffAt = body.indexOf('if not private.is_staff()')
  const lockAt = body.search(lockClause)
  const countAt = body.search(/select\s+count\(\*\)\s+into\s+v_others/i)
  assert.ok(staffAt >= 0, `${label} staff check`)
  assert.ok(lockAt > staffAt, `${label} lock after staff check`)
  assert.ok(countAt > lockAt, `${label} lock before last-owner count`)
  assert.match(body, /security definer/)
  assert.match(body, /set search_path = ''/)
}

test('operator clear migration exists after the owner gate and does not have to be newest', () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.equal(names.filter((name) => name.startsWith('20261219120000')).length, 1)
  assert.equal(names.includes(migrationName), true)
  assert.ok(names.indexOf(migrationName) > names.indexOf(ownerGateName))

  const sql = readMigration(migrationName)
  const self = readFileSync(fileURLToPath(import.meta.url), 'utf8')
  assert.deepEqual(publicEntityHits(sql), [])
  assert.deepEqual(publicEntityHits(self), [])

  const seed = readMigration(operatorSeedName)
  assert.match(seed, /insert into public\.ai_report_operator/)
  assert.match(seed, /constraint ai_report_operator_cr_not_blank/)
  assert.equal(seed.includes('Board Arabia'), false)

  assert.match(sql, /drop constraint if exists ai_report_operator_cr_not_blank/)
  assert.match(sql, /update public\.ai_report_operator/)
  assert.match(sql, /entity = 'Board Arabia'/)
  assert.match(sql, /cr = ''/)
  assert.match(sql, /alter table public\.ai_report_operator force row level security/)
  assert.match(sql, /if not private\.is_staff\(\) then/)
  assert.equal((sql.match(/security definer/g) ?? []).length, 2)
  assert.equal((sql.match(/set search_path = ''/g) ?? []).length, 2)
  assert.equal((sql.match(/\bfor update\b/g) ?? []).length, 2)
  assert.match(sql, /revoke all on function public\.staff_set_role\(uuid, text\) from public, anon;/)
  assert.match(sql, /grant execute on function public\.staff_set_role\(uuid, text\) to authenticated;/)
  assert.match(sql, /revoke all on function public\.staff_remove\(uuid\) from public, anon;/)
  assert.match(sql, /grant execute on function public\.staff_remove\(uuid\) to authenticated;/)
  assert.equal(/grant\s+(select|all|execute)[^;]*\sto\s+anon\b/i.test(sql), false)
  assert.equal(/grant\s+select\s+on\s+table\s+public\.ai_report_operator/i.test(sql), false)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  assert.equal(/the desk/i.test(sql), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql), false)

  pinsOwnerLock(
    sliceFn(sql, 'function public.staff_set_role', 'function public.staff_remove'),
    'staff_set_role',
  )
  pinsOwnerLock(
    sliceFn(sql, 'function public.staff_remove', 'comment on function public.staff_remove'),
    'staff_remove',
  )
})

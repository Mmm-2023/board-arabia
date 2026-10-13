import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixtureRel = 'supabase/qa/qa-fixture.sql'
const readmeRel = 'supabase/qa/README.md'
const hygieneRel = 'scripts/migration-hygiene.test.ts'

const ROOM_ID = 'c0ffee00-0000-4000-8000-0000000000a1'
const DOC_ID = 'c0ffee00-0000-4000-8000-0000000000a2'
const PARTICIPANT_ID = 'c0ffee00-0000-4000-8000-0000000000a3'
const FIXED_IDS = [ROOM_ID, DOC_ID, PARTICIPANT_ID]

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function insertStatements(sql: string) {
  const out: string[] = []
  const re = /\binsert into\b/gi
  for (const match of sql.matchAll(re)) {
    const start = match.index ?? 0
    const end = sql.indexOf(';', start)
    assert.ok(end > start, 'insert without a semicolon')
    out.push(sql.slice(start, end + 1))
  }
  return out
}

function setsDemoOrFixedId(statement: string) {
  if (FIXED_IDS.some((id) => statement.includes(id))) return true
  return /is_demo\s*=\s*true/.test(statement)
}

test('the QA fixture lives outside migrations', () => {
  assert.equal(existsSync(path.join(root, fixtureRel)), true)
  assert.equal(existsSync(path.join(root, readmeRel)), true)
  assert.equal(existsSync(path.join(root, 'supabase/migrations', path.basename(fixtureRel))), false)
  const migrations = readdirSync(path.join(root, 'supabase/migrations'))
  assert.equal(migrations.includes('qa-fixture.sql'), false)
  assert.equal(migrations.some((name) => name.includes('qa-fixture')), false)
  assert.match(read(readmeRel), /Never point this at a real member/)
})

test('migration hygiene does not treat supabase/qa as a migration', () => {
  const hygiene = read(hygieneRel)
  assert.match(hygiene, /const migrationsDir = path\.join\(root, 'supabase\/migrations'\)/)
  assert.match(hygiene, /for \(const name of readdirSync\(migrationsDir\)\)/)
  assert.equal(hygiene.includes('supabase/qa'), false)
  assert.equal(hygiene.includes('qa-fixture.sql'), false)
  const migrationsDir = path.join(root, 'supabase/migrations')
  assert.equal(readdirSync(migrationsDir).includes('qa-fixture.sql'), false)
})

test('the fixture has the placeholder guard, the demo refusal, and sample inserts only', () => {
  const sql = read(fixtureRel)
  assert.match(sql, /\\set qa_user 00000000-0000-0000-0000-000000000000/)
  assert.match(sql, /qa_user placeholder is unchanged/)
  assert.match(sql, /is_demo = false/)
  assert.match(sql, /refusing to change a member where is_demo = false/)
  assert.match(sql, /refusing to change a room where is_demo = false/)
  assert.match(sql, /QA test room \(Example\)/)
  assert.match(sql, /Example document\.pdf/)
  assert.match(sql, /QA Member \(Example\)/)
  assert.match(sql, /Example Co/)
  assert.match(sql, /qa@example.com/)
  assert.match(sql, /opened_by/)
  assert.match(sql, /'member'/)

  const stripped = sql.replaceAll('qa@example.com', '')
  assert.equal(stripped.includes('@'), false)
  assert.equal(/password/i.test(sql), false)
  assert.equal(sql.includes('service_role'), false)
  assert.equal(sql.includes('sk_'), false)
  assert.equal(sql.includes('iirq'), false)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)

  const liveDeletes = sql.split('\n').filter((line) => /^\s*delete\s+from\b/i.test(line))
  assert.deepEqual(liveDeletes, [])
  assert.match(sql, /-- delete from public\.rooms/)

  const inserts = insertStatements(sql)
  assert.ok(inserts.length >= 5)
  for (const statement of inserts) {
    assert.equal(setsDemoOrFixedId(statement), true, statement.slice(0, 120))
  }
  assert.ok(inserts.some((statement) => statement.includes(ROOM_ID)))
  assert.ok(inserts.some((statement) => statement.includes(DOC_ID)))
  assert.ok(inserts.some((statement) => statement.includes(PARTICIPANT_ID)))
})

test('the member rooms list cannot show this member-opened room', () => {
  const sql = read(fixtureRel)
  const list = read('supabase/migrations/20261002120000_member_deal_rooms.sql')
  const mine = read('supabase/migrations/20261007120000_member_deal_room_reads.sql')
  const roomInsert = insertStatements(sql).find((statement) => statement.includes(ROOM_ID))
  assert.ok(roomInsert)
  assert.match(roomInsert, /'member'/)
  assert.match(roomInsert, /is_demo\s*=\s*true|,\s*\n\s*true,/)
  assert.match(list, /and r\.opened_by = 'admin'/)
  assert.match(list, /and \(r\.is_demo = false or show_demo\)/)
  assert.match(mine, /me\.member_id = actor/)
  assert.match(mine, /me\.invite_status in \('invited', 'accepted'\)/)
})

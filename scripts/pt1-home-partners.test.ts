import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261226120000_home_partner_examples.sql'
const secCName = '20261216120000_sec_c_definer_grants.sql'
const ownerLockName = '20261219120000_operator_row_owner_lock.sql'

function read(name: string) {
  return readFileSync(path.join(migrationsDir, name), 'utf8')
}

test('home partner list follows the category filter and sec-c grants without being newest', () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.equal(names.filter((name) => name.startsWith('20261226120000')).length, 1)
  assert.equal(names.includes(migrationName), true)
  assert.ok(names.indexOf(migrationName) > names.indexOf(secCName))
  assert.ok(names.indexOf(migrationName) > names.indexOf(ownerLockName))

  const sql = read(migrationName)
  assert.match(sql, /set search_path = ''/)
  assert.equal(/search_path\s*=\s*public/i.test(sql), false)
  assert.match(sql, /revoke all on function private\.list_trusted_partners_impl\(\) from public, anon, authenticated, service_role;/)
  assert.match(sql, /revoke execute on function private\.list_trusted_partners_impl\(\) from public;/)
  assert.match(sql, /grant execute on function private\.list_trusted_partners_impl\(\) to anon, authenticated;/)
  assert.equal(/to service_role/.test(sql), false)
  assert.match(sql, /t\.is_demo = true/)
  assert.match(sql, /t\.category_slug is not null/)
  assert.match(sql, /distinct on \(t\.category_slug\)/)
  assert.match(sql, /live\.category_slug = t\.category_slug/)
  assert.match(sql, /private\.is_sponsor\(live\.sponsor_user_id\)/)
  assert.match(sql, /t\.logo_path is not null/)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  assert.equal(/the desk/i.test(sql), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql), false)

  const home = readFileSync(path.join(root, 'src/lib/homeNeeds.ts'), 'utf8')
  assert.match(home, /if \(!category \|\| covered\.has\(category\) \|\| seen\.has\(category\)\) return false/)
  assert.equal(home.includes('return !row.category_slug'), false)
})

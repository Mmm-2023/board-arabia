import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { DEMO_THRESHOLD_DEFAULTS, demoRowsVisible } from '../src/lib/demoThreshold.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const migration = readFileSync(
  path.join(root, 'supabase/migrations/20260929120000_demo_seed_thresholds_redaction.sql'),
  'utf8',
)

test('demos stay only while the real count is below the threshold', () => {
  assert.equal(demoRowsVisible(0, 12), true)
  assert.equal(demoRowsVisible(11, 12), true)
  assert.equal(demoRowsVisible(12, 12), false)
  assert.equal(demoRowsVisible(13, 12), false)
  assert.equal(demoRowsVisible(0, 0), false)
  assert.equal(demoRowsVisible(2, 3), true)
  assert.equal(demoRowsVisible(3, 3), false)
  assert.equal(demoRowsVisible(5, 6), true)
  assert.equal(demoRowsVisible(6, 6), false)
  assert.equal(demoRowsVisible(3, 4), true)
  assert.equal(demoRowsVisible(4, 4), false)
  assert.equal(demoRowsVisible(-1, 12), false)
  assert.equal(demoRowsVisible(1.5, 12), false)
  assert.equal(demoRowsVisible(0, -1), false)
  assert.equal(demoRowsVisible(Number.NaN, 12), false)
})

test('proposed defaults match the single server config', () => {
  const reMigration = readFileSync(
    path.join(root, 'supabase/migrations/20260929230000_real_estate_inventory.sql'),
    'utf8',
  )
  assert.deepEqual(DEMO_THRESHOLD_DEFAULTS, {
    directory: 12,
    mandates: 6,
    rooms: 4,
    partners: 3,
    re_opportunities: 5,
    re_partners: 3,
  })
  assert.match(migration, /directory_real int not null default 12/)
  assert.match(migration, /mandates_real int not null default 6/)
  assert.match(migration, /rooms_real int not null default 4/)
  assert.match(migration, /partners_real int not null default 3/)
  assert.match(migration, /p_real_count </)
  assert.match(migration, /create table if not exists public\.demo_thresholds/)
  assert.match(reMigration, /re_opportunities_real int not null default 5/)
  assert.match(reMigration, /re_partners_real int not null default 3/)
  assert.match(reMigration, /when 'directory' then directory_real/)
  assert.match(reMigration, /when 'mandates' then mandates_real/)
  assert.match(reMigration, /when 'rooms' then rooms_real/)
  assert.match(reMigration, /when 'partners' then partners_real/)
  assert.match(reMigration, /when 're_opportunities' then re_opportunities_real/)
  assert.match(reMigration, /when 're_partners' then re_partners_real/)
  assert.match(reMigration, /p_real_count </)
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(reMigration.includes('\u2014'), false)

  const pages = [
    'src/pages/dashboard/DirectoryPage.tsx',
    'src/pages/dashboard/MandatesPage.tsx',
    'src/pages/dashboard/RoomsPage.tsx',
    'src/components/TrustedPartners.tsx',
  ]
  for (const file of pages) {
    const source = readFileSync(path.join(root, file), 'utf8')
    assert.equal(source.includes('demoRowsVisible'), false, file)
    assert.equal(source.includes('DEMO_THRESHOLD_DEFAULTS'), false, file)
  }
})

test('real counts ignore demo members', () => {
  assert.match(migration, /and is_demo = false/)
  assert.match(migration, /and m\.is_demo = false/)
  assert.match(migration, /is_demo boolean not null default false/)
})

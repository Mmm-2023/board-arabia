import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')

const LEGACY_MIGRATIONS = new Set([
  '20260922190000_staff_master_admin_read.sql',
  '20260923120000_staff_only_admin_lock.sql',
])

/** Already applied. Uses reserved .test mail. Listed by filename. Not rewritten. */
const DEMO_TEST_HOST_MIGRATION = '20260929120000_demo_seed_thresholds_redaction.sql'

const HOST_EXCEPTIONS = new Set([...LEGACY_MIGRATIONS, DEMO_TEST_HOST_MIGRATION])

const emailRe = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const jwtRe = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g

function emailsIn(text: string) {
  emailRe.lastIndex = 0
  return text.match(emailRe) ?? []
}

function jwtsIn(text: string) {
  jwtRe.lastIndex = 0
  return text.match(jwtRe) ?? []
}
const privateKeyRe = /-----BEGIN [A-Z ]*PRIVATE KEY-----/

function read(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function allowedEmailHost(address: string) {
  const host = address.slice(address.lastIndexOf('@') + 1).toLowerCase()
  return host === 'example.com'
}

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      walk(full, out)
      continue
    }
    if (!/\.(sql|ts|tsx|js|mjs|yml|yaml|toml|json|md|html|txt)$/.test(entry)) continue
    if (entry === 'package-lock.json') continue
    out.push(full)
  }
}

test('migrations allow example.com hosts only, with filename exceptions', () => {
  assert.equal(allowedEmailHost('member@example.com'), true)
  assert.equal(allowedEmailHost('member@boardarabia.test'), false)
  assert.equal(allowedEmailHost('member@example.test'), false)
  const hits: string[] = []
  for (const name of readdirSync(migrationsDir)) {
    if (!name.endsWith('.sql')) continue
    if (HOST_EXCEPTIONS.has(name)) continue
    const text = readFileSync(path.join(migrationsDir, name), 'utf8')
    for (const address of emailsIn(text)) {
      if (allowedEmailHost(address)) continue
      const host = address.slice(address.lastIndexOf('@') + 1).toLowerCase()
      hits.push(`${name}:${host}`)
    }
  }
  assert.deepEqual(hits, [])
  for (const name of HOST_EXCEPTIONS) {
    assert.equal(statSync(path.join(migrationsDir, name)).isFile(), true, name)
  }
  const demo = readFileSync(path.join(migrationsDir, DEMO_TEST_HOST_MIGRATION), 'utf8')
  assert.match(demo, /@boardarabia\.test/)
  assert.equal(demo.includes('@example.com'), false)
})

test('source has no private key and no jwt other than the public anon key', () => {
  const pages = read('.github/workflows/pages.yml')
  const anon = pages.match(/VITE_SUPABASE_ANON_KEY:\s*(\S+)/)?.[1] ?? ''
  assert.equal(anon.startsWith('eyJ'), true)
  const files: string[] = []
  walk(root, files)
  const jwtHits: string[] = []
  const keyHits: string[] = []
  for (const full of files) {
    const text = readFileSync(full, 'utf8')
    if (privateKeyRe.test(text)) keyHits.push(path.relative(root, full))
    for (const token of jwtsIn(text)) {
      if (token === anon) continue
      jwtHits.push(path.relative(root, full))
      break
    }
  }
  assert.deepEqual(jwtHits, [])
  assert.deepEqual(keyHits, [])
})

test('dependabot is weekly, grouped, and not auto merged', () => {
  const text = read('.github/dependabot.yml')
  assert.match(text, /package-ecosystem:\s*npm/)
  assert.match(text, /package-ecosystem:\s*github-actions/)
  assert.equal(text.match(/interval:\s*weekly/g)?.length, 2)
  assert.equal(text.match(/open-pull-requests-limit:\s*5/g)?.length, 2)
  assert.match(text, /update-types:[\s\S]*- minor[\s\S]*- patch/)
  assert.equal(/auto-merge|automerge/i.test(text), false)
  assert.equal(text.includes('\u2014'), false)
  assert.equal(text.includes('\u2013'), false)
})

test('retention and intro workflows keep dispatch and have no schedule', () => {
  for (const name of ['retention-sweep.yml', 'suggest-intros.yml']) {
    const text = read(`.github/workflows/${name}`)
    assert.match(text, /workflow_dispatch:/)
    assert.equal(text.includes('cron:'), false, name)
    assert.equal(/\n\s*schedule:/.test(text), false, name)
  }
})

test('apply stays on the legacy route', () => {
  const lines = read('src/App.tsx').split('\n')
  assert.match(lines[97] ?? '', /path="\/apply" element=\{<ApplyPage/)
})

test('new hygiene files carry no address, user id, dash, or nammco', () => {
  const files = [
    '.github/dependabot.yml',
    'supabase/migrations/20261129120000_function_search_path.sql',
    'supabase/migrations/20261129130000_master_admin_user_id.sql',
    'supabase/migrations/20261129140000_due_diligence_file_purge_rls.sql',
    'supabase/migrations/20261129150000_staff_access_log_rpc_only.sql',
  ]
  const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  for (const file of files) {
    const text = read(file)
    assert.deepEqual(emailsIn(text), [], file)
    assert.equal(uuidRe.test(text), false, file)
    assert.equal(/nammco/i.test(text), false, file)
    assert.equal(text.includes('the desk'), false, file)
    assert.equal(text.includes('\u2014'), false, file)
    assert.equal(text.includes('\u2013'), false, file)
  }
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.ok(names.indexOf('20261129120000_function_search_path.sql') > names.indexOf('20261128120000_retention_privacy_audit.sql'))
})

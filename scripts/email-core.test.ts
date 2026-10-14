import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase/migrations')
const migrationName = '20261220120000_email_core.sql'
const priorName = '20261217120000_owner_staff_gate.sql'

const tables = [
  'public.email_categories',
  'public.email_preferences',
  'public.email_consent_log',
  'public.email_suppressions',
  'public.email_campaigns',
  'public.email_sends',
  'public.email_settings',
  'public.email_master_log',
  'private.email_secrets',
]

function readMigration() {
  return readFileSync(path.join(migrationsDir, migrationName), 'utf8')
}

test('email core migration exists and sorts after the owner gate', () => {
  const names = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  assert.equal(names.includes(migrationName), true)
  assert.equal(names.includes(priorName), true)
  assert.ok(names.indexOf(migrationName) > names.indexOf(priorName))
  const sql = readMigration()
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql), false)
  assert.equal(/eyJ|sk_live|service_role_key|BEGIN PRIVATE KEY/i.test(sql), false)
  assert.equal(sql.toLowerCase().includes('the desk'), false)
  assert.equal(/nammco/i.test(sql), false)
  assert.equal(/\bsponsor\b/i.test(sql), false)
  assert.equal(/pg_cron|cron\.schedule|pg_net|net\.http/i.test(sql), false)
  assert.equal(/interval '13 months'/.test(sql), false)
  assert.equal(/purge_expired_consent_log/.test(sql), false)
  assert.match(sql, /master_enabled boolean not null default false/)
  assert.match(sql, /batch_size integer not null default 50/)
  assert.match(sql, /batch_pause_ms integer not null default 1500/)
  assert.match(sql, /'weekly_digest', 'Weekly email', false/)
  assert.match(sql, /'news_invitations', 'News and invitations', true/)
  assert.match(sql, /create trigger members_email_admit_ai/)
  assert.match(sql, /after insert on public\.members/)
  assert.match(sql, /new\.invited_by is not null/)
  assert.match(sql, /grant execute on function public\.email_unsubscribe\(text, text\) to anon, authenticated/)
  assert.match(sql, /revoke all on function private\.email_recipients\(uuid\) from public, anon, authenticated/)
  assert.match(sql, /grant execute on function private\.email_recipients\(uuid\) to service_role/)
  assert.equal(/grant execute on function private\.email_recipients\(uuid\) to anon/.test(sql), false)
  assert.equal(/grant execute on function private\.email_unsub_token\(uuid, text\) to anon/.test(sql), false)
})

test('new tables force rls and do not grant anon or authenticated', () => {
  const sql = readMigration()
  for (const table of tables) {
    assert.match(sql, new RegExp(`alter table ${table.replace('.', '\\.')} enable row level security`))
    assert.match(sql, new RegExp(`alter table ${table.replace('.', '\\.')} force row level security`))
    assert.match(
      sql,
      new RegExp(`revoke all on table ${table.replace('.', '\\.')} from public, anon, authenticated, service_role`),
    )
  }
  const code = sql.replace(/--.*$/gm, '')
  const grants = code.split(';').filter((statement) => /^\s*grant\b/i.test(statement))
  const anonGrants = grants.filter((statement) => /\bto\s+anon\b/i.test(statement))
  assert.equal(anonGrants.length, 1)
  assert.match(anonGrants[0], /email_unsubscribe\(text, text\)/)
  assert.equal(grants.some((statement) => /\bon\s+table\b/i.test(statement)), false)
})

test('every definer pins an empty search_path and backfill does not flip weekly', () => {
  const sql = readMigration()
  const chunks = sql.split(/create or replace function /i).slice(1)
  assert.ok(chunks.length >= 20)
  for (const chunk of chunks) {
    const header = chunk.slice(0, chunk.search(/as\s+\$/i))
    assert.match(header, /security definer/i)
    assert.match(header, /set search_path = ''/)
    assert.equal(/search_path\s*=\s*public/i.test(header), false)
  }
  const backfill = sql.slice(
    sql.indexOf('function private.email_backfill_weekly'),
    sql.indexOf('function private.email_save_preference'),
  )
  assert.match(backfill, /m\.digest_email_opt_in/)
  assert.match(backfill, /on conflict \(user_id, category\) do nothing/)
  assert.equal(/update\s+public\.members/i.test(backfill), false)
  assert.equal(/email_consent_log/.test(backfill), false)
  const admit = sql.slice(
    sql.indexOf('function private.email_apply_admit_defaults'),
    sql.indexOf('function private.email_on_member_admit'),
  )
  assert.match(admit, /category = 'weekly_digest'/)
  assert.match(admit, /'admit_default'/)
  assert.match(admit, /digest_email_opt_in = true/)
  assert.match(admit, /email_consent_log/)
  assert.match(admit, /not cat\.requires_opt_in/)
})

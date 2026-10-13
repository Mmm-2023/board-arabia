import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rel = 'supabase/migrations/20261222120000_cs1_demo_seed_topup.sql'

const TICKET_BANDS = ['$5-10m', '$10-25m', '$25-50m', '$50-100m', '$100m and above']
const PARTNER_SLUGS = [
  'transaction-counsel',
  'financial-due-diligence-and-tax',
  'investment-banking',
  'placement-and-capital-introduction',
  'corporate-finance-advisory',
]
const PORTRAITS = ['muzn', 'sadir', 'shatt', 'wadi']

function read() {
  return readFileSync(path.join(root, rel), 'utf8')
}

function stripLineComments(sql: string) {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
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

function valueRows(statement: string) {
  const valuesAt = statement.search(/\bvalues\b/i)
  assert.ok(valuesAt > 0)
  const body = statement.slice(valuesAt)
  const rows: string[] = []
  let depth = 0
  let start = -1
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]
    if (char === '(') {
      if (depth === 0) start = index
      depth += 1
    } else if (char === ')') {
      depth -= 1
      if (depth === 0 && start >= 0) {
        rows.push(body.slice(start, index + 1))
        start = -1
      }
    }
  }
  return rows.filter((row) => /c5[1-4]00001-/.test(row))
}

test('cs1 seed is data only, idempotent, and labelled as demo', () => {
  const sql = read()
  const live = stripLineComments(sql)
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
  assert.equal(/sponsor/i.test(sql), false)
  assert.equal(/nammco/i.test(sql), false)
  assert.equal(/linkedin/i.test(sql), false)
  assert.equal(/https?:\/\//i.test(sql), false)
  assert.equal(/\bthe desk\b/i.test(sql), false)
  assert.equal(/\b(create|alter|drop|grant|revoke)\b/i.test(live), false)
  assert.equal(/\bpolicy\b/i.test(live), false)
  assert.equal(/^\s*delete\b/im.test(live), false)

  let withoutBands = sql
  for (const band of TICKET_BANDS) withoutBands = withoutBands.replaceAll(band, '')
  assert.equal(/[$£€]/.test(withoutBands), false)
  assert.equal(/\bSAR\b/i.test(sql), false)
  assert.equal(/\bUSD\b/i.test(sql), false)

  const emails = sql.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []
  assert.ok(emails.length > 0)
  for (const email of emails) {
    assert.match(email, /@(boardarabia\.test|example\.com)$/i, email)
  }
  assert.ok(emails.some((email) => email.endsWith('@boardarabia.test')))
  assert.ok(emails.some((email) => email.endsWith('@example.com')))
  assert.equal((sql.match(/@/g) ?? []).length, emails.length)

  const ids = sql.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? []
  assert.equal(ids.length, 19)
  for (const id of ids) {
    assert.match(id, /^c5[1-4]00001-0000-4000-8000-00000000000[1-5]$/)
  }
  assert.equal(ids.filter((id) => id.startsWith('c51')).length, 6)
  assert.equal(ids.filter((id) => id.startsWith('c52')).length, 6)
  assert.equal(ids.filter((id) => id.startsWith('c53')).length, 2)
  assert.equal(ids.filter((id) => id.startsWith('c54')).length, 5)
  assert.equal(new Set(ids.filter((id) => id.startsWith('c51'))).size, 4)
  assert.equal(new Set(ids.filter((id) => id.startsWith('c52'))).size, 4)
  assert.equal(new Set(ids.filter((id) => id.startsWith('c53'))).size, 2)
  assert.equal(new Set(ids.filter((id) => id.startsWith('c54'))).size, 5)

  const inserts = insertStatements(live)
  assert.equal(inserts.length, 4)
  const tables = inserts.map((statement) => statement.match(/insert into\s+public\.(\w+)/i)?.[1])
  assert.deepEqual(tables, ['directory_entries', 'mandates', 'rooms', 'trusted_partners'])
  for (const statement of inserts) {
    assert.match(statement, /\bis_demo\b/)
    assert.match(statement, /on conflict \(id\) do nothing/i)
    const rows = valueRows(statement)
    assert.ok(rows.length > 0)
    for (const row of rows) {
      assert.match(row, /'c5[1-4]00001-[0-9a-f-]+',\s*true\b/)
    }
  }

  assert.equal(sql.split('Example figure, released after intro').length - 1, 4)
  assert.equal(sql.split('Example line').length - 1, 4)
  assert.equal((sql.match(/Opened by admin\./g) ?? []).length, 2)
  for (const slug of PARTNER_SLUGS) {
    assert.equal(sql.split(`'${slug}'`).length - 1, 1, slug)
  }
  for (const portrait of PORTRAITS) {
    const asset = `/demo/portraits/${portrait}.svg`
    assert.equal(sql.includes(`'${asset}'`), true, asset)
    assert.equal(existsSync(path.join(root, 'public', asset)), true, asset)
  }

  const removal = sql.split('\n').filter((line) => line.trim().startsWith('--') && /delete from/i.test(line))
  assert.ok(removal.length >= 4)
  assert.match(sql, /-- Remove CS-1 demo content \(one statement\):/)
  assert.match(sql, /-- with r as \(delete from public\.rooms where is_demo and id::text like 'c53%' returning 1\),/)
  assert.match(sql, /--\s+m as \(delete from public\.mandates where is_demo and id::text like 'c52%' returning 1\),/)
  assert.match(sql, /--\s+d as \(delete from public\.directory_entries where is_demo and id::text like 'c51%' returning 1\)/)
  assert.match(sql, /-- delete from public\.trusted_partners where is_demo and id::text like 'c54%';/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { presentDirectoryCard } from '../src/lib/demoRows.ts'
import {
  LOCKED_PLACEHOLDERS,
  MANDATE_SENSITIVE_KEYS,
  presentMandate,
  sensitiveKeysIn,
} from '../src/lib/mandateRedaction.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const migration = readFileSync(
  path.join(root, 'supabase/migrations/20260929120000_demo_seed_thresholds_redaction.sql'),
  'utf8',
)

const SECRETS = [
  {
    company: 'Nahla Industrial Holding',
    oneLiner: 'Growth capital for a Saudi industrial services platform.',
    amount: 'SAR 68.5 million',
    email: 'amal.desk@boardarabia.test',
  },
  {
    company: 'Waha Care Clinics',
    oneLiner: 'A control stake in a private clinic network along the west coast.',
    amount: 'SAR 142 million enterprise value',
    email: 'huda.desk@boardarabia.test',
  },
  {
    company: 'Qitaf Hospitality Group',
    oneLiner: 'An advisory seat beside a hospitality operator on the Red Sea.',
    amount: 'SAR 9.2 million annual fee',
    email: 'reem.desk@boardarabia.test',
  },
  {
    company: 'Darin Freight Works',
    oneLiner: 'Growth equity for a domestic freight and warehousing platform.',
    amount: 'SAR 51 million',
    email: 'tariq.desk@boardarabia.test',
  },
  {
    company: 'Jabal Minerals',
    oneLiner: 'Project capital for a minerals development in the north.',
    amount: 'SAR 310 million project cost',
    email: 'lama.desk@boardarabia.test',
  },
  {
    company: 'Samn Food Mills',
    oneLiner: 'Growth capital for a packaged food producer serving local supply.',
    amount: 'SAR 44 million',
    email: 'nada.desk@boardarabia.test',
  },
]

function lockedSql() {
  const start = migration.indexOf('-- locked_mandate_json')
  const end = migration.indexOf('-- end_locked_mandate_json')
  assert.ok(start >= 0 && end > start)
  return migration.slice(start, end)
}

test('locked mandate JSON builder has no sensitive fields', () => {
  const body = lockedSql()
  for (const key of MANDATE_SENSITIVE_KEYS) {
    assert.equal(body.includes(key), false, key)
  }
  for (const secret of SECRETS) {
    assert.equal(body.includes(secret.company), false, secret.company)
    assert.equal(body.includes(secret.amount), false, secret.amount)
    assert.equal(body.includes(secret.email), false, secret.email)
  }
  assert.match(body, /'unlocked', false/)
  assert.match(body, /'one_liner', p_one_liner/)
  assert.doesNotMatch(migration, /grant\s+select[\s\S]{0,80}public\.mandates/i)
  assert.match(migration, /revoke all on table public\.mandates from public, anon, authenticated/)
  assert.match(migration, /revoke all on table public\.mandate_intros from public, anon, authenticated/)
})

test('clear one-liners do not carry the company, and the seed stores it server-side', () => {
  for (const secret of SECRETS) {
    assert.equal(migration.includes(secret.company), true, secret.company)
    assert.equal(migration.includes(secret.oneLiner), true, secret.oneLiner)
    assert.equal(secret.oneLiner.toLowerCase().includes(secret.company.toLowerCase()), false)
    assert.equal(secret.oneLiner.includes('@'), false)
    assert.match(secret.email, /@boardarabia\.test$/)
  }
  const emails = migration.match(/[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []
  assert.ok(emails.length >= 8)
  for (const email of emails) {
    assert.match(email, /@boardarabia\.test$/i, email)
  }
})

test('client drops sensitive keys unless that member is approved', () => {
  const secret = SECRETS[0]
  const poisoned = {
    id: 'a2000001-0000-4000-8000-000000000001',
    is_demo: true,
    sector: 'Energy transition',
    deal_type: 'Growth equity',
    ticket_band: '$10-25m',
    geography: 'KSA',
    stage: 'Diligence',
    one_liner: secret.oneLiner,
    unlocked: false,
    intro_status: null,
    company_name: secret.company,
    exact_amount: secret.amount,
    terms: 'One board seat and pro-rata on the next round.',
    contact_name: 'Amal N.',
    contact_email: secret.email,
    contact_phone: 'Room extension 4101',
    deck_url: 'https://files.boardarabia.test/nahla-brief',
    narrative: `${secret.company} stays locked.`,
  }
  const locked = presentMandate(poisoned)
  assert.ok(locked)
  assert.equal(locked.unlocked, false)
  const encoded = JSON.stringify(locked)
  assert.equal(sensitiveKeysIn(locked).length, 0)
  assert.equal(encoded.includes(secret.company), false)
  assert.equal(encoded.includes(secret.amount), false)
  assert.equal(encoded.includes(secret.email), false)
  assert.equal(encoded.includes('Room extension 4101'), false)
  assert.equal(encoded.includes('nahla-brief'), false)
  assert.match(encoded, /Energy transition/)
  assert.match(encoded, /\$10-25m/)
  assert.match(encoded, new RegExp(secret.oneLiner.replace(/[.]/g, '\\.')))

  const open = presentMandate({ ...poisoned, unlocked: true, intro_status: 'approved' })
  assert.equal(open?.unlocked, true)
  if (open?.unlocked) assert.equal(open.company_name, secret.company)

  const half = presentMandate({ ...poisoned, unlocked: true, intro_status: 'pending' })
  assert.equal(half?.unlocked, false)
  assert.equal(JSON.stringify(half).includes(secret.company), false)
})

test('directory cards do not keep an email even if the payload has one', () => {
  const card = presentDirectoryCard({
    id: 'a1000001-0000-4000-8000-000000000001',
    is_demo: true,
    full_name: 'Layla Al-Nadira',
    headline: 'Independent chair',
    company: 'Nadira Family Office',
    location: 'Riyadh',
    sector: 'Energy transition',
    seat: 'ksa',
    portrait_asset: '/demo/portraits/nadira.svg',
    email: 'layla.nadira@boardarabia.test',
    phone: 'Room extension 4101',
  })
  const encoded = JSON.stringify(card)
  assert.equal(encoded.includes('layla.nadira@boardarabia.test'), false)
  assert.equal(encoded.includes('4101'), false)
  assert.equal(card?.portrait_asset, '/demo/portraits/nadira.svg')
  assert.equal(
    presentDirectoryCard({
      id: 'x',
      full_name: 'Layla Al-Nadira',
      seat: 'ksa',
      portrait_asset: 'https://example.com/photo.jpg',
    })?.portrait_asset,
    null,
  )
})

test('locked card source blurs placeholders and does not read sensitive keys', () => {
  const source = readFileSync(path.join(root, 'src/pages/dashboard/MandateCard.tsx'), 'utf8')
  const start = source.indexOf('function LockedBrief')
  const end = source.indexOf('function OpenBrief')
  assert.ok(start >= 0)
  const locked = end > start ? source.slice(start) : source.slice(start)
  const body = end > start ? source.slice(start, end) : locked
  assert.match(body, /mandate-locked-copy/)
  assert.match(body, /aria-hidden="true"/)
  assert.match(body, /LOCKED_PLACEHOLDERS/)
  assert.equal(body.includes('title='), false)
  assert.equal(body.includes('alt='), false)
  for (const key of MANDATE_SENSITIVE_KEYS) {
    assert.equal(body.includes(`mandate.${key}`), false, key)
    assert.equal(body.includes(`'${key}'`), false, key)
  }
  for (const secret of SECRETS) {
    assert.equal(source.includes(secret.company), false)
    assert.equal(source.includes(secret.amount), false)
  }
  assert.equal(Object.values(LOCKED_PLACEHOLDERS).some((line) => line.includes('\u2014')), false)
})

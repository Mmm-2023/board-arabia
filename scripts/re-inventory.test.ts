import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  RE_ASSET_CLASSES,
  RE_CAPITAL_ROLES,
  RE_CITIES,
  RE_PARTNER_KINDS,
  RE_PARTNER_SENSITIVE_KEYS,
  RE_SENSITIVE_KEYS,
  RE_TICKET_BANDS,
  presentReOpportunity,
  presentRePartner,
  reOpportunitySecretsVisible,
  rePartnerSecretsVisible,
  sensitiveKeysIn,
} from '../src/lib/reRedaction.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const migration = readFileSync(
  path.join(root, 'supabase/migrations/20260929230000_real_estate_inventory.sql'),
  'utf8',
)

const OPPORTUNITIES = [
  {
    company: 'Nahla House Works',
    oneLiner: 'Equity for a residential block in Riyadh aimed at end users.',
    terms: 'Observer seat beside the developer. Structure stays in the Nahla House Works brief.',
    email: 'amal.re@example.com',
    phone: 'Desk extension 5101',
  },
  {
    company: 'Qitaf Shore Operator',
    oneLiner: 'An operator role beside a hospitality asset on the Red Sea.',
    terms: 'Operator appointment. The agreement stays in the Qitaf Shore Operator brief.',
    email: 'huda.re@example.com',
    phone: 'Desk extension 5102',
  },
  {
    company: 'Darin Yard Holdings',
    oneLiner: 'A joint venture for logistics yards serving Jeddah freight.',
    terms: 'Joint venture. Governance stays in the Darin Yard Holdings brief.',
    email: 'tariq.re@example.com',
    phone: 'Desk extension 5103',
  },
  {
    company: 'Safi North Land Desk',
    oneLiner: 'Land contributed into a northern land bank beside a giga corridor.',
    terms: 'Land is the contribution. The schedule stays in the Safi North Land Desk brief.',
    email: 'nada.re@example.com',
    phone: 'Desk extension 5104',
  },
  {
    company: 'Rawnaq Office Hold',
    oneLiner: 'A sukuk seat in an office development at Diriyah.',
    terms: 'Sukuk participation. The offering stays in the Rawnaq Office Hold brief.',
    email: 'reem.re@example.com',
    phone: 'Desk extension 5105',
  },
]

const PARTNERS = [
  { name: 'Wahat Title Counsel', email: 'layla.re@example.com', phone: 'Desk extension 5201' },
  { name: 'Manar Valuation Desk', email: 'yusuf.re@example.com', phone: 'Desk extension 5202' },
  { name: 'Qaf Project Ledger', email: 'faisal.re@example.com', phone: 'Desk extension 5203' },
]

function slice(source: string, start: string, end: string): string {
  const from = source.indexOf(start)
  const to = source.indexOf(end)
  assert.ok(from >= 0, start)
  assert.ok(to > from, end)
  return source.slice(from, to)
}

function clearOpportunity(extra: Record<string, unknown> = {}) {
  return {
    id: 'b1000001-0000-4000-8000-000000000001',
    is_demo: true,
    sector: 'Housing',
    city: 'Riyadh',
    asset_class: 'residential',
    capital_role: 'equity',
    ticket_band: '$10-25m',
    one_liner: OPPORTUNITIES[0].oneLiner,
    foreign_ownership_path: 'ready',
    escrow_off_plan: 'ready',
    title_clarity: 'ready',
    white_land_exposure: 'ready',
    unlocked: false,
    access: 'locked',
    intro_status: null,
    ...extra,
  }
}

test('locked opportunity JSON has no counterparty or terms', () => {
  const body = slice(migration, '-- locked_re_opportunity_json', '-- end_locked_re_opportunity_json')
  for (const key of RE_SENSITIVE_KEYS) {
    assert.equal(body.includes(key), false, key)
  }
  for (const row of OPPORTUNITIES) {
    assert.equal(body.includes(row.company), false, row.company)
    assert.equal(body.includes(row.terms), false, row.terms)
    assert.equal(body.includes(row.email), false, row.email)
    assert.equal(body.includes(row.phone), false, row.phone)
  }
  assert.match(body, /'unlocked', false/)
  assert.match(body, /'access', 'locked'/)
  assert.match(body, /'foreign_ownership_path', p_foreign_ownership_path/)
  assert.match(body, /'white_land_exposure', p_white_land_exposure/)
  assert.doesNotMatch(body, /grant\s+select/i)
})

test('a member without an approved intro cannot read counterparty or terms', () => {
  const lockedCall = slice(migration, '-- member_locked_call_begin', '-- member_locked_call_end')
  const feed = slice(migration, '-- member_opportunity_feed_begin', '-- member_opportunity_feed_end')
  for (const key of RE_SENSITIVE_KEYS) {
    assert.equal(lockedCall.includes(key), false, key)
  }
  for (const row of OPPORTUNITIES) {
    assert.equal(lockedCall.includes(row.company), false)
    assert.equal(lockedCall.includes(row.email), false)
  }
  assert.match(lockedCall, /re_opportunity_locked_json/)
  assert.equal(lockedCall.includes('re_opportunity_open_json'), false)
  assert.equal(feed.includes('re_opportunity_inventory_json'), false)
  assert.match(feed, /and i\.member_id = p_member/)
  assert.match(feed, /m\.seat in \('ksa', 'intl'\)/)
  assert.equal(feed.includes("seat = 'sponsor'"), false)
  assert.match(feed, /o\.published/)
  assert.match(feed, /private\.demo_rows_visible\('re_opportunities', real_n\)/)

  const poisoned = clearOpportunity({
    counterparty_name: OPPORTUNITIES[0].company,
    terms: OPPORTUNITIES[0].terms,
    contact_name: 'Amal N.',
    contact_email: OPPORTUNITIES[0].email,
    contact_phone: OPPORTUNITIES[0].phone,
    narrative: `${OPPORTUNITIES[0].company} stays locked.`,
    sponsor_member_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    published: true,
  })
  const locked = presentReOpportunity(poisoned)
  assert.ok(locked)
  assert.equal(locked.unlocked, false)
  assert.equal(reOpportunitySecretsVisible(poisoned), false)
  const encoded = JSON.stringify(locked)
  assert.equal(sensitiveKeysIn(locked, RE_SENSITIVE_KEYS).length, 0)
  assert.equal(encoded.includes(OPPORTUNITIES[0].company), false)
  assert.equal(encoded.includes(OPPORTUNITIES[0].email), false)
  assert.equal(encoded.includes('Desk extension 5101'), false)
  assert.equal(encoded.includes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), false)
  assert.match(encoded, /Housing/)
  assert.match(encoded, /Riyadh/)
  assert.match(encoded, /residential/)
  assert.match(encoded, /\$10-25m/)
  assert.match(encoded, /ready/)

  const pending = presentReOpportunity({ ...poisoned, unlocked: true, access: 'intro', intro_status: 'pending' })
  assert.equal(pending?.unlocked, false)
  assert.equal(JSON.stringify(pending).includes(OPPORTUNITIES[0].company), false)

  const half = presentReOpportunity({ ...poisoned, unlocked: true, access: 'locked', intro_status: 'approved' })
  assert.equal(half?.unlocked, false)
  assert.equal(JSON.stringify(half).includes(OPPORTUNITIES[0].company), false)
})

test('an approved intro unlocks counterparty and terms for that member only', () => {
  const openCall = slice(migration, '-- member_open_call_begin', '-- member_open_call_end')
  assert.match(openCall, /when i\.status = 'approved' then private\.re_opportunity_open_json/)
  for (const key of RE_SENSITIVE_KEYS) {
    assert.equal(openCall.includes(key), true, key)
  }
  assert.match(migration, /left join public\.re_opportunity_intros i/)
  assert.match(migration, /on i\.opportunity_id = o\.id\s+and i\.member_id = p_member/)
  assert.equal(migration.includes("set status = 'approved'"), false)
  const approvals = migration.match(/next_status := 'approved'/g) ?? []
  assert.equal(approvals.length, 1)
  const updates = migration.match(/update public\.re_opportunity_intros/g) ?? []
  assert.equal(updates.length, 1)
  const decide = migration.slice(migration.indexOf('function public.staff_decide_re_opportunity_intro'))
  assert.match(decide, /if not private\.is_staff\(\)/)
  assert.match(decide, /and status = 'pending'/)
  assert.match(decide, /next_status := 'declined'/)
  assert.equal(/create trigger/i.test(migration), false)

  const open = presentReOpportunity(
    clearOpportunity({
      unlocked: true,
      access: 'intro',
      intro_status: 'approved',
      counterparty_name: OPPORTUNITIES[0].company,
      terms: OPPORTUNITIES[0].terms,
      contact_name: 'Amal N.',
      contact_email: OPPORTUNITIES[0].email,
      contact_phone: OPPORTUNITIES[0].phone,
      narrative: 'Unlocked narrative.',
    }),
  )
  assert.equal(open?.unlocked, true)
  if (open?.unlocked && open.access === 'intro') {
    assert.equal(open.counterparty_name, OPPORTUNITIES[0].company)
    assert.equal(open.terms, OPPORTUNITIES[0].terms)
    assert.equal(open.intro_status, 'approved')
  } else {
    assert.fail('expected an intro unlock')
  }
})

test('a sponsor reads only its own surfaces', () => {
  const opportunities = slice(migration, '-- sponsor_opportunities_begin', '-- sponsor_opportunities_end')
  const partners = slice(migration, '-- sponsor_partners_begin', '-- sponsor_partners_end')
  assert.match(opportunities, /m\.seat = 'sponsor'/)
  assert.match(opportunities, /where o\.sponsor_member_id = p_member/)
  assert.match(opportunities, /and o\.is_demo = false/)
  assert.equal(opportunities.includes('re_opportunity_intros'), false)
  assert.equal(opportunities.includes('show_demo'), false)
  assert.equal(opportunities.includes('re_member_opportunity_feed'), false)
  assert.match(partners, /m\.seat = 'sponsor'/)
  assert.match(partners, /t\.is_demo = false/)
  assert.match(partners, /t\.published/)
  assert.match(partners, /t\.category_slug = \(/)
  assert.match(partners, /where s\.member_id = p_member/)
  assert.equal(partners.includes('re_member_partner_feed'), false)

  const router = migration.slice(
    migration.indexOf('function public.list_re_opportunities'),
    migration.indexOf('function public.list_re_partners'),
  )
  const staffAt = router.indexOf('private.is_staff()')
  const sponsorAt = router.indexOf("seat = 'sponsor'")
  const memberAt = router.indexOf("seat in ('ksa', 'intl')")
  assert.ok(staffAt >= 0 && staffAt < sponsorAt && sponsorAt < memberAt)

  const request = migration.slice(
    migration.indexOf('function public.request_re_opportunity_intro'),
    migration.indexOf('function public.staff_list_re_opportunity_intros'),
  )
  assert.match(request, /m\.seat in \('ksa', 'intl'\)/)
  assert.equal(request.includes("seat = 'sponsor'"), false)
  assert.match(request, /return jsonb_build_object\('status', current_status\)/)
  assert.equal(request.includes('counterparty_name'), false)
  assert.equal(request.includes('terms'), false)
})

test('admin and master manage all inventory through staff checks', () => {
  const save = slice(migration, '-- admin_save_opportunity_begin', '-- admin_save_opportunity_end')
  const savePartner = slice(migration, '-- admin_save_partner_begin', '-- admin_save_partner_end')
  const assign = slice(migration, '-- admin_assign_category_begin', '-- admin_assign_category_end')
  const staffList = slice(migration, '-- staff_opportunity_inventory_begin', '-- staff_opportunity_inventory_end')
  assert.ok(save.indexOf('if not private.is_staff()') < save.indexOf('insert into public.re_opportunities'))
  assert.match(save, /raise exception 'demo_locked'/)
  assert.match(save, /raise exception 'invalid_sponsor'/)
  assert.match(save, /m\.seat = 'sponsor'/)
  assert.match(save, /and m\.is_demo = false/)
  assert.equal(save.includes('where o.sponsor_member_id = auth.uid()'), false)
  assert.ok(savePartner.indexOf('if not private.is_staff()') < savePartner.indexOf('insert into public.re_partners'))
  assert.match(savePartner, /'real_estate'/)
  assert.match(savePartner, /raise exception 'demo_locked'/)
  assert.match(assign, /if not private.is_staff\(\)/)
  assert.match(assign, /m\.seat = 'sponsor'/)
  assert.match(assign, /raise exception 'category_taken'/)
  assert.match(staffList, /if not private\.is_staff\(\)/)
  assert.equal(staffList.includes('where o.sponsor_member_id'), false)
  assert.match(staffList, /from public\.re_opportunities o/)

  const intros = migration.slice(migration.indexOf('function public.staff_list_re_opportunity_intros'))
  assert.ok(intros.indexOf('if not private.is_staff()') < intros.indexOf("'counterparty_name'"))

  const owned = presentReOpportunity(
    clearOpportunity({
      unlocked: true,
      access: 'inventory',
      intro_status: null,
      published: false,
      sponsor_member_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      counterparty_name: OPPORTUNITIES[0].company,
      terms: OPPORTUNITIES[0].terms,
      contact_name: 'Amal N.',
      contact_email: OPPORTUNITIES[0].email,
      contact_phone: OPPORTUNITIES[0].phone,
      narrative: 'Sponsor brief.',
    }),
  )
  assert.equal(owned?.access, 'inventory')
  if (owned?.access === 'inventory') {
    assert.equal(owned.counterparty_name, OPPORTUNITIES[0].company)
    assert.equal(owned.sponsor_member_id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    assert.equal(owned.published, false)
  }
})

test('member partner feed hides contacts and stays on the real estate category', () => {
  const locked = slice(migration, '-- locked_re_partner_json', '-- end_locked_re_partner_json')
  const feed = slice(migration, '-- member_partner_feed_begin', '-- member_partner_feed_end')
  for (const key of RE_PARTNER_SENSITIVE_KEYS) {
    assert.equal(locked.includes(key), false, key)
    assert.equal(feed.includes(key), false, key)
  }
  for (const row of PARTNERS) {
    assert.equal(locked.includes(row.email), false)
    assert.equal(feed.includes(row.email), false)
  }
  assert.match(feed, /re_partner_locked_json/)
  assert.equal(feed.includes('re_partner_inventory_json'), false)
  assert.match(feed, /m\.seat in \('ksa', 'intl'\)/)
  assert.match(feed, /private\.demo_rows_visible\('re_partners', real_n\)/)
  assert.match(migration, /constraint re_partners_real_estate check \(category_slug = 'real_estate'\)/)
  assert.match(migration, /insert into public\.sponsor_categories \(slug, name\)/)
  assert.match(migration, /'real_estate', 'Real estate'/)

  const card = presentRePartner({
    id: 'b2000001-0000-4000-8000-000000000001',
    is_demo: true,
    category_slug: 'real_estate',
    name: PARTNERS[0].name,
    kind: 'law',
    city: 'Riyadh',
    blurb: 'Counsel on title questions for a private property brief.',
    unlocked: false,
    access: 'locked',
    contact_name: 'Layla W.',
    contact_email: PARTNERS[0].email,
    contact_phone: PARTNERS[0].phone,
  })
  assert.equal(card?.unlocked, false)
  assert.equal(rePartnerSecretsVisible({ unlocked: false, access: 'locked' }), false)
  const encoded = JSON.stringify(card)
  assert.equal(sensitiveKeysIn(card, RE_PARTNER_SENSITIVE_KEYS).length, 0)
  assert.equal(encoded.includes(PARTNERS[0].email), false)
  assert.equal(encoded.includes('5201'), false)
  assert.match(encoded, /Wahat Title Counsel/)

  const inventory = presentRePartner({
    id: 'b2000001-0000-4000-8000-000000000001',
    is_demo: false,
    category_slug: 'real_estate',
    name: PARTNERS[0].name,
    kind: 'law',
    city: 'Riyadh',
    blurb: 'Counsel on title questions for a private property brief.',
    unlocked: true,
    access: 'inventory',
    published: true,
    contact_name: 'Layla W.',
    contact_email: PARTNERS[0].email,
    contact_phone: PARTNERS[0].phone,
  })
  assert.equal(inventory?.access, 'inventory')
  if (inventory?.access === 'inventory') assert.equal(inventory.contact_email, PARTNERS[0].email)
})

test('tables are revoked, anon cannot list, and tag families are constrained', () => {
  for (const table of [
    'sponsor_categories',
    'sponsor_category_seats',
    're_opportunities',
    're_opportunity_intros',
    're_partners',
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`))
    assert.match(
      migration,
      new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`),
    )
    assert.equal(new RegExp(`grant\\s+select[\\s\\S]{0,120}public\\.${table}`, 'i').test(migration), false)
  }
  assert.equal(/create policy/i.test(migration), false)
  assert.match(migration, /revoke all on function public\.list_re_opportunities\(\) from public, anon/)
  assert.match(migration, /grant execute on function public\.list_re_opportunities\(\) to authenticated/)
  assert.match(migration, /revoke all on function public\.list_re_partners\(\) from public, anon/)
  assert.match(migration, /grant execute on function public\.list_re_partners\(\) to authenticated/)
  assert.equal(/to anon, authenticated/.test(migration), false)
  assert.equal(/grant execute on function public\.list_re_opportunities\(\) to anon/.test(migration), false)
  assert.match(migration, /constraint re_opportunities_demo_unassigned check/)
  assert.match(migration, /is_demo = false or sponsor_member_id is null/)

  for (const value of [
    ...RE_ASSET_CLASSES,
    ...RE_CITIES,
    ...RE_CAPITAL_ROLES,
    ...RE_TICKET_BANDS,
    'designated_zone',
    'saudi_vehicle',
    'not_available',
    'not_stated',
    'in_place',
    'not_off_plan',
    'clear',
    'in_review',
    'none',
    'exposed',
    ...RE_PARTNER_KINDS,
  ]) {
    assert.equal(migration.includes(`'${value}'`), true, value)
  }
})

test('demo seed is fictional, flagged, and stays off the locked payload', () => {
  const seed = slice(migration, '-- demo_seed_begin', '-- demo_seed_end')
  const locked = slice(migration, '-- locked_re_opportunity_json', '-- end_locked_re_opportunity_json')
  assert.match(seed, /is_demo, published/)
  const flags = seed.match(/true, true/g) ?? []
  assert.equal(flags.length, 8)
  for (const row of OPPORTUNITIES) {
    assert.equal(seed.includes(row.company), true, row.company)
    assert.equal(seed.includes(row.oneLiner), true, row.oneLiner)
    assert.equal(seed.includes(row.terms), true)
    assert.equal(row.oneLiner.toLowerCase().includes(row.company.toLowerCase()), false)
    assert.equal(row.oneLiner.includes('@'), false)
    assert.equal(locked.includes(row.company), false)
    assert.match(row.email, /@example\.com$/)
  }
  for (const row of PARTNERS) {
    assert.equal(seed.includes(row.name), true)
    assert.equal(seed.includes(row.email), true)
    assert.match(row.email, /@example\.com$/)
  }
  const emails = migration.match(/[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []
  assert.ok(emails.length >= 8)
  for (const email of emails) assert.match(email, /@example\.com$/i, email)
  for (const banned of ['Knight Frank', 'CBRE', 'JLL', 'Savills', 'Colliers', 'Emaar', 'Dar Al Arkan']) {
    assert.equal(migration.toLowerCase().includes(banned.toLowerCase()), false, banned)
  }
  assert.equal(/\byield\b/i.test(migration), false)
  assert.equal(/\boccupancy\b/i.test(migration), false)
  assert.equal(/\birr\b/i.test(migration), false)
  assert.equal(migration.includes('million'), false)
  assert.equal(migration.includes('%'), false)
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)
  assert.equal(readFileSync(path.join(root, 'src/lib/reRedaction.ts'), 'utf8').includes('\u2014'), false)
})

test('admin alert call site is marked and does not send mail', () => {
  const alert = slice(
    migration,
    'create or replace function private.note_re_intro_admin_alert',
    'revoke all on function private.note_re_intro_admin_alert',
  )
  const request = migration.slice(
    migration.indexOf('function public.request_re_opportunity_intro'),
    migration.indexOf('function public.staff_list_re_opportunity_intros'),
  )
  assert.match(alert, /ADMIN_ALERT_TODO/)
  assert.match(request, /ADMIN_ALERT_TODO call site/)
  assert.match(request, /perform private\.note_re_intro_admin_alert\(new_id\)/)
  assert.match(request, /on conflict \(opportunity_id, member_id\) do nothing/)
  assert.match(request, /'pending'/)
  assert.equal(/gmail|ADMIN_NOTIFY|net\.http|resend|messages\/send/i.test(alert), false)
  assert.equal(/gmail|ADMIN_NOTIFY|net\.http|resend|messages\/send/i.test(request), false)
  assert.equal(alert.includes('status'), false)
})

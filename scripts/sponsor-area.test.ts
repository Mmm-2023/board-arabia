import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { presentDirectoryCard, seatLabel } from '../src/lib/demoRows.ts'
import {
  introStatusLine,
  parsePackageSave,
  PLACEHOLDER_PRICE_NOTE,
  presentSponsorCatalog,
  presentSponsorDesk,
  presentedByLine,
  slotLine,
  SPONSOR_PACKAGE_HEADING,
  sponsorDeskDenied,
  sponsorPackageFace,
} from '../src/lib/sponsorDesk.ts'
import { MEMBER_DESTINATIONS, memberAccountLinks } from '../src/shell/destinations.ts'

const root = new URL('..', import.meta.url)

function source(path: string) {
  return readFileSync(new URL(path, root), 'utf8')
}

const migration = source('supabase/migrations/20261026120000_sponsor_area.sql')

test('sponsor desk drops private fields and keeps package text from the payload', () => {
  const desk = presentSponsorDesk({
    package: {
      slug: 'placeholder_a',
      name: 'Placeholder package A',
      price_label: 'Placeholder',
      is_placeholder: true,
      majlis_slots: 1,
      intro_credits: 2,
      room_credits: 0,
      email: 'secret@example.com',
    },
    category: { slug: 'real_estate', name: 'Real estate' },
    majlis: {
      entitled: 99,
      used: 1,
      events: [
        {
          id: '10000000-0000-4000-8000-0000000000aa',
          title: 'Salon secret@example.com',
          starts_at: '2026-09-27T09:27:00.000Z',
          ends_at: '2026-09-27T11:29:00.000Z',
          region: 'Riyadh',
          presented_by: 'Example House',
          status: 'published',
          venue_address: 'Gate 4',
        },
      ],
    },
    intros: { approved: 1, pending: 0, declined: 0 },
    credits: { intro_entitled: 9, intro_used: 1, room_entitled: 9, room_used: 0, email: 'other@example.com' },
  })
  assert.ok(desk)
  assert.equal(desk.package?.name, 'Placeholder package A')
  assert.equal(desk.package?.price_label, 'Placeholder')
  assert.equal(desk.package?.is_placeholder, true)
  assert.equal(desk.majlis.entitled, 1)
  assert.equal(desk.credits?.intro_entitled, 2)
  assert.equal(desk.credits?.room_entitled, 0)
  assert.equal(desk.majlis.events[0]?.title, 'Salon')
  assert.equal(desk.majlis.events[0]?.presented_by, 'Example House')
  const encoded = JSON.stringify(desk)
  assert.equal(encoded.includes('secret@example.com'), false)
  assert.equal(encoded.includes('other@example.com'), false)
  assert.equal(encoded.includes('Gate 4'), false)
  assert.equal(presentedByLine('Example House'), 'Presented by Example House')
  assert.equal(presentedByLine('bad@example.com'), null)
  assert.equal(slotLine(1, 2), '1 of 2 used')
  assert.equal(slotLine(0, null), 'No package on this seat yet.')
  assert.equal(introStatusLine(1, 0, 0), '1 approved, 0 waiting, 0 not approved.')
  assert.equal(sponsorDeskDenied('not_allowed'), true)
  assert.equal(PLACEHOLDER_PRICE_NOTE.includes('not locked'), true)
})

test('sponsors never see placeholder package names or prices', () => {
  const placeholder = sponsorPackageFace({
    slug: 'placeholder_a',
    name: 'Placeholder package A',
    price_label: 'Placeholder',
    is_placeholder: true,
    majlis_slots: 1,
    intro_credits: 2,
    room_credits: 0,
  })
  assert.equal(placeholder.kind, 'open')
  if (placeholder.kind === 'open') assert.equal(placeholder.heading, SPONSOR_PACKAGE_HEADING)
  assert.equal(JSON.stringify(placeholder).includes('Placeholder package A'), false)
  assert.equal(JSON.stringify(placeholder).includes('Placeholder'), false)

  const unset = sponsorPackageFace({
    slug: 'seat_one',
    name: 'Seat one',
    price_label: 'Placeholder',
    is_placeholder: false,
    majlis_slots: 1,
    intro_credits: 0,
    room_credits: 0,
  })
  assert.equal(unset.kind, 'open')

  const live = sponsorPackageFace({
    slug: 'seat_one',
    name: 'Founding partner',
    price_label: 'Set with the desk',
    is_placeholder: false,
    majlis_slots: 2,
    intro_credits: 4,
    room_credits: 1,
  })
  assert.deepEqual(live, { kind: 'set', name: 'Founding partner', price: 'Set with the desk' })

  const view = source('src/pages/dashboard/SponsorshipView.tsx')
  const home = source('src/pages/dashboard/DashboardHome.tsx')
  const staff = source('src/pages/admin/SponsorPackagesPanel.tsx')
  assert.equal(view.includes(PLACEHOLDER_PRICE_NOTE), false)
  assert.equal(view.includes('Placeholder package'), false)
  assert.match(view, /sponsorPackageFace/)
  assert.match(home, /Your sponsorship/)
  assert.equal(home.includes('Placeholder package'), false)
  assert.match(staff, /PLACEHOLDER_PRICE_NOTE/)
})

test('package drafts reject prices baked into code and keep staff text', () => {
  const bad = parsePackageSave({
    slug: 'A',
    name: 'Placeholder package A',
    priceLabel: 'Placeholder',
    majlisSlots: '1',
    introCredits: '2',
    roomCredits: '0',
    active: true,
    isPlaceholder: true,
  })
  assert.equal(bad.ok, false)
  const email = parsePackageSave({
    slug: 'placeholder_a',
    name: 'Desk desk@example.com',
    priceLabel: 'Placeholder',
    majlisSlots: '1',
    introCredits: '2',
    roomCredits: '0',
    active: true,
    isPlaceholder: true,
  })
  assert.equal(email.ok, false)
  const saved = parsePackageSave({
    slug: 'Placeholder_A',
    name: 'Placeholder package A',
    priceLabel: 'Placeholder',
    majlisSlots: '1',
    introCredits: '2',
    roomCredits: '0',
    active: true,
    isPlaceholder: true,
  })
  assert.equal(saved.ok, true)
  if (saved.ok) {
    assert.equal(saved.value.slug, 'placeholder_a')
    assert.equal(saved.value.price_label, 'Placeholder')
  }
})

test('directory cards mark sponsor seats as preferred partners without an email', () => {
  const card = presentDirectoryCard({
    id: '10000000-0000-4000-8000-0000000000bb',
    is_demo: false,
    full_name: 'Amal Al-Bayt',
    headline: 'Sponsor',
    company: 'Example House',
    location: 'Riyadh',
    sector: 'Energy transition',
    seat: 'sponsor',
    email: 'amal@example.com',
    phone: '5551212',
  })
  assert.equal(card?.seat, 'sponsor')
  assert.equal(card?.preferred_partner, true)
  assert.equal(seatLabel('sponsor'), 'Sponsor')
  const encoded = JSON.stringify(card)
  assert.equal(encoded.includes('amal@example.com'), false)
  assert.equal(encoded.includes('5551212'), false)
  assert.equal(
    presentDirectoryCard({
      id: '10000000-0000-4000-8000-0000000000cc',
      full_name: 'Layla Al-Nadira',
      seat: 'ksa',
      preferred_partner: false,
    })?.preferred_partner,
    false,
  )
})

test('sponsor catalog keeps staff email on the roster and not on the public desk shape', () => {
  const catalog = presentSponsorCatalog({
    packages: [
      {
        slug: 'placeholder_a',
        name: 'Placeholder package A',
        price_label: 'Placeholder',
        is_placeholder: true,
        majlis_slots: 1,
        intro_credits: 2,
        room_credits: 0,
        sort_order: 1,
        active: true,
      },
    ],
    categories: [{ slug: 'real_estate', name: 'Real estate' }],
    sponsors: [
      {
        user_id: '10000000-0000-4000-8000-0000000000dd',
        email: 'sponsor@example.com',
        status: 'active',
        label: 'Example House',
        package_slug: 'placeholder_a',
        category_slug: 'real_estate',
        category_name: 'Real estate',
      },
    ],
    presented_by: [
      {
        event_id: '10000000-0000-4000-8000-0000000000aa',
        member_id: '10000000-0000-4000-8000-0000000000dd',
      },
    ],
  })
  assert.equal(catalog?.sponsors[0]?.email, 'sponsor@example.com')
  assert.equal(catalog?.presented_by[0]?.member_id, '10000000-0000-4000-8000-0000000000dd')
  assert.equal(JSON.stringify(catalog).includes('not_a_secret'), false)
})

test('sponsorship stays off the five tabs and the migration is sponsor scoped', () => {
  assert.equal(MEMBER_DESTINATIONS.length, 5)
  assert.deepEqual(
    MEMBER_DESTINATIONS.map((item) => item.label),
    ['Home', 'Deals', 'People', 'Majlis', 'AI tools'],
  )
  assert.equal(memberAccountLinks('intl').some((item) => item.id === 'sponsorship'), false)
  assert.equal(memberAccountLinks('sponsor').some((item) => item.to === '/dashboard/sponsorship'), true)

  assert.match(migration, /presented_by_member_id/)
  assert.match(migration, /sponsor_packages/)
  assert.match(migration, /Placeholder package A/)
  assert.match(migration, /on conflict \(slug\) do nothing/)
  assert.match(migration, /is_placeholder/)
  assert.match(migration, /revoke all on table public\.sponsor_packages from public, anon, authenticated/)
  assert.match(migration, /revoke all on table public\.sponsor_seat_packages from public, anon, authenticated/)
  assert.match(migration, /if not private\.is_staff\(\) then/)
  assert.match(migration, /raise exception 'not_allowed'/)
  assert.match(migration, /m\.seat = 'sponsor'/)
  assert.match(migration, /preferred_partner/)
  assert.match(migration, /m\.seat in \('ksa', 'intl', 'sponsor'\)/)
  assert.equal(migration.includes('p.phone'), false)
  assert.equal(migration.includes('p.bio'), false)
  assert.equal(migration.includes('p.linkedin'), false)
  assert.equal(migration.includes('investable'), false)
  assert.equal(/create\s+(or\s+replace\s+)?(materialized\s+)?view\b/i.test(migration), false)
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)
  assert.equal(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(migration), false)
  assert.equal(/https?:\/\//i.test(migration), false)
  assert.equal(/eyJ|sk_live|service_role|BEGIN PRIVATE KEY/i.test(migration), false)

  const deskFn = migration.slice(migration.indexOf('function public.sponsor_desk()'))
  const deskBody = deskFn.slice(0, deskFn.indexOf('revoke all on function public.sponsor_desk()'))
  assert.equal(deskBody.includes('m.email'), false)
  assert.match(deskBody, /auth\.uid\(\)/)
  assert.equal(deskBody.includes('mandate company'), false)

  const app = source('src/App.tsx')
  assert.match(app, /path="sponsorship"/)
  const directory = source('src/pages/dashboard/DirectoryBoard.tsx')
  assert.match(directory, /preferred_partner/)
  assert.match(directory, /<SponsorBadge \/>/)
  const presented = source('src/components/PresentedBy.tsx')
  assert.match(presented, /presentedByLine/)
  assert.match(source('src/lib/sponsorDesk.ts'), /Presented by \$\{name\}/)
  assert.match(source('src/components/MajlisCardTitle.tsx'), /<PresentedBy/)
  const majlis = source('src/pages/dashboard/MajlisPage.tsx')
  assert.equal(majlis.includes('Presenting:'), false)
  const view = source('src/pages/dashboard/SponsorshipView.tsx')
  const packages = source('src/pages/admin/SponsorPackagesPanel.tsx')
  assert.equal(view.includes('Placeholder package'), false)
  assert.equal(/\$\d|SAR \d|USD \d/.test(view + packages), false)
  const home = source('src/pages/dashboard/DashboardHome.tsx')
  assert.match(home, /member\.seat === 'sponsor'/)
  assert.match(home, /\/dashboard\/sponsorship/)
  const layout = source('src/pages/dashboard/DashboardLayout.tsx')
  assert.match(layout, /memberAccountLinks\(gate\.room\.member\.seat\)/)
})

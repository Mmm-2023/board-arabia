import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { presentDirectoryCard } from '../src/lib/demoRows.ts'
import {
  DIRECTORY_SEAT_OPTIONS,
  EMPTY_DIRECTORY_FILTERS,
  directoryFiltersActive,
  directorySectorOptions,
  filterDirectory,
} from '../src/lib/directoryFilters.ts'
import {
  EMPTY_MANDATE_FILTERS,
  filterMandates,
  mandateFilterChoices,
  mandateFiltersActive,
} from '../src/lib/mandateFilters.ts'
import type { MandateCardModel } from '../src/lib/mandateRedaction.ts'
import {
  MAX_PROFILE_TAGS,
  SAMPLE_DIRECTORY_TAGS,
  SECTOR_TAGS,
  VISION_2030_THEMES,
  availabilityLabel,
  isAvailability,
  normalizeTags,
  toggleTag,
} from '../src/lib/profileTags.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function source(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function card(raw: Record<string, unknown>) {
  const parsed = presentDirectoryCard({
    id: 'a1000001-0000-4000-8000-000000000001',
    is_demo: true,
    full_name: 'Layla Al-Nadira',
    headline: 'Independent chair',
    company: 'Nadira Family Office',
    location: 'Riyadh',
    sector: 'Energy transition',
    seat: 'ksa',
    ...raw,
  })
  assert.ok(parsed)
  return parsed
}

function mandate(sector: string, ticket: string, geography: string): MandateCardModel {
  return {
    id: `${sector}-${ticket}-${geography}`,
    is_demo: true,
    sector,
    deal_type: 'Growth equity',
    ticket_band: ticket,
    geography,
    stage: 'Diligence',
    one_liner: 'A clear public line with no private names.',
    unlocked: false,
    intro_status: null,
  }
}

test('tags stay on the allowlist and stop at three', () => {
  assert.equal(isAvailability('open'), true)
  assert.equal(isAvailability('busy'), false)
  assert.equal(availabilityLabel('at_capacity'), 'At capacity')
  assert.deepEqual(normalizeTags([' Health ', 'Health', 'Not a sector', 'Tourism'], SECTOR_TAGS), ['Health', 'Tourism'])
  assert.equal(normalizeTags(['Health', 'Tourism', 'Mining', 'Logistics'], SECTOR_TAGS).length, MAX_PROFILE_TAGS)
  const full = toggleTag(['Health', 'Tourism', 'Mining'], 'Logistics', SECTOR_TAGS)
  assert.equal(full.limited, true)
  assert.deepEqual(full.next, ['Health', 'Tourism', 'Mining'])
  const removed = toggleTag(full.next, 'Tourism', SECTOR_TAGS)
  assert.equal(removed.limited, false)
  assert.deepEqual(removed.next, ['Health', 'Mining'])
  assert.equal(toggleTag(['Health'], 'http://evil.example', SECTOR_TAGS).next.length, 1)
})

test('directory cards keep tags and drop private fields', () => {
  const parsed = presentDirectoryCard({
    id: 'a1000001-0000-4000-8000-000000000002',
    is_demo: false,
    full_name: 'Noura Al-Wahat',
    headline: 'Non-executive director',
    company: 'Wahat Counsel',
    location: 'Jeddah',
    sector: 'Health',
    sectors: ['Health', 'Health', 'Not real', 'Tourism'],
    vision_themes: ['Health transformation', 'Click http://evil.example'],
    availability: 'selective',
    seat: 'ksa',
    email: 'noura@example.com',
    phone: '5551212',
  })
  assert.ok(parsed)
  assert.deepEqual(parsed.sectors, ['Health', 'Tourism'])
  assert.deepEqual(parsed.vision_themes, ['Health transformation'])
  assert.equal(parsed.availability, 'selective')
  const encoded = JSON.stringify(parsed)
  assert.equal(encoded.includes('noura@example.com'), false)
  assert.equal(encoded.includes('5551212'), false)
  assert.equal(encoded.includes('evil.example'), false)
  assert.equal(presentDirectoryCard({
    id: 'a1000001-0000-4000-8000-000000000003',
    full_name: 'Hanan Al-Safi',
    sector: 'Tourism',
    seat: 'ksa',
    availability: 'busy',
  })?.availability, null)
})

test('directory search and filters combine', () => {
  const rows = [
    card({ id: 'a1000001-0000-4000-8000-000000000001', availability: 'open', vision_themes: ['Renewable energy'] }),
    card({
      id: 'a1000001-0000-4000-8000-000000000002',
      full_name: 'Noura Al-Wahat',
      company: 'Wahat Counsel',
      location: 'Jeddah',
      sector: 'Health',
      sectors: ['Health'],
      vision_themes: ['Health transformation'],
      availability: 'selective',
      seat: 'ksa',
    }),
    card({
      id: 'a1000001-0000-4000-8000-000000000006',
      full_name: 'Omar Al-Janub',
      company: 'Janub Board Practice',
      location: 'Abha',
      sector: 'Mining',
      sectors: ['Mining'],
      availability: 'open',
      seat: 'intl',
    }),
    card({
      id: 'a1000001-0000-4000-8000-000000000004',
      full_name: 'Maha Al-Rawnaq',
      sector: 'Financial services',
      sectors: ['Financial services'],
      availability: 'at_capacity',
      seat: 'ksa',
    }),
  ]
  assert.equal(directoryFiltersActive(EMPTY_DIRECTORY_FILTERS), false)
  assert.equal(filterDirectory(rows, EMPTY_DIRECTORY_FILTERS).length, 4)
  assert.deepEqual(
    filterDirectory(rows, { ...EMPTY_DIRECTORY_FILTERS, seat: 'intl' }).map((item) => item.full_name),
    ['Omar Al-Janub'],
  )
  assert.equal(filterDirectory(rows, { ...EMPTY_DIRECTORY_FILTERS, sector: 'Health' }).length, 1)
  assert.equal(filterDirectory(rows, { ...EMPTY_DIRECTORY_FILTERS, availability: 'at_capacity' }).length, 1)
  assert.equal(filterDirectory(rows, { ...EMPTY_DIRECTORY_FILTERS, query: 'jeddah health' }).length, 1)
  assert.equal(filterDirectory(rows, { ...EMPTY_DIRECTORY_FILTERS, query: 'at_capacity' }).length, 0)
  assert.equal(filterDirectory(rows, { ...EMPTY_DIRECTORY_FILTERS, query: 'capacity' })[0]?.full_name, 'Maha Al-Rawnaq')
  assert.equal(
    filterDirectory(rows, { query: 'open', seat: 'intl', sector: 'Mining', availability: 'open' }).length,
    1,
  )
  assert.deepEqual(directorySectorOptions(rows).slice(0, 2), ['Energy transition', 'Health'])
  assert.deepEqual(
    DIRECTORY_SEAT_OPTIONS.map((option) => option.label),
    ['Saudi Arabia', 'International'],
  )
})

test('mandate filters follow sector, size, and geography', () => {
  const rows = [
    mandate('Health', '$25-50m', 'GCC'),
    mandate('Energy transition', '$10-25m', 'KSA'),
    mandate('Levant desks', '$5-10m', 'Levant'),
  ]
  assert.equal(mandateFiltersActive(EMPTY_MANDATE_FILTERS), false)
  assert.deepEqual(
    filterMandates(rows, { sector: 'Health', size: null, geography: null }).map((item) => item.sector),
    ['Health'],
  )
  assert.equal(filterMandates(rows, { sector: null, size: '$10-25m', geography: 'GCC' }).length, 0)
  assert.equal(filterMandates(rows, { sector: null, size: '$5-10m', geography: null }).length, 1)
  const choices = mandateFilterChoices(rows)
  assert.deepEqual(choices.sector.slice(0, 2), ['Energy transition', 'Health'])
  assert.equal(choices.sector.includes('Levant desks'), true)
  assert.deepEqual(choices.geography, ['KSA', 'GCC', 'Levant'])
  assert.deepEqual(choices.size, ['$5-10m', '$10-25m', '$25-50m'])
})

test('profile tag migration keeps own-row writes and the sample directory', () => {
  const migration = source('supabase/migrations/20261012120000_profile_tags_availability.sql')
  const original = source('supabase/migrations/20260922170000_wave1_members_profiles.sql')
  assert.match(original, /user_id = auth\.uid\(\)/)
  assert.equal(migration.includes('create policy profiles_update_own'), false)
  assert.match(migration, /grant select \(availability, sector_tags, vision_themes\)/)
  assert.match(migration, /grant update \(availability, sector_tags, vision_themes\)/)
  assert.equal(/grant\s+[^;]*\bto\s+anon\b/i.test(migration), false)
  assert.match(migration, /profiles_availability_check/)
  assert.match(migration, /profiles_sector_tags_ok/)
  assert.match(migration, /private\.profile_tags_allowed\(sector_tags, private\.profile_sector_tags\(\), 3\)/)
  assert.match(migration, /private\.profile_tags_allowed\(vision_themes, private\.profile_vision_themes\(\), 3\)/)
  assert.match(migration, /'sector', coalesce\(p\.sector_tags\[1\], ''\)/)
  assert.match(migration, /'vision_themes', coalesce\(to_jsonb\(p\.vision_themes\), '\[\]'::jsonb\)/)
  assert.match(migration, /'availability', p\.availability/)
  assert.equal(migration.includes('p.phone'), false)
  assert.equal(migration.includes('p.bio'), false)
  assert.equal(migration.includes('d.email'), false)
  assert.equal(/delete\s+from\s+public\.(majlis|mandate_intros)/i.test(migration), false)
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)
  assert.equal(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(migration), false)
  assert.equal(/https?:\/\//i.test(migration), false)
  assert.equal(/eyJ|sk_live|service_role_key|BEGIN PRIVATE KEY/i.test(migration), false)
  for (const tag of SECTOR_TAGS) assert.ok(migration.includes(`'${tag}'`), tag)
  for (const theme of VISION_2030_THEMES) assert.ok(migration.includes(`'${theme}'`), theme)
  const updates = migration.split('update public.directory_entries').slice(1)
  assert.equal(updates.length, SAMPLE_DIRECTORY_TAGS.length)
  for (const row of SAMPLE_DIRECTORY_TAGS) {
    const block = updates.find((item) => item.includes(row.id))
    assert.ok(block, row.id)
    assert.match(block, new RegExp(`availability = '${row.availability}'`))
    for (const theme of row.themes) assert.ok(block.includes(`'${theme}'`), theme)
  }
  const types = source('src/lib/database.types.ts')
  assert.match(types, /availability: 'open' \| 'selective' \| 'at_capacity' \| null/)
  assert.match(types, /sector_tags: string\[\]/)
  assert.match(types, /vision_themes: string\[\]/)
})

test('profile, directory, and mandates screens expose the new controls', () => {
  const files = [
    'src/lib/profileTags.ts',
    'src/lib/directoryFilters.ts',
    'src/lib/mandateFilters.ts',
    'src/pages/dashboard/ProfilePage.tsx',
    'src/pages/dashboard/ProfileTagFields.tsx',
    'src/pages/dashboard/DirectoryBoard.tsx',
    'src/pages/dashboard/MandatesBoard.tsx',
    'src/pages/dashboard/MemberFilters.tsx',
    'supabase/migrations/20261012120000_profile_tags_availability.sql',
  ]
  for (const file of files) {
    const text = source(file)
    assert.equal(text.includes('\u2014'), false, file)
    assert.equal(text.includes('\u2013'), false, file)
    const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []
    for (const email of emails) assert.match(email, /@example\.com$/i, `${file} ${email}`)
  }
  const profile = source('src/pages/dashboard/ProfilePage.tsx')
  assert.match(profile, /sector_tags: sectors/)
  assert.match(profile, /vision_themes: themes/)
  assert.match(profile, /ProfileTagFields/)
  assert.match(source('src/pages/dashboard/ProfileTagFields.tsx'), /Vision 2030/)
  assert.match(source('src/pages/dashboard/ProfileTagFields.tsx'), /At capacity/)
  const directory = source('src/pages/dashboard/DirectoryBoard.tsx')
  assert.match(directory, /id="directory-search"/)
  assert.match(directory, /Saudi or International/)
  assert.match(directory, /AvailabilityMark/)
  assert.match(directory, /Vision 2030/)
  const mandates = source('src/pages/dashboard/MandatesBoard.tsx')
  assert.match(mandates, /label="Sector"/)
  assert.match(mandates, /label="Size"/)
  assert.match(mandates, /label="Geography"/)
  assert.match(source('src/pages/dashboard/MandatesPage.tsx'), /MandatesBoard/)
  assert.match(source('src/shell/destinations.ts'), /label: 'Home'/)
  assert.match(source('src/shell/destinations.ts'), /label: 'AI tools'/)
})

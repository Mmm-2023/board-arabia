import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  MEMBER_DESTINATIONS,
  MEMBER_SECONDARY,
  STAFF_DESTINATIONS,
  STAFF_SECONDARY,
  formatUpdated,
  shellSectionTitle,
} from '../src/shell/destinations.ts'
import { MEMBER_VIEWS, STAFF_VIEWS } from '../src/shell/viewCopy.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

test('member primaries stay in the locked order', () => {
  assert.deepEqual(
    MEMBER_DESTINATIONS.map((item) => item.label),
    ['Home', 'Directory', 'Mandates', 'Network', 'Profile'],
  )
  assert.deepEqual(
    MEMBER_DESTINATIONS.map((item) => item.to),
    [
      '/dashboard',
      '/dashboard/directory',
      '/dashboard/mandates',
      '/dashboard/network',
      '/dashboard/profile',
    ],
  )
  assert.equal(MEMBER_DESTINATIONS.length, 5)
  assert.equal(MEMBER_DESTINATIONS[0]?.end, true)
})

test('staff primaries stay in the locked order', () => {
  assert.deepEqual(
    STAFF_DESTINATIONS.map((item) => item.label),
    ['Home', 'Applications', 'People', 'Capacity', 'Settings'],
  )
  assert.deepEqual(
    STAFF_DESTINATIONS.map((item) => item.to),
    ['/admin', '/admin/applications', '/admin/people', '/admin/capacity', '/admin/settings'],
  )
  assert.equal(STAFF_DESTINATIONS.length, 5)
  assert.equal(STAFF_DESTINATIONS[0]?.end, true)
})

test('secondary links are not a sixth primary', () => {
  const memberLabels = new Set(MEMBER_DESTINATIONS.map((item) => item.label))
  const staffLabels = new Set(STAFF_DESTINATIONS.map((item) => item.label))
  for (const item of MEMBER_SECONDARY) assert.equal(memberLabels.has(item.label), false)
  for (const item of STAFF_SECONDARY) assert.equal(staffLabels.has(item.label), false)
  assert.deepEqual(
    MEMBER_SECONDARY.map((item) => item.label),
    ['AI Due Diligence', 'Majlis', 'Rooms', 'Help'],
  )
  assert.deepEqual(
    STAFF_SECONDARY.map((item) => item.label),
    ['Majlis', 'Email'],
  )
})

test('section title follows the active destination', () => {
  assert.equal(shellSectionTitle('/dashboard', MEMBER_DESTINATIONS, MEMBER_SECONDARY), 'Home')
  assert.equal(
    shellSectionTitle('/dashboard/network', MEMBER_DESTINATIONS, MEMBER_SECONDARY),
    'Network',
  )
  assert.equal(shellSectionTitle('/dashboard/majlis', MEMBER_DESTINATIONS, MEMBER_SECONDARY), 'Majlis')
  assert.equal(
    shellSectionTitle('/dashboard/due-diligence', MEMBER_DESTINATIONS, MEMBER_SECONDARY),
    'AI Due Diligence',
  )
  assert.equal(
    shellSectionTitle(
      '/dashboard/due-diligence/11111111-1111-4111-8111-111111111111',
      MEMBER_DESTINATIONS,
      MEMBER_SECONDARY,
    ),
    'AI Due Diligence',
  )
  assert.equal(shellSectionTitle('/admin/applications', STAFF_DESTINATIONS, STAFF_SECONDARY), 'Applications')
  assert.equal(shellSectionTitle('/admin/email', STAFF_DESTINATIONS, STAFF_SECONDARY), 'Email')
  assert.equal(shellSectionTitle('/admin/majlis', STAFF_DESTINATIONS, STAFF_SECONDARY), 'Majlis')
})

test('updated label has no em dash', () => {
  const label = formatUpdated(new Date('2026-09-23T09:05:00Z'))
  assert.match(label || '', /^Updated /)
  assert.equal((label || '').includes('\u2014'), false)
})

test('state copy matches the brief and has no em dash', () => {
  assert.equal(MEMBER_VIEWS.home.empty, "You're in. Finish profile to unlock Directory.")
  assert.equal(MEMBER_VIEWS.home.emptyCta, 'Complete profile')
  assert.match(MEMBER_VIEWS.home.error, /Couldn't refresh/)
  assert.equal(MEMBER_VIEWS.directory.empty, 'No peers yet. Founding 100 is filling.')
  assert.equal(MEMBER_VIEWS.directory.emptyBeforeAdmit, 'Directory unlocks after admit.')
  assert.equal(MEMBER_VIEWS.directory.filtered, 'No matches. Clear filters.')
  assert.match(MEMBER_VIEWS.mandates.empty, /No mandates yet/)
  assert.equal(MEMBER_VIEWS.network.invites, 'You have 2 peer invites.')
  assert.equal(MEMBER_VIEWS.network.intros, 'No intro requests yet.')
  assert.equal(STAFF_VIEWS.home.empty, 'No pending applications.')
  assert.equal(STAFF_VIEWS.applications.filtered, 'No applications in this filter.')
  assert.equal(STAFF_VIEWS.people.empty, 'No members yet. Admit from Applications.')
  assert.match(STAFF_VIEWS.people.denied, /cannot open full member records/)
  assert.match(STAFF_VIEWS.capacity.early, /Aggregates appear after verified opted-in admits/)
  assert.match(STAFF_VIEWS.settings.booking, /not shown on this page/)
  const blob = JSON.stringify({ MEMBER_VIEWS, STAFF_VIEWS })
  assert.equal(blob.includes('\u2014'), false)
  assert.equal(/calendar\.app\.google/i.test(blob), false)
  assert.equal(/nammco/i.test(blob), false)
})

test('product shell files have no em dash', () => {
  const files = walk(path.join(root, 'src', 'shell')).concat(
    walk(path.join(root, 'src', 'pages', 'dashboard')),
    walk(path.join(root, 'src', 'pages', 'admin')),
  )
  assert.ok(files.length > 10)
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    assert.equal(text.includes('\u2014'), false, file)
    assert.equal(/calendar\.app\.google/i.test(text), false, file)
    assert.equal(/nammco/i.test(text), false, file)
  }
  const html = readFileSync(path.join(root, 'index.html'), 'utf8')
  assert.match(html, /viewport-fit=cover/)
  const css = readFileSync(path.join(root, 'src', 'index.css'), 'utf8')
  assert.match(css, /safe-area-inset-top/)
  assert.match(css, /safe-area-inset-bottom/)
  assert.match(css, /--ba-tab-bar-height/)
  assert.match(css, /padding-bottom:\s*calc\(var\(--ba-tab-bar-height,\s*56px\)\s*\+\s*env\(safe-area-inset-bottom,\s*0px\)\s*\+\s*1rem\)/)
  assert.match(
    css,
    /margin-bottom:\s*calc\(var\(--ba-tab-bar-height,\s*4\.75rem\)\s*\+\s*env\(safe-area-inset-bottom,\s*0px\)\)/,
  )
  assert.match(css, /@media \(max-width:\s*767px\)/)
  assert.match(css, /\.shell-tab-bar\s*\{[^}]*padding-bottom:\s*env\(safe-area-inset-bottom,\s*0px\)/)
  assert.match(css, /safe-area-inset-left/)
  assert.match(css, /safe-area-inset-right/)
})

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx|css)$/.test(entry)) out.push(full)
  }
  return out
}

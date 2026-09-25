import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  MAJLIS_REGIONS,
  formatMajlisWhen,
  parseFocusTags,
  rejectionFeedbackError,
  riyadhWallToUtc,
  validateMajlisApplication,
} from '../supabase/functions/_shared/majlis.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

test('region list is the locked 13 names', () => {
  assert.deepEqual(MAJLIS_REGIONS, [
    'Riyadh',
    'Makkah',
    'Madinah',
    'Eastern Province',
    'Asir',
    'Tabuk',
    'Hail',
    'Northern Borders',
    'Jazan',
    'Najran',
    'Al Bahah',
    'Al Jawf',
    'Qassim',
  ])
})

test('Riyadh wall time is stored as UTC', () => {
  assert.equal(riyadhWallToUtc('2026-10-02T18:30'), '2026-10-02T15:30:00.000Z')
  assert.equal(riyadhWallToUtc('2026-10-02T18:30:00'), null)
  const label = formatMajlisWhen('2026-10-02T15:30:00.000Z', '2026-10-02T17:00:00.000Z')
  assert.match(label, /18:30 to 20:00 Asia\/Riyadh/)
  assert.equal(label.includes('\u2014'), false)
})

test('application validation rejects a self-publish payload and a blank region', () => {
  const tags = parseFocusTags(' Governance, audit, Governance ')
  assert.deepEqual(tags, ['Governance', 'audit'])
  const bad = validateMajlisApplication({
    title: 'Chairs circle',
    description: 'A private salon.',
    region: 'Riyad',
    focusTags: tags,
    startsAtUtc: '2026-10-02T15:30:00.000Z',
    endsAtUtc: '2026-10-02T17:00:00.000Z',
    capacity: 12,
    venueName: 'House',
    venueAddress: 'Olaya',
  })
  assert.equal(bad.ok, false)
  assert.equal(rejectionFeedbackError('  '), 'Rejection feedback is required.')
  assert.equal(rejectionFeedbackError('Please revise the venue.'), null)
})

test('migration keeps hosts pending and requires reject feedback', () => {
  const sql = readFileSync(
    path.join(root, 'supabase/migrations/20260925150000_majlis_events.sql'),
    'utf8',
  )
  assert.match(sql, /status = 'pending_approval'/)
  assert.match(sql, /host_cannot_publish/)
  assert.match(sql, /approved_by is null/)
  assert.match(sql, /status = 'rejected'/)
  assert.match(sql, /char_length\(trim\(rejection_feedback\)\) between 1 and 2000/)
  assert.equal(/insert\s+into\s+public\.majlis_events\s*\(/i.test(sql), false)
  for (const region of MAJLIS_REGIONS) assert.equal(sql.includes(`'${region}'`), true)
  assert.equal(sql.includes('\u2014'), false)
})

test('approve function refuses a blank reject and does not send mail', () => {
  const source = readFileSync(
    path.join(root, 'supabase/functions/majlis-approve/index.ts'),
    'utf8',
  )
  assert.match(source, /rejectionFeedbackError/)
  assert.match(source, /status: 'published'/)
  assert.match(source, /approved_by: user\.id/)
  assert.equal(/sendEmail|resend|gmail/i.test(source), false)
  const applySource = readFileSync(
    path.join(root, 'supabase/functions/majlis-apply/index.ts'),
    'utf8',
  )
  assert.match(applySource, /status: 'pending_approval'/)
  assert.equal(/approved_by/.test(applySource), false)
  assert.equal(/service_role|SERVICE_ROLE/.test(readFileSync(path.join(root, 'src/pages/dashboard/MajlisPage.tsx'), 'utf8')), false)
})

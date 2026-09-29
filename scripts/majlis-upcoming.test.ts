import assert from 'node:assert/strict'
import test from 'node:test'
import { isTestMajlis, isUpcomingMajlis, memberMajlisFeed } from '../supabase/functions/_shared/majlis.ts'

const now = Date.parse('2026-09-29T12:00:00.000Z')

function row(overrides: {
  id?: string
  title: string
  starts_at: string
  ends_at: string
  status?: string
  featured?: boolean
  description?: string
  venue_name?: string
}) {
  return {
    id: overrides.id ?? overrides.title,
    title: overrides.title,
    description: overrides.description ?? 'A private gathering.',
    venue_name: overrides.venue_name ?? 'House',
    starts_at: overrides.starts_at,
    ends_at: overrides.ends_at,
    status: overrides.status ?? 'published',
    featured: overrides.featured ?? false,
  }
}

test('member feed keeps upcoming gatherings and hides past and test rows', () => {
  const stored = [
    row({
      title: 'test majlis',
      description: 'test',
      venue_name: 'the test',
      starts_at: '2026-09-27T09:27:00.000Z',
      ends_at: '2026-09-27T11:29:00.000Z',
    }),
    row({
      title: 'Capital evening',
      starts_at: '2026-11-02T15:00:00.000Z',
      ends_at: '2026-11-02T17:00:00.000Z',
      featured: true,
    }),
    row({
      title: 'Chairs circle',
      starts_at: '2026-09-20T15:00:00.000Z',
      ends_at: '2026-09-20T17:00:00.000Z',
    }),
    row({
      title: 'Test',
      starts_at: '2026-12-01T15:00:00.000Z',
      ends_at: '2026-12-01T17:00:00.000Z',
    }),
    row({
      title: 'Governance salon',
      starts_at: '2026-10-08T15:00:00.000Z',
      ends_at: '2026-10-08T17:00:00.000Z',
    }),
    row({
      title: 'In the room',
      starts_at: '2026-09-29T10:00:00.000Z',
      ends_at: '2026-09-29T14:00:00.000Z',
    }),
    row({
      title: 'Still drafting',
      starts_at: '2026-10-09T15:00:00.000Z',
      ends_at: '2026-10-09T17:00:00.000Z',
      status: 'pending_approval',
    }),
  ]
  const before = stored.map((event) => event.title)
  const feed = memberMajlisFeed(stored, now)
  assert.deepEqual(
    feed.map((event) => event.title),
    ['In the room', 'Governance salon', 'Capital evening'],
  )
  assert.deepEqual(
    stored.map((event) => event.title),
    before,
  )
  assert.equal(feed.some((event) => isTestMajlis(event)), false)
  assert.equal(feed.every((event) => isUpcomingMajlis(event.ends_at, now)), true)
})

test('a real title that mentions testing stays on the feed', () => {
  assert.equal(isTestMajlis({ title: 'test majlis' }), true)
  assert.equal(isTestMajlis({ title: '  The Test Majlis  ' }), true)
  assert.equal(isTestMajlis({ title: 'Governance test session' }), false)
  assert.equal(isTestMajlis({ title: 'Quarterly salon' }), false)
  const feed = memberMajlisFeed(
    [
      row({
        title: 'Governance test session',
        starts_at: '2026-10-03T15:00:00.000Z',
        ends_at: '2026-10-03T17:00:00.000Z',
      }),
    ],
    now,
  )
  assert.equal(feed.length, 1)
})

test('an event that has just ended is past', () => {
  assert.equal(isUpcomingMajlis('2026-09-29T12:00:00.000Z', now), false)
  assert.equal(isUpcomingMajlis('2026-09-29T12:00:01.000Z', now), true)
  assert.equal(isUpcomingMajlis('not-a-date', now), false)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { orphanPurgeEnabled, planStorageOrphans } from '../supabase/functions/_shared/retention_storage.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NOW = new Date('2026-10-06T00:00:00.000Z')
const DAY = 86_400_000
const MEMBER = '22222222-2222-4222-8222-222222222222'
const OWNED_DECK = '44444444-4444-4444-8444-444444444444'
const ORPHAN_DECK = '55555555-5555-4555-8555-555555555555'
const ORPHAN_JOB = '66666666-6666-4666-8666-666666666666'

const ownedDeck = `${MEMBER}/${OWNED_DECK}/source.pdf`
const orphanDeck = `${MEMBER}/${ORPHAN_DECK}/source.pdf`
const orphanAi = `${MEMBER}/${ORPHAN_JOB}/source.csv`

function at(daysAgo: number) {
  return new Date(NOW.getTime() - daysAgo * DAY).toISOString()
}

function plan(purge: boolean, extra: { bucket: string; path: string; createdAt: string | null }[] = []) {
  return planStorageOrphans({
    objects: [
      { bucket: 'due-diligence-decks', path: ownedDeck, createdAt: at(40) },
      { bucket: 'due-diligence-decks', path: orphanDeck, createdAt: at(31) },
      { bucket: 'due-diligence-decks', path: `${MEMBER}/${ORPHAN_DECK}/source.pptx`, createdAt: at(29) },
      { bucket: 'due-diligence-decks', path: `${MEMBER}/12121212-1212-4121-8121-121212121212/source.pdf`, createdAt: at(30) },
      { bucket: 'ai-tool-uploads', path: orphanAi, createdAt: at(45) },
      { bucket: 'ai-tool-uploads', path: orphanAi, createdAt: null },
      { bucket: 'member-avatars', path: orphanDeck, createdAt: at(90) },
      { bucket: 'due-diligence-decks', path: 'not-a-deck', createdAt: at(90) },
      ...extra,
    ],
    ownedPaths: [{ bucket: 'due-diligence-decks', path: ownedDeck }],
    retentionDays: 30,
    now: NOW,
    purge,
  })
}

const PLAIN = 'https://example.com/functions/v1/retention-sweep'
const DRY_AND_PURGE = 'https://example.com/functions/v1/retention-sweep?dry_run=1&purge_orphans=1'
const PURGE_ONLY = 'https://example.com/functions/v1/retention-sweep?purge_orphans=1'

function removedFor(url: string) {
  const purge = orphanPurgeEnabled(url)
  return plan(purge).remove
}

test('orphan purge stays off unless the explicit switch is set', () => {
  assert.equal(orphanPurgeEnabled(PLAIN), false)
  assert.equal(orphanPurgeEnabled('https://example.com/functions/v1/retention-sweep?dry_run=1'), false)
  assert.equal(orphanPurgeEnabled('https://example.com/functions/v1/retention-sweep?purge_orphans=0'), false)
  assert.equal(orphanPurgeEnabled(DRY_AND_PURGE), false)
  assert.equal(orphanPurgeEnabled(PURGE_ONLY), true)
  const edge = readFileSync(path.join(root, 'supabase/functions/retention-sweep/index.ts'), 'utf8')
  const storage = readFileSync(path.join(root, 'supabase/functions/_shared/retention_storage.ts'), 'utf8')
  assert.match(edge, /orphanPurgeEnabled/)
  assert.match(edge, /purge_orphans/)
  assert.match(edge, /ai-tool-uploads/)
  assert.match(edge, /due-diligence-decks/)
  assert.match(edge, /const dry = new URL\(req\.url\)\.searchParams\.get\('dry_run'\) === '1'/)
  assert.match(edge, /p_apply: !dry/)
  assert.match(edge, /A plain POST runs the normal retention sweep/)
  assert.match(edge, /only lists orphans/)
  assert.equal(/Dry by default/.test(edge), false)
  assert.equal(/orphan_dry_run/.test(edge), false)
  assert.match(edge, /listed_only: !input\.purge/)
  assert.match(edge, /orphans_listed_only: !input\.purge/)
  const pass = edge.slice(edge.indexOf('async function runOrphanPass'))
  const start = pass.indexOf('if (input.purge)')
  const block = pass.slice(start, pass.indexOf('return {', start))
  assert.equal(block.includes('.remove('), true)
  assert.match(block, /planned\.remove/)
  assert.equal(block.includes('planned.report'), false)
  assert.equal(pass.slice(0, start).includes('.remove('), false)
  assert.match(storage, /params\.get\('dry_run'\) !== '1' && params\.get\('purge_orphans'\) === '1'/)
  assert.match(storage, /aiToolRetentionDue/)
  assert.equal(edge.includes('\u2014'), false)
  assert.equal(edge.includes('\u2013'), false)
  assert.equal(storage.includes('\u2014'), false)
  assert.equal(storage.includes('\u2013'), false)
})

test('a plain POST never deletes orphans', () => {
  assert.equal(orphanPurgeEnabled(PLAIN), false)
  const listed = plan(false)
  assert.ok(listed.report.length > 0)
  assert.deepEqual(listed.remove, [])
  assert.deepEqual(removedFor(PLAIN), [])
})

test('dry_run=1 and purge_orphans=1 never deletes orphans', () => {
  assert.equal(orphanPurgeEnabled(DRY_AND_PURGE), false)
  assert.deepEqual(plan(false).remove, [])
  assert.deepEqual(removedFor(DRY_AND_PURGE), [])
})

test('purge_orphans=1 alone deletes only ownerless files older than retention_days', () => {
  assert.equal(orphanPurgeEnabled(PURGE_ONLY), true)
  const live = plan(true)
  assert.deepEqual(live.remove, [
    { bucket: 'ai-tool-uploads', path: orphanAi },
    { bucket: 'due-diligence-decks', path: orphanDeck },
  ])
  assert.equal(live.remove.some((item) => item.path === ownedDeck), false)
  assert.equal(live.remove.some((item) => item.path.endsWith('source.pptx')), false)
  assert.equal(live.remove.length, 2)
  assert.equal(live.remove.some((item) => item.bucket === 'member-avatars'), false)
  assert.equal(live.remove.some((item) => item.path === 'not-a-deck'), false)
  assert.deepEqual(removedFor(PURGE_ONLY), live.remove)
})

test('old orphans are reported, and owned or newer files are never removed', () => {
  const dry = plan(false)
  assert.deepEqual(dry.report, [
    { bucket: 'ai-tool-uploads', path: orphanAi },
    { bucket: 'due-diligence-decks', path: orphanDeck },
  ])
  assert.deepEqual(dry.remove, [])

  const live = plan(true)
  assert.deepEqual(live.remove, live.report)
  assert.equal(live.remove.some((item) => item.path === ownedDeck), false)
  assert.equal(live.report.some((item) => item.path === ownedDeck), false)
  assert.equal(live.report.some((item) => item.path.endsWith('source.pptx')), false)
  assert.equal(live.report.some((item) => item.bucket === 'member-avatars'), false)
  assert.equal(live.report.some((item) => item.path === 'not-a-deck'), false)

  const samePathOtherBucket = plan(true, [
    { bucket: 'ai-tool-uploads', path: ownedDeck, createdAt: at(40) },
  ])
  assert.equal(
    samePathOtherBucket.remove.some((item) => item.bucket === 'due-diligence-decks' && item.path === ownedDeck),
    false,
  )
  assert.equal(
    samePathOtherBucket.remove.some((item) => item.bucket === 'ai-tool-uploads' && item.path === ownedDeck),
    true,
  )
})

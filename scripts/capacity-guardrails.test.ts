import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  formatPublicUsd,
  parseCapacityPayload,
  parseUsdInput,
  roundPublicUsd,
  suggestUsd,
  visiblePublicUsd,
} from '../src/lib/capacity.ts'
import { parsePlatformStats } from '../src/lib/platformStats.ts'
import { FAQ } from '../src/content/seo.ts'

const migration = readFileSync(
  new URL('../supabase/migrations/20260922200000_platform_stats.sql', import.meta.url),
  'utf8',
)

test('rounding hides under 5 and uses 5m then 1m buckets', () => {
  assert.equal(roundPublicUsd(5_000_000, 4), null)
  assert.equal(roundPublicUsd(7_400_000, 5), 5_000_000)
  assert.equal(roundPublicUsd(7_600_000, 9), 10_000_000)
  assert.equal(roundPublicUsd(2_500_000, 5), 5_000_000)
  assert.equal(roundPublicUsd(6_400_000, 10), 6_000_000)
  assert.equal(roundPublicUsd(6_600_000, 12), 7_000_000)
  assert.equal(visiblePublicUsd(5_000_000, 4), null)
  assert.equal(visiblePublicUsd(5_000_000, 5), 5_000_000)
})

test('public format stays in millions or billions', () => {
  assert.equal(formatPublicUsd(5_000_000), '$5m')
  assert.equal(formatPublicUsd(25_000_000), '$25m')
  assert.equal(formatPublicUsd(1_200_000_000), '$1.2bn')
  assert.equal(formatPublicUsd(1_000_000_000), '$1bn')
})

test('USD text can be suggested and other currencies cannot', () => {
  assert.equal(suggestUsd('USD 100m+'), 100_000_000)
  assert.equal(suggestUsd('$1.5 billion'), 1_500_000_000)
  assert.equal(suggestUsd('100 million USD'), 100_000_000)
  assert.equal(suggestUsd('US$ 20 million'), 20_000_000)
  assert.equal(suggestUsd('SAR 50m+ group revenue'), null)
  assert.equal(suggestUsd('€20m'), null)
  assert.equal(suggestUsd('about 10m'), null)
  assert.equal(suggestUsd(''), null)
})

test('blank capacity is empty and junk is rejected', () => {
  assert.equal(parseUsdInput(''), null)
  assert.equal(parseUsdInput('  $1,500,000 '), 1_500_000)
  assert.equal(parseUsdInput('-5'), 'invalid')
  assert.equal(parseUsdInput('lots'), 'invalid')
  const parsed = parseCapacityPayload({
    investable: '1000000',
    foAum: '',
    turnover: 'nope',
    include: true,
    verified: false,
  })
  assert.equal('error' in parsed, true)
})

test('a public row never shows money below the contributor gate', () => {
  const stats = parsePlatformStats({
    investment_capability_usd: 5_000_000,
    fo_aum_usd: 20_000_000,
    turnover_usd: null,
    founding_admitted_count: 3,
    founding_ksa_count: 2,
    founding_intl_count: 1,
    contributors_investment_n: 3,
    contributors_fo_n: 6,
    contributors_turnover_n: 0,
    updated_at: '2026-09-22T00:00:00Z',
  })
  assert.ok(stats)
  assert.equal(stats.investment, null)
  assert.equal(stats.foAum, 20_000_000)
  assert.equal(stats.turnover, null)
  assert.equal(stats.admitted, 3)
})

test('migration encodes the gates and does not seed members', () => {
  assert.match(migration, /contributors < 5/)
  assert.match(migration, /contributors < 10/)
  assert.match(migration, /5000000/)
  assert.match(migration, /1000000/)
  assert.match(migration, /capacity_verified/)
  assert.match(migration, /include_in_public_aggregates/)
  assert.match(migration, /grant select on table public\.platform_stats to anon, authenticated/)
  assert.match(migration, /insert into public\.platform_stats \(id\)\nvalues \(1\)/)
  assert.doesNotMatch(migration, /insert into public\.platform_stats[\s\S]{0,80}values\s*\(\s*1\s*,/i)
  assert.equal(migration.includes('\u2014'), false)
})

test('platform totals FAQ is present and has no em dash', () => {
  const item = FAQ.find((entry) => entry.question === 'What do the platform totals mean?')
  assert.ok(item)
  assert.match(item.answer, /never shown individually|never shown/i)
  assert.equal(`${item.question} ${item.answer}`.includes('\u2014'), false)
})

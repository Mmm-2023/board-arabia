import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { formatPublicUsd } from '../src/lib/capacity.ts'
import { parsePlatformStats, seatLine } from '../src/lib/platformStats.ts'
import {
  PLATFORM_FLOOR_DEFAULTS,
  displayPlatformMoney,
  presentServerTotals,
  quietFloorUsd,
} from '../src/lib/platformFloors.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const migration = readFileSync(
  path.join(root, 'supabase/migrations/20260929143000_landing_preview_and_floors.sql'),
  'utf8',
)

function floorsSql() {
  const start = migration.indexOf('-- quiet_floors')
  const end = migration.indexOf('-- end_quiet_floors')
  assert.ok(start >= 0 && end > start)
  return migration.slice(start, end)
}

test('quiet floor is max(published, floor) and seats are not part of it', () => {
  const floor = PLATFORM_FLOOR_DEFAULTS.investmentUsd
  assert.equal(quietFloorUsd(null, floor), floor)
  assert.equal(quietFloorUsd(0, floor), floor)
  assert.equal(quietFloorUsd(-1, floor), floor)
  assert.equal(quietFloorUsd(Number.NaN, floor), floor)
  assert.equal(quietFloorUsd(50_000_000, floor), floor)
  assert.equal(quietFloorUsd(floor, floor), floor)
  assert.equal(quietFloorUsd(250_000_000, floor), 250_000_000)
  assert.equal(quietFloorUsd(400_000_000, -5), 400_000_000)
  assert.equal(quietFloorUsd(null, Number.NaN), 0)

  const below = parsePlatformStats({
    investment_capability_usd: 50_000_000,
    fo_aum_usd: null,
    turnover_usd: 600_000_000,
    founding_admitted_count: 1,
    founding_ksa_count: 0,
    founding_intl_count: 1,
    contributors_investment_n: 10,
    contributors_fo_n: 2,
    contributors_turnover_n: 10,
    updated_at: '2026-09-29T00:00:00Z',
  })
  assert.ok(below)
  assert.equal(below.investment, 50_000_000)
  assert.equal(below.foAum, null)
  assert.equal(below.admitted, 1)
  const money = displayPlatformMoney(below)
  assert.equal(money.investment, 100_000_000)
  assert.equal(money.foAum, 1_000_000_000)
  assert.equal(money.turnover, 600_000_000)
  assert.equal(seatLine(below).label, '1 / 100')
  assert.equal(seatLine(below).admitted, 1)
  assert.equal(formatPublicUsd(money.investment), '$100m')
  assert.equal(formatPublicUsd(money.foAum), '$1bn')
  assert.equal(formatPublicUsd(money.turnover), '$600m')
})

test('unpublished money shows the floor and a live seat count stays put', () => {
  const early = parsePlatformStats({
    investment_capability_usd: null,
    fo_aum_usd: null,
    turnover_usd: null,
    founding_admitted_count: 1,
    founding_ksa_count: 0,
    founding_intl_count: 1,
    contributors_investment_n: 0,
    contributors_fo_n: 0,
    contributors_turnover_n: 0,
    updated_at: '2026-09-29T00:00:00Z',
  })
  assert.ok(early)
  assert.equal(early.investment, null)
  const money = displayPlatformMoney(early)
  assert.deepEqual(money, {
    investment: 100_000_000,
    foAum: 1_000_000_000,
    turnover: 500_000_000,
  })
  assert.equal(early.admitted, 1)
  assert.equal(seatLine(early).split, 'Saudi Arabia 0 · International 1')
  assert.equal(displayPlatformMoney(null).investment, 100_000_000)
})

test('server totals are already combined and are not floored again', () => {
  const parsed = presentServerTotals({
    investment_usd: '400000000',
    fo_aum_usd: 2_000_000_000,
    turnover_usd: 800_000_000,
    founding_admitted_count: 7,
    founding_ksa_count: 4,
    founding_intl_count: 3,
    floor_investment_usd: 1,
  })
  assert.ok(parsed)
  assert.equal(parsed.investment, 400_000_000)
  assert.equal(parsed.foAum, 2_000_000_000)
  assert.equal(parsed.turnover, 800_000_000)
  assert.equal(parsed.admitted, 7)
  assert.equal(parsed.ksa, 4)
  assert.equal(parsed.intl, 3)
  assert.equal(JSON.stringify(parsed).includes('floor'), false)

  const missingSeats = presentServerTotals({
    investment_usd: 100_000_000,
    fo_aum_usd: 1_000_000_000,
    turnover_usd: 500_000_000,
    founding_admitted_count: null,
    founding_ksa_count: null,
    founding_intl_count: null,
  })
  assert.equal(missingSeats?.admitted, null)
  assert.equal(missingSeats?.ksa, null)
  assert.equal(presentServerTotals({ investment_usd: -1, fo_aum_usd: 1, turnover_usd: 1 }), null)
  assert.equal(presentServerTotals(null), null)
})

test('floor defaults live on demo_thresholds and match the migration', () => {
  assert.deepEqual(PLATFORM_FLOOR_DEFAULTS, {
    investmentUsd: 100_000_000,
    foAumUsd: 1_000_000_000,
    turnoverUsd: 500_000_000,
  })
  assert.match(migration, /alter table public\.demo_thresholds/)
  assert.match(migration, /floor_investment_usd numeric not null default 100000000/)
  assert.match(migration, /floor_fo_aum_usd numeric not null default 1000000000/)
  assert.match(migration, /floor_turnover_usd numeric not null default 500000000/)
  assert.doesNotMatch(migration, /create table[^;]*floor/i)
  assert.equal(migration.includes('@'), false)
  assert.equal(migration.includes('\u2014'), false)
  assert.equal(migration.includes('\u2013'), false)

  const body = floorsSql()
  assert.match(body, /greatest\(coalesce\(s\.investment_capability_usd, 0\), t\.floor_investment_usd\)/)
  assert.match(body, /greatest\(coalesce\(s\.fo_aum_usd, 0\), t\.floor_fo_aum_usd\)/)
  assert.match(body, /greatest\(coalesce\(s\.turnover_usd, 0\), t\.floor_turnover_usd\)/)
  assert.match(body, /'founding_admitted_count', s\.founding_admitted_count/)
  assert.doesNotMatch(body, /greatest\([^)]*founding_admitted_count/)
  assert.doesNotMatch(body, /greatest\([^)]*founding_ksa_count/)
  assert.doesNotMatch(body, /greatest\([^)]*founding_intl_count/)
  assert.match(migration, /grant execute on function public\.landing_platform_totals\(\) to anon, authenticated/)
})

test('the public totals strip does not name the floor', () => {
  const source = readFileSync(path.join(root, 'src/components/StatsStrip.tsx'), 'utf8')
  assert.match(source, /displayPlatformMoney/)
  assert.match(source, /presentServerTotals/)
  assert.match(source, /Founding seats admitted/)
  assert.doesNotMatch(source, /\b(floor|example|demo|illustrative|preview)\b/i)
  assert.equal(source.includes('\u2014'), false)
  assert.match(source, /Figures reflect the network's represented capacity\. Individual amounts are never shown\./)
})

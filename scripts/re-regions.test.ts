import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { presentReOpportunity } from '../src/lib/reRedaction.ts'
import { filterReOpportunities } from '../src/lib/reOpportunityView.ts'
import {
  RE_GIGA_PROJECTS,
  RE_REGIONS,
  reGigaTag,
  reRegionFor,
} from '../src/lib/reRegions.ts'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function raw(city: string, oneLiner = 'A sample brief.') {
  return {
    id: 'b1000001-0000-4000-8000-000000000099',
    is_demo: true,
    sector: 'Housing',
    city,
    asset_class: 'residential',
    capital_role: 'equity',
    ticket_band: '$10-25m',
    one_liner: oneLiner,
    foreign_ownership_path: 'ready',
    escrow_off_plan: 'ready',
    title_clarity: 'ready',
    white_land_exposure: 'ready',
    unlocked: false,
    access: 'locked',
    intro_status: null,
  }
}

test('region options stay in the administrative order and omit giga projects', () => {
  assert.deepEqual(RE_REGIONS, [
    'Riyadh',
    'Makkah',
    'Madinah',
    'Eastern Province',
    'Asir',
    'Tabuk',
    'Qassim',
    "Ha'il",
    'Northern Borders',
    'Jazan',
    'Najran',
    'Al Bahah',
    'Al Jawf',
  ])
  for (const name of RE_GIGA_PROJECTS) {
    assert.equal((RE_REGIONS as readonly string[]).includes(name), false, name)
  }
  assert.equal(reGigaTag('Jeddah'), null)
  assert.equal(reGigaTag('other'), null)
})

test('giga projects and Jeddah map onto a region and stay filterable', () => {
  assert.equal(reRegionFor('NEOM'), 'Tabuk')
  assert.equal(reGigaTag('NEOM'), 'NEOM')
  assert.equal(reRegionFor('Red Sea'), 'Tabuk')
  assert.equal(reGigaTag('Red Sea'), 'Red Sea')
  assert.equal(reRegionFor('Qiddiya'), 'Riyadh')
  assert.equal(reRegionFor('Diriyah'), 'Riyadh')
  assert.equal(reRegionFor('ROSHN'), 'Riyadh')
  assert.equal(reGigaTag('ROSHN'), 'ROSHN')
  assert.equal(reRegionFor('ROSHN', 'A site on the Jeddah coast.'), 'Makkah')
  assert.equal(reRegionFor('Jeddah'), 'Makkah')
  assert.equal(reRegionFor('Riyadh'), 'Riyadh')
  assert.equal(reRegionFor('other'), null)

  const neom = presentReOpportunity(raw('NEOM'))
  const jeddah = presentReOpportunity(raw('Jeddah', 'Yards serving Jeddah freight.'))
  const qiddiya = presentReOpportunity(raw('Qiddiya'))
  const roshn = presentReOpportunity(raw('ROSHN', 'A ROSHN block beside Jeddah.'))
  const riyadh = presentReOpportunity(raw('Riyadh'))
  assert.ok(neom && jeddah && qiddiya && roshn && riyadh)
  const rows = [neom, jeddah, qiddiya, roshn, riyadh]
  const tabuk = filterReOpportunities(rows, { assetClass: null, city: 'Tabuk', capitalRole: null })
  assert.deepEqual(tabuk.map((row) => row.city), ['NEOM'])
  const makkah = filterReOpportunities(rows, { assetClass: null, city: 'Makkah', capitalRole: null })
  assert.deepEqual(
    makkah.map((row) => row.city).sort(),
    ['Jeddah', 'ROSHN'],
  )
  const capital = filterReOpportunities(rows, { assetClass: null, city: 'Riyadh', capitalRole: null })
  assert.deepEqual(
    capital.map((row) => row.city).sort(),
    ['Qiddiya', 'Riyadh'],
  )
})

test('region migration widens the check and does not rewrite rows', () => {
  const sql = readFileSync(path.join(root, 'supabase/migrations/20261108120000_re_regions.sql'), 'utf8')
  assert.match(sql, /drop constraint if exists re_opportunities_city/)
  assert.match(sql, /drop constraint if exists re_partners_city/)
  assert.equal(/update\s+public\.re_opportunities/i.test(sql), false)
  assert.equal(/update\s+public\.re_partners/i.test(sql), false)
  const opportunity = sql.slice(sql.indexOf('re_opportunities_city check'), sql.indexOf('re_partners'))
  let cursor = -1
  for (const region of RE_REGIONS) {
    const token = `'${region.replace(/'/g, "''")}'`
    const at = opportunity.indexOf(token, cursor + 1)
    assert.ok(at > cursor, region)
    cursor = at
  }
  for (const legacy of ['Jeddah', 'NEOM', 'Red Sea', 'Qiddiya', 'Diriyah', 'ROSHN', 'other']) {
    assert.equal(sql.includes(`'${legacy}'`), true, legacy)
  }
  assert.equal(sql.includes('\u2014'), false)
  assert.equal(sql.includes('\u2013'), false)
})

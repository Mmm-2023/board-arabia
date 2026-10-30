import assert from 'node:assert/strict'
import test from 'node:test'
import { preferredCompany } from '../supabase/functions/_shared/deck_analysis.ts'
import { cleanCompanyName, repairDeckLabel } from '../supabase/functions/_shared/deck_title.ts'
import {
  buildReport,
  companyFromFileName,
  extractDeckFacts,
  presentReport,
  safeFileName,
} from '../supabase/functions/_shared/due_diligence.ts'
import { reportListTitle } from '../src/lib/recentReports.ts'

function misreadLatin1(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let out = ''
  for (const byte of bytes) out += String.fromCharCode(byte)
  return out
}

test('deck titles repair mojibake and keep a normal name', () => {
  assert.equal(repairDeckLabel('\u00D2Made In KSA\u00D3'), 'Made In KSA')
  assert.equal(
    repairDeckLabel('\u00D2Made In KSA\u00D3 Gateway to Centralized Economy'),
    'Made In KSA Gateway to Centralized Economy',
  )
  assert.equal(repairDeckLabel('"Northwind Logistics"'), 'Northwind Logistics')
  assert.equal(repairDeckLabel('\u201CNorthwind Logistics\u201D'), 'Northwind Logistics')
  assert.equal(repairDeckLabel("O'Brien Holdings"), "O'Brien Holdings")
  assert.equal(repairDeckLabel('Jahez International Company'), 'Jahez International Company')
  assert.equal(repairDeckLabel('Northwind Logistics'), 'Northwind Logistics')

  const once = misreadLatin1('\u201CNorthwind Logistics\u201D')
  const twice = misreadLatin1(once)
  assert.equal(repairDeckLabel(once), 'Northwind Logistics')
  assert.equal(repairDeckLabel(twice), 'Northwind Logistics')
  assert.equal(
    repairDeckLabel('\u00E2\u20AC\u0153Northwind Logistics\u00E2\u20AC\u009D'),
    'Northwind Logistics',
  )
})

test('odd characters in a title fall back to the file name', () => {
  assert.equal(cleanCompanyName('Foo\uFFFDbar', 'Harborline Robotics.pdf'), 'Harborline Robotics')
  assert.equal(cleanCompanyName('Northwind Logistics', 'other.pdf'), 'Northwind Logistics')
  assert.equal(cleanCompanyName('', 'Harborline Robotics.pdf'), '')
  assert.equal(reportListTitle('Foo\uFFFDbar', 'Harborline Robotics.pdf'), 'Harborline Robotics')
  assert.equal(reportListTitle('\u00D2Made In KSA\u00D3', 'deck.pdf'), 'Made In KSA')
  assert.equal(
    reportListTitle('\u00D2Made In KSA\u00D3 Gateway to Centralized Economy', 'deck.pdf'),
    'Made In KSA Gateway to Centralized Economy',
  )
  assert.equal(reportListTitle('Jahez International Company', 'jahez.pdf'), 'Jahez International Company')
  assert.equal(reportListTitle("O'Brien Holdings", 'obrien.pdf'), "O'Brien Holdings")
  assert.equal(reportListTitle('Not stated in the deck', 'Northwind Logistics.pdf'), 'Northwind Logistics')
  const cp1252 = '\u00E2\u20AC\u0153Made In KSA\u00E2\u20AC\u009D'
  assert.equal(reportListTitle(cp1252, 'deck.pdf'), 'Made In KSA')
})

test('edge stores a repaired company and file name', () => {
  assert.equal(safeFileName('\u00D2Made In KSA\u00D3.pdf', 'pdf'), 'Made In KSA.pdf')
  assert.equal(safeFileName('northwind-freight.pdf', 'pdf'), 'northwind-freight.pdf')
  assert.equal(safeFileName('../secret.pdf', 'pdf'), 'secret.pdf')
  assert.equal(companyFromFileName('\u00D2Made In KSA\u00D3.pdf'), 'Made')
  assert.equal(preferredCompany('\u00D2Northwind Freight\u00D3'), 'Northwind Freight')
  assert.equal(preferredCompany('Northwind Freight'), 'Northwind Freight')
  assert.equal(preferredCompany("O'Brien Holdings"), "O'Brien Holdings")

  const quoted = extractDeckFacts('\u00D2Made In KSA\u00D3\nSector: logistics\n', 'deck.pdf')
  assert.equal(quoted.company, 'Made In KSA')

  const latin1 = extractDeckFacts(`${misreadLatin1('\u201CNorthwind Logistics\u201D')}\nSector: logistics\n`, 'deck.pdf')
  assert.equal(latin1.company, 'Northwind Logistics')

  const odd = extractDeckFacts('Foo\uFFFDbar Logistics LLC\nSector: logistics\n', 'Harborline Robotics.pdf')
  assert.equal(odd.company, 'Harborline Robotics')

  const report = buildReport(extractDeckFacts('Northwind Logistics\nSector: logistics\n'), [])
  report.company_label = '\u00D2Northwind Logistics\u00D3'
  const presented = presentReport(report, 'Northwind.pdf')
  assert.equal(presented.documents_reviewed, 'Northwind.pdf')
  assert.match(presented.assessed_line, /Northwind Logistics/)
  assert.equal(presented.assessed_line.includes('\u00D2'), false)
  assert.equal(presented.assessed_line.includes('\u00D3'), false)
  assert.match(presented.overview, /Northwind Logistics/)
  assert.equal(presented.overview.includes('\u00D2'), false)
})

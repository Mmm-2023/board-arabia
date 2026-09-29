/**
 * Fictional Northwind report. Model JSON and pages are fixtures.
 * No live model or search call.
 */
import {
  buildReport,
  DEGRADED_NOTE_SEARCH,
  extractDeckFacts,
  factsFromModelJson,
  mergeModelFacts,
  type BuiltReport,
} from '../../supabase/functions/_shared/due_diligence.ts'

export const NORTHWIND_DECK = `Submitted by: Northwind Logistics
Sector: logistics
We are raising $4 million in a seed round.
Northwind serves 120 enterprise customers across the Gulf.
The global logistics market is $900 billion.
Our founder Sara Nasser previously led public listings.
Patent pending on route packing software.`

export const NORTHWIND_MODEL = {
  company: 'Northwind Logistics',
  sector: 'Logistics',
  ask: 'We are raising $4 million in a seed round.',
  claims: [
    { text: 'Northwind serves 120 enterprise customers in the Gulf.', kind: 'traction' },
    { text: 'The global logistics market is about $900 billion.', kind: 'market' },
    { text: 'Founder Sara Nasser previously led public listings.', kind: 'team' },
    { text: 'A patent is pending on route packing software.', kind: 'ip' },
  ],
}

export function northwindFixtureReport(): BuiltReport {
  const facts = mergeModelFacts(factsFromModelJson(NORTHWIND_MODEL, NORTHWIND_DECK), extractDeckFacts(NORTHWIND_DECK))
  return buildReport(
    facts,
    [
      {
        title: 'Northwind Logistics',
        url: 'https://www.northwind.example/',
        text: 'Northwind serves 120 enterprise customers in the Gulf. This page is the company website and repeats the deck.',
      },
      {
        title: 'Gulf logistics note',
        url: 'https://news.example/gulf-logistics',
        text: 'Northwind serves 120 enterprise customers in the Gulf according to a public note on freight lanes.',
      },
      {
        title: 'Market brief',
        url: 'https://research.example/logistics-market',
        text: 'The global logistics market is $90 billion according to the public brief.',
      },
      {
        title: 'Argaam company page',
        url: 'https://www.argaam.com/en/northwind',
        text: 'Argaam lists Northwind Logistics among private logistics companies in the Gulf. No founder biography is published on this page.',
      },
    ],
    {
      companyUrl: 'https://northwind.example/',
      degradedNotes: [DEGRADED_NOTE_SEARCH],
    },
  )
}

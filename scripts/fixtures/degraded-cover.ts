/**
 * Fictional stamped cover. No live model or search call.
 * Filename token RHL is only the fallback when the deck names nobody.
 */
import {
  buildReport,
  DEGRADED_NOTE_MODEL,
  DEGRADED_NOTE_SEARCH,
  extractDeckFacts,
  type BuiltReport,
} from '../../supabase/functions/_shared/due_diligence.ts'

export const STAMPED_FILE = 'RHL-Seed-Investment-Deck.pdf'

export const STAMPED_DECK = `CONFIDENTIAL MANAGEMENT CASE
STRICTLY PRIVATE
Investor presentation

Harborline Robotics
hello@harborline.example

Sector: logistics
Aim: Raise a seed round to open Gulf lanes.
ARR is $2.4 million.
Pre-money valuation is $12 million.
Harborline serves 80 enterprise customers.
Revenue grew 40% year over year.
Nora Hale, CEO.
`

export function degradedCoverReport(): BuiltReport {
  const facts = extractDeckFacts(STAMPED_DECK, STAMPED_FILE)
  return buildReport(facts, [], {
    degradedNotes: [DEGRADED_NOTE_MODEL, DEGRADED_NOTE_SEARCH],
  })
}

/**
 * Fictional draft used by tests and the local screenshot preview.
 * example.com only. Not a real company.
 */
import { parseDeckAnalysis, type DeckAnalysis } from '../../supabase/functions/_shared/deck_analysis.ts'
import {
  buildReport,
  DEGRADED_NOTE_MODEL_FALLBACK,
  DEGRADED_NOTE_MODEL_PARTIAL,
  DEGRADED_NOTE_SEARCH,
  extractDeckFacts,
  NOT_STATED,
  type BuiltReport,
} from '../../supabase/functions/_shared/due_diligence.ts'

export const FIXTURE_DECK = [
  'Northwind Freight',
  'Sector: logistics',
  'We are raising $2 million in a seed round.',
  'Northwind Freight serves 40 warehouses for example.com customers.',
  'The public site is https://example.com/northwind.',
].join('\n')

const SCORES = {
  story_clarity: 3,
  unit_economics: 2,
  model_integrity: 4,
  traction_evidence: 1,
  team_and_governance: 2,
  regulatory_and_operations: 2,
  market_and_competition: 1,
  use_of_funds: 3,
  valuation_fit: 2,
  overall: 2,
}

export function fullDraftRaw(): Record<string, unknown> {
  return {
    meta: {
      company: 'Northwind Freight',
      document: 'Example seed deck',
      as_of: '2026-09-01',
      review_type: 'deck_only',
      disclaimer: 'Document review only. Illustrative. Not investment advice, not an audit, and not a substitute for legal, financial, or regulatory diligence.',
    },
    snapshot: {
      one_liner: 'Northwind Freight wants a seed round to run a pilot warehouse lane for example.com customers.',
      round: { amount: 2000000, equity_pct: 10, pre_money: 18000000, post_money: 20000000, currency: 'USD' },
      stage: 'pilot',
      posture: 'evidence_required',
      posture_reason: 'The spreadsheet is coherent, and proof of customers, team, and licenses is missing.',
    },
    scores: SCORES,
    claims: [
      { claim: 'Northwind Freight serves 40 warehouses.', page: '2', status: 'supported_in_deck', note: 'Deck-stated. Not checked outside the deck.' },
      { claim: 'The service is already live in three cities.', page: '4', status: 'contradicted', note: 'A later page says the lane is still a pilot.' },
    ],
    math_checks: [
      { name: 'Post-money', formula: '18,000,000 + 2,000,000', deck_value: '20,000,000', recomputed: '20,000,000', result: 'ties' },
      { name: 'Year-1 revenue', formula: '40 x 12 x 900', deck_value: '500,000', recomputed: '432,000', result: 'breaks' },
      { name: 'Year-5 EBITDA', formula: 'not in deck', deck_value: 'not in deck', recomputed: 'not in deck', result: 'cannot_test' },
    ],
    unit_economics: {
      unit: 'warehouse month',
      price: '900 USD',
      full_cost: '1,100 USD',
      break_even_volume: '310 months',
      year1_volume_assumption: '220 months',
      year1_vs_breakeven: 'below',
      comment: 'Year-1 volume is below the break-even volume stated in the deck.',
    },
    risks: [
      { title: 'No named customers', severity: 'high', why: 'The deck names example.com as a target, not a signed account.', evidence_that_would_retire_it: 'A contract or paid invoice.' },
      { title: 'License not named', severity: 'medium', why: 'The operating claim is subject to a permit the deck does not name.', evidence_that_would_retire_it: 'The permit name and date.' },
      { title: 'Thin team slide', severity: 'low', why: 'One operator is named and no cap table is included.', evidence_that_would_retire_it: 'Names, roles, and a cap table.' },
    ],
    missing: ['Cap table', 'Competition', 'Insurance'],
    questions_for_management: [
      'Which customer has paid, and for how many months?',
      'What is the signed price and the full cost per warehouse month?',
      'Why is Year-1 volume below the break-even volume?',
      'Which page is the live claim, and which page says pilot?',
      'Who owns the software, and what is rented?',
      'What permit is still open, and who is the regulator?',
      'Does the use of funds include a refundable deposit?',
      'What milestone would cut or tranche the round?',
    ],
    suggested_structure: {
      comment: 'Discussion is rational only if the first pilot is paid.',
      tranches: [{ name: 'First release', release_when: 'One paid warehouse month and a named permit owner.' }],
    },
    memo_markdown: [
      'Verdict: evidence is required. The round prices a pilot as if the Year-1 volume already clears break-even, and the deck itself puts Year-1 volume below that line.',
      'Math that ties: post-money is 18,000,000 plus 2,000,000. The Year-1 revenue build does not tie. Year-5 EBITDA is not in the deck.',
      '1. No named paying customer. The example.com line is a target.',
      '2. Year-1 volume of 220 months is below the 310 month break-even.',
      '3. An already-live sentence conflicts with the pilot caveat.',
      'Questions follow. A tranche is reasonable only after a paid month.',
    ].join('\n\n'),
  }
}

export function partialDraftRaw(): Record<string, unknown> {
  const raw = fullDraftRaw()
  const scores = { ...(raw.scores as Record<string, unknown>) }
  scores.traction_evidence = 'no'
  return {
    ...raw,
    scores,
    memo_markdown: '',
    unit_economics: null,
    risks: [
      { title: 'Dropped risk', severity: 'severe', why: 'Bad severity.', evidence_that_would_retire_it: '' },
      ...(raw.risks as unknown[]).slice(0, 1),
    ],
    math_checks: [
      ...(raw.math_checks as unknown[]).slice(0, 2),
      { name: 'Bad row', formula: '1 + 1', deck_value: '2', recomputed: '2', result: 'nope' },
    ],
  }
}

export function fullDraftAnalysis(): DeckAnalysis {
  const parsed = parseDeckAnalysis(fullDraftRaw())
  if (!parsed) throw new Error('fixture draft did not parse')
  return parsed
}

export function partialDraftAnalysis(): DeckAnalysis {
  const parsed = parseDeckAnalysis(partialDraftRaw())
  if (!parsed) throw new Error('partial draft did not parse')
  return parsed
}

export function fullDraftReport(): BuiltReport {
  const analysis = fullDraftAnalysis()
  const report = buildReport(extractDeckFacts(FIXTURE_DECK), [
    {
      title: 'Northwind public note',
      url: 'https://example.com/northwind',
      text: 'Northwind Freight serves 40 warehouses. This public note is long enough to cite in a check.',
    },
  ])
  report.analysis = analysis
  report.company_label = analysis.meta.company
  report.model_id = 'unit-model-id'
  report.model_skip_reason = null
  return report
}

export function partialDraftReport(): BuiltReport {
  const analysis = partialDraftAnalysis()
  const report = buildReport(extractDeckFacts(FIXTURE_DECK), [], {
    degradedNotes: [DEGRADED_NOTE_MODEL_FALLBACK, DEGRADED_NOTE_MODEL_PARTIAL],
  })
  report.analysis = analysis
  report.company_label = analysis.meta.company || 'Northwind Freight'
  report.model_id = 'backup-model'
  report.model_skip_reason = 'primary_timeout:fallback:partial'
  return report
}

export function passDraftReport(): BuiltReport {
  const base = fullDraftRaw()
  const analysis = parseDeckAnalysis({
    hero: {
      company: 'Northwind Freight',
      one_liner: 'A shipped warehouse lane for example.com customers.',
      posture: 'pass',
      overall: 4,
      pre_money: 8000000,
      post_money: 10000000,
      currency: 'USD',
    },
    ...base,
    snapshot: {
      ...(base.snapshot as object),
      one_liner: 'A shipped warehouse lane for example.com customers.',
      posture: 'pass',
      round: { amount: 2000000, equity_pct: 20, pre_money: 8000000, post_money: 10000000, currency: 'USD' },
    },
    scores: {
      story_clarity: 4,
      unit_economics: 4,
      model_integrity: 4,
      traction_evidence: 4,
      team_and_governance: 4,
      regulatory_and_operations: 4,
      market_and_competition: 3,
      use_of_funds: 4,
      valuation_fit: 4,
      overall: 4,
    },
    claims: [{ claim: 'Northwind Freight serves 40 warehouses.', page: '2', status: 'supported_in_deck', note: 'Deck-stated.' }],
    risks: [{ title: 'Thin insurance note', severity: 'low', why: 'The deck names a carrier in one line.', evidence_that_would_retire_it: 'The policy number.' }],
    memo_markdown: 'Verdict: the first step is proved and the price can be discussed.\n\nThe round arithmetic ties.',
  })
  if (!analysis) throw new Error('pass draft did not parse')
  const report = buildReport(extractDeckFacts(FIXTURE_DECK), [
    {
      title: 'Northwind public note',
      url: 'https://example.com/northwind',
      text: 'Northwind Freight serves 40 warehouses. This public note is long enough to cite in a check.',
    },
  ])
  report.analysis = analysis
  report.company_label = 'Northwind Freight'
  report.model_id = 'unit-model-id'
  report.model_skip_reason = null
  return report
}

export function rangeBreachReport(): BuiltReport {
  const base = fullDraftRaw()
  const analysis = parseDeckAnalysis({
    hero: {
      company: 'Northwind Freight',
      one_liner: 'A shipped warehouse lane for example.com customers.',
      posture: 'pass',
      overall: 1,
      pre_money: 8000000,
      post_money: 10000000,
      currency: 'USD',
    },
    ...base,
    snapshot: {
      ...(base.snapshot as object),
      one_liner: 'A shipped warehouse lane for example.com customers.',
      posture: 'pass',
      posture_reason: 'The first step is proved.',
      round: { amount: 2000000, equity_pct: 20, pre_money: 8000000, post_money: 10000000, currency: 'USD' },
    },
    scores: {
      story_clarity: 4,
      unit_economics: 4,
      model_integrity: 4,
      traction_evidence: 4,
      team_and_governance: 4,
      regulatory_and_operations: 4,
      market_and_competition: 3,
      use_of_funds: 4,
      valuation_fit: 4,
      overall: 4,
    },
    claims: [{ claim: 'Northwind Freight serves 40 warehouses.', page: '2', status: 'supported_in_deck', note: 'Deck-stated.' }],
    risks: [{ title: 'Thin insurance note', severity: 'low', why: 'The deck names a carrier in one line.', evidence_that_would_retire_it: 'The policy number.' }],
    memo_markdown: 'The gauge reads 25 kg, which is inside the 10 to 20 kg band.\n\nVerdict: the first step is proved and the price can be discussed.',
  })
  if (!analysis) throw new Error('range draft did not parse')
  const report = buildReport(extractDeckFacts(FIXTURE_DECK), [
    {
      title: 'Northwind public note',
      url: 'https://example.com/northwind',
      text: 'Northwind Freight serves 40 warehouses. This public note is long enough to cite in a check.',
    },
  ])
  report.analysis = analysis
  report.company_label = 'Northwind Freight'
  report.model_id = 'unit-model-id'
  report.model_skip_reason = null
  return report
}

/** Mirrors a stored draft row: analysis present, claims empty, public checks not run. Example data only. */
export function exampleCoRaw(): Record<string, unknown> {
  return {
    meta: {
      company: 'Example Co',
      document: 'Example seed deck',
      as_of: '2026-09-30',
      review_type: 'deck_only',
      disclaimer:
        'Document review only. Illustrative. Not investment advice, not an audit, and not a substitute for legal, financial, or regulatory diligence.',
    },
    snapshot: {
      one_liner: 'Example Co wants a seed round to run a pilot cold-chain lane.',
      round: { amount: 4500000, equity_pct: 15, pre_money: 25500000, post_money: 30000000, currency: 'USD' },
      stage: 'pilot',
      posture: 'evidence_required',
      posture_reason: 'The spreadsheet is coherent, and proof of customers is missing.',
    },
    scores: {
      story_clarity: 2,
      unit_economics: 2,
      model_integrity: 2,
      traction_evidence: 2,
      team_and_governance: 2,
      regulatory_and_operations: 2,
      market_and_competition: 2,
      use_of_funds: 2,
      valuation_fit: 2,
      overall: 2,
    },
    claims: [
      {
        claim: 'The gauge reads 40 celsius, which is inside the 2 to 8 celsius band.',
        page: '4',
        status: 'supported_in_deck',
        note: 'Deck-stated.',
      },
    ],
    math_checks: [
      {
        name: 'Post-money',
        formula: '25,500,000 + 4,500,000',
        deck_value: '30,000,000',
        recomputed: '30,000,000',
        result: 'ties',
      },
    ],
    unit_economics: {
      unit: 'lane month',
      price: '900 USD',
      full_cost: '1,100 USD',
      break_even_volume: '310 months',
      year1_volume_assumption: '220 months',
      year1_vs_breakeven: 'below',
      comment: 'Year-1 volume is below the break-even volume stated in the deck.',
    },
    risks: [
      {
        title: 'No named customers',
        severity: 'high',
        why: 'The deck names a target account, not a signed customer.',
        evidence_that_would_retire_it: 'A contract or paid invoice.',
      },
    ],
    missing: ['Cap table'],
    questions_for_management: [
      'Which customer has paid, and for how many months?',
      'What reading should replace the value outside the stated band?',
    ],
    suggested_structure: {
      comment: 'Release the round in two tranches.',
      tranches: [{ name: 'First', release_when: 'A signed customer is named.' }],
    },
    memo_markdown:
      'The gauge reads 40 celsius, which is inside the 2 to 8 celsius band.\n\nThe round arithmetic ties. Proof of customers is still missing.',
    hero: {
      company: 'Example Co',
      one_liner: 'Example Co wants a seed round to run a pilot cold-chain lane.',
      posture: 'evidence_required',
      overall: 2,
      pre_money: 25500000,
      post_money: 30000000,
      currency: 'USD',
    },
  }
}

export function exampleCoReport(): BuiltReport {
  const analysis = parseDeckAnalysis(exampleCoRaw())
  if (!analysis) throw new Error('example draft did not parse')
  const report = buildReport(
    {
      company: 'Example Co',
      sector: NOT_STATED,
      ask: 'Raise of 4500000 USD for 15% equity',
      claims: [],
    },
    [],
    { degradedNotes: [DEGRADED_NOTE_SEARCH] },
  )
  report.analysis = analysis
  report.claims = []
  report.company_label = 'Example Co'
  report.sector_label = NOT_STATED
  report.ask_label = 'Raise of 4500000 USD for 15% equity'
  report.sources = []
  return report
}

export function publicChecksReport(): BuiltReport {
  const report = passDraftReport()
  report.sources = []
  report.degraded_notes = [DEGRADED_NOTE_SEARCH]
  report.claims = report.claims.map((claim) => ({ ...claim, sources: [] }))
  return report
}

/**
 * JSON contract sent with the deck. Field names only. No sample company.
 */
export const SCHEMA_PROMPT = [
  'Return one JSON object with these keys:',
  'meta: company, document, as_of, review_type (deck_only), disclaimer.',
  'disclaimer must be: Document review only. Illustrative. Not investment advice, not an audit, and not a substitute for legal, financial, or regulatory diligence.',
  'snapshot: one_liner; round (amount, equity_pct, pre_money, post_money, currency) with numbers or null; stage one of pre_revenue, pilot, revenue; posture one of pass, evidence_required, discuss_with_milestones; posture_reason.',
  'scores: story_clarity, unit_economics, model_integrity, traction_evidence, team_and_governance, regulatory_and_operations, market_and_competition, use_of_funds, valuation_fit, overall. Each is an integer from 1 to 5.',
  'claims: array of {claim, page, status, note}. status is supported_in_deck, contradicted, or unverified.',
  'math_checks: array of {name, formula, deck_value, recomputed, result}. result is ties, breaks, or cannot_test.',
  'unit_economics: {unit, price, full_cost, break_even_volume, year1_volume_assumption, year1_vs_breakeven, comment}. year1_vs_breakeven is below, at, above, or unknown.',
  'risks: array of {title, severity, why, evidence_that_would_retire_it}. severity is high, medium, or low.',
  'missing: array of strings.',
  'questions_for_management: array of 8 to 12 strings.',
  'suggested_structure: {comment, tranches: [{name, release_when}]}.',
  'memo_markdown: string. Verdict first. No exclamation marks.',
  'Label every figure as deck-stated, recomputed, or unknown.',
].join('\n')

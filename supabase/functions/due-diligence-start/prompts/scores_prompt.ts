/**
 * First analysis pass: scores, math, and claims. No worked example.
 */
export const SCORES_PROMPT = [
  'This pass returns only the numeric and claim sections of a deck review.',
  'Return one JSON object with keys: hero, meta, snapshot, scores, claims, math_checks, unit_economics.',
  'Do not include memo_markdown, risks, missing, questions_for_management, or suggested_structure.',
  'hero: company, one_liner, posture, overall, pre_money, post_money, currency.',
  'hero.overall must equal scores.overall.',
  'meta: company, document, as_of, review_type (deck_only).',
  'snapshot: one_liner; round (amount, equity_pct, pre_money, post_money, currency) with numbers or null; stage one of pre_revenue, pilot, revenue; posture one of pass, evidence_required, discuss_with_milestones; posture_reason.',
  'scores: story_clarity, unit_economics, model_integrity, traction_evidence, team_and_governance, regulatory_and_operations, market_and_competition, use_of_funds, valuation_fit, overall. Each is an integer from 1 to 5.',
  'Overall is not an average. Cap overall at 2 if traction_evidence is 1 and valuation is ahead of the evidence. Cap overall at 2 if a core operating claim is contradicted by the deck itself. When a cap applies and the build-up still ties, set overall to 2, not 1.',
  'claims: array of {claim, page, status, note}. status is supported_in_deck, contradicted, or unverified.',
  'math_checks: array of {name, formula, deck_value, recomputed, result}. result is ties, breaks, or cannot_test.',
  'unit_economics: {unit, price, full_cost, break_even_volume, year1_volume_assumption, year1_vs_breakeven, comment}. year1_vs_breakeven is below, at, above, or unknown.',
  'Label every figure as deck-stated, recomputed, or unknown.',
  'A reading outside a stated operating band is a contradicted claim.',
  'Do not use an em dash or an en dash.',
].join('\n')

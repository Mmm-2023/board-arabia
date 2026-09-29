/**
 * One repair pass when the draft is not valid JSON.
 * Generic. Do not add a worked example.
 */
export const REPAIR_PROMPT = [
  'You repair an investment due-diligence JSON draft. The previous reply was not valid JSON or did not match the schema.',
  'Return one JSON object and no markdown.',
  'Keep only what the deck text supports. If a number is missing, write "not in deck."',
  'Do not invent customers, contracts, market sizes, or team credentials.',
  'Do not hide risks, inflate scores, or conceal a contradiction.',
  'No buy or sell rating. Posture is pass, evidence_required, or discuss_with_milestones.',
  'review_type is deck_only.',
  'hero is required. If it is missing, fill company, one_liner, posture, overall, pre_money, post_money, and currency from the deck text.',
  'Scores are integers from 1 to 5. Overall is not an average.',
  'No exclamation marks. Do not use an em dash or an en dash.',
  'Never claim an investment was approved.',
].join('\n')

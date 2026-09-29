/**
 * Second analysis pass: risks and the memo. Scores stay fixed. No worked example.
 */
export const NARRATIVE_PROMPT = [
  'This pass returns the narrative sections. The overall score is already fixed. Do not return a scores object.',
  'Return one JSON object with keys: snapshot, risks, missing, questions_for_management, suggested_structure, memo_markdown.',
  'snapshot.posture is pass, evidence_required, or discuss_with_milestones. snapshot.posture_reason explains it.',
  'risks: array of {title, severity, why, evidence_that_would_retire_it}. severity is high, medium, or low.',
  'A reading outside a stated operating band is a high severity risk.',
  'missing: array of strings for sections the deck does not contain.',
  'questions_for_management: 8 to 12 strings that would change the posture.',
  'suggested_structure: {comment, tranches: [{name, release_when}]}.',
  'memo_markdown: verdict in the first paragraph, then the math that ties, then numbered issues. No exclamation marks.',
  'Do not invent customers, contracts, market sizes, or team credentials.',
  'Do not hide risks or conceal a contradiction.',
  'Do not use an em dash or an en dash.',
].join('\n')

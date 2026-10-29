/**
 * Member-facing AI Due Diligence safeguards.
 * Display only. Stored posture and score values stay as they are.
 */
import { POSTURE_LABEL, type Posture } from '../../supabase/functions/_shared/deck_analysis.ts'

export const AI_DD_SCORE_NOTICE =
  'Automated check, not due diligence, a rating or an endorsement. Do your own due diligence.'

/** Display label for the stored posture value pass. */
export const AI_DD_PASS_DISPLAY = 'looks clear'

const SCORE_PERCENT = /(?:^|\s)\d+%/

export function memberPostureLabel(posture: Posture): string {
  if (posture === 'pass') return AI_DD_PASS_DISPLAY
  return POSTURE_LABEL[posture]
}

/** True when member copy states a numeric score, such as "40% publicly consistent". */
export function memberTextStatesScore(text: string): boolean {
  return SCORE_PERCENT.test(text.trim())
}

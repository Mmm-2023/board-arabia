/**
 * AI tool legal slots.
 * The operator name and commercial registration come from the logged-in report constant.
 * The model provider still defaults to "To be confirmed" until that env is set.
 * Privacy and terms stay the labelled in-app routes.
 * Public Terms and Privacy keep their own env fields and are not filled from this constant.
 */
import { legalField, PRIVACY_LINK, TERMS_LINK, type LegalLang } from '../config/legal'
import { retentionDaysOrDefault } from '../../supabase/functions/_shared/ai_tools.ts'
import { AI_REPORT_OPERATOR_CR, aiReportOperatorName } from './aiReportOperator.ts'
import type { LegalSlots } from './aiToolCopy.ts'

export { PRIVACY_LINK, TERMS_LINK }

export function legalSlotsFromEnv(
  retentionDays: number,
  date: string,
  _lang: LegalLang = 'en',
): LegalSlots {
  return {
    entity: aiReportOperatorName(),
    cr: AI_REPORT_OPERATOR_CR,
    provider: legalField('aiProvider', 'en'),
    privacy: PRIVACY_LINK,
    terms: TERMS_LINK,
    retentionDays: retentionDaysOrDefault(retentionDays),
    date,
  }
}

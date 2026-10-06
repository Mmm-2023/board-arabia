/**
 * AI tool legal slots. One source: src/config/legal.ts.
 * Entity, commercial registration, and provider default to "To be confirmed".
 * The AI report operator is not one of these slots. Signed-in pages load it separately.
 * Privacy and terms stay the labelled in-app routes.
 */
import { legalField, PRIVACY_LINK, TERMS_LINK, type LegalLang } from '../config/legal'
import { retentionDaysOrDefault } from '../../supabase/functions/_shared/ai_tools.ts'
import type { LegalSlots } from './aiToolCopy.ts'

export { PRIVACY_LINK, TERMS_LINK }

export function legalSlotsFromEnv(
  retentionDays: number,
  date: string,
  _lang: LegalLang = 'en',
): LegalSlots {
  return {
    entity: legalField('baEntity', 'en'),
    cr: legalField('cr', 'en'),
    provider: legalField('aiProvider', 'en'),
    privacy: PRIVACY_LINK,
    terms: TERMS_LINK,
    retentionDays: retentionDaysOrDefault(retentionDays),
    date,
  }
}

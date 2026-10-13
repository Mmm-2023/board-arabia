import { LEGAL_PENDING } from './legal.ts'

/**
 * Public legal pages do not render a separate entity name or registration number.
 * Board Arabia is named in the terms and privacy copy.
 * This module stays on the legal-pages chunk and does not read build env values.
 */
export function publishedLegalIdentity(): { baEntity: string; cr: string } {
  return {
    baEntity: LEGAL_PENDING.en,
    cr: LEGAL_PENDING.en,
  }
}

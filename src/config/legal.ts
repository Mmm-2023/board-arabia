/** Public legal routes and the placeholders the terms and privacy pages fill in. */

export const PRIVACY_LINK = '/privacy'
export const TERMS_LINK = '/terms'

export const LEGAL_PENDING = {
  en: 'To be confirmed',
  ar: 'قيد التأكيد',
} as const

export const EFFECTIVE_DATE = {
  en: '30 September 2026',
  ar: '٣٠ سبتمبر ٢٠٢٦',
} as const

export type LegalLang = keyof typeof LEGAL_PENDING

const ENV_NAME = {
  baEntity: 'VITE_LEGAL_BA_ENTITY',
  cr: 'VITE_LEGAL_CR',
  address: 'VITE_LEGAL_ADDRESS',
  contactEmail: 'VITE_LEGAL_CONTACT_EMAIL',
  dpoContact: 'VITE_LEGAL_DPO_CONTACT',
  aiProvider: 'VITE_LEGAL_AI_PROVIDER',
  partnersEmail: 'VITE_LEGAL_PARTNERS_EMAIL',
  serviceEmail: 'VITE_LEGAL_SERVICE_EMAIL',
} as const

export type LegalField = keyof typeof ENV_NAME

let envOverride: Partial<Record<LegalField, string>> | null = null

/** Tests inject placeholder values. Production reads Vite env in this file only. */
export function setLegalEnvForTests(value: Partial<Record<LegalField, string>> | null) {
  envOverride = value
}

function viteEnv(): Record<string, unknown> {
  if (typeof import.meta === 'undefined') return {}
  return (import.meta.env as Record<string, unknown> | undefined) ?? {}
}

export function legalField(field: LegalField, lang: LegalLang): string {
  const override = envOverride?.[field]
  const raw = override !== undefined ? override : viteEnv()[ENV_NAME[field]]
  const value = typeof raw === 'string' ? raw.trim() : ''
  return value || LEGAL_PENDING[lang]
}

/** Mailbox for the partner interest form. Set VITE_LEGAL_PARTNERS_EMAIL in the deploy environment. */
export function PARTNERS_EMAIL(lang: LegalLang = 'en'): string {
  return legalField('partnersEmail', lang)
}

/** Mailbox used to send service email. Set VITE_LEGAL_SERVICE_EMAIL in the deploy environment. */
export function SERVICE_EMAIL(lang: LegalLang = 'en'): string {
  return legalField('serviceEmail', lang)
}

/**
 * Default is on: retention-sweep deletes AI uploads, outputs, and staged files.
 * Only the exact boolean false or the string false turns the 30 day wording off.
 */
export function readAiUploads30DayRetention(raw: unknown): boolean {
  return raw !== false && raw !== 'false'
}

export const AI_UPLOADS_30_DAY_RETENTION = readAiUploads30DayRetention(
  viteEnv().VITE_LEGAL_AI_UPLOADS_30_DAY_RETENTION,
)

let retentionOverride: boolean | null = null

/** Tests cover both retention wordings. Production uses AI_UPLOADS_30_DAY_RETENTION. */
export function setAiUploads30DayRetentionForTests(value: boolean | null) {
  retentionOverride = value
}

export function aiUploads30DayRetention(): boolean {
  return retentionOverride ?? AI_UPLOADS_30_DAY_RETENTION
}

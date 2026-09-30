/**
 * One place for the AI tool legal placeholders.
 * LEGAL-PAGES owns src/config/legal.ts (VITE_LEGAL_* values, PRIVACY_LINK,
 * TERMS_LINK, and AI_UPLOADS_30_DAY_RETENTION). That file is not on main, so
 * this module is the stand-in. When it lands, read those exports from there
 * and set AI_UPLOADS_30_DAY_RETENTION to true: this branch already purges
 * AI uploads, outputs, and staged files in retention-sweep.
 */
import { retentionDaysOrDefault } from '../../supabase/functions/_shared/ai_tools.ts'
import type { LegalSlots } from './aiToolCopy.ts'

function readEnv(name: string): string {
  const env = import.meta.env as Record<string, string | undefined>
  const value = env[name]
  return typeof value === 'string' ? value.trim() : ''
}

function configuredLink(value: string, fallback: string): string {
  if (!value) return fallback
  if (value.startsWith('/') && !value.startsWith('//') && !/\s/.test(value)) return value
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString()
  } catch {
    return fallback
  }
  return fallback
}

export const BA_ENTITY = readEnv('VITE_LEGAL_ENTITY').slice(0, 160) || '[BA ENTITY]'
export const CR = readEnv('VITE_LEGAL_CR').slice(0, 40) || '[CR]'
export const AI_PROVIDER = readEnv('VITE_LEGAL_AI_PROVIDER').slice(0, 80) || '[AI PROVIDER]'
export const PRIVACY_LINK = configuredLink(readEnv('VITE_LEGAL_PRIVACY_LINK'), '/privacy')
export const TERMS_LINK = configuredLink(readEnv('VITE_LEGAL_TERMS_LINK'), '/terms')

/** Placeholders stay as written until config supplies a value. Nothing here is a legal name. */
export function legalSlotsFromEnv(retentionDays: number, date: string): LegalSlots {
  return {
    entity: BA_ENTITY,
    cr: CR,
    provider: AI_PROVIDER,
    privacy: PRIVACY_LINK,
    terms: TERMS_LINK,
    retentionDays: retentionDaysOrDefault(retentionDays),
    date,
  }
}

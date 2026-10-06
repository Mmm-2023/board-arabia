import { LEGAL_PENDING } from './legal.ts'

function configured(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function viteValue(read: () => unknown): unknown {
  try {
    return read()
  } catch {
    return undefined
  }
}

/**
 * Production controller and CR for Privacy and Terms.
 * Field names and the pending fallback stay in legal.ts.
 * This is the only client module that reads these two build values,
 * so they can stay on the legal-pages chunk.
 */
export function publishedLegalIdentity(): { baEntity: string; cr: string } {
  const entity = configured(viteValue(() => import.meta.env.VITE_LEGAL_BA_ENTITY))
  const cr = configured(viteValue(() => import.meta.env.VITE_LEGAL_CR))
  return {
    baEntity: entity || LEGAL_PENDING.en,
    cr: cr || LEGAL_PENDING.en,
  }
}

/** Weekly suggestion cards. Contact fields never pass through. */

import { isStoredAvatarStyle, type StoredAvatarStyle } from './avatarStyle.ts'

const PHONE = /\+?\d[\d\s()-]{7,}/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const AVATAR_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/avatar$/i

const LEAK_KEYS = ['email', 'contact_email', 'contact_phone', 'phone', 'linkedin_url'] as const

export type IntroSuggestion = {
  id: string
  suggested_id: string
  full_name: string
  headline: string
  company: string
  location: string
  reason: string
  avatar_style?: StoredAvatarStyle
  avatar_path: string | null
}

export function suggestionDetail(row: Pick<IntroSuggestion, 'headline' | 'company' | 'location'>): string {
  return [row.headline, row.company, row.location].map((item) => item.trim()).filter(Boolean).join(' · ')
}

export function presentIntroSuggestion(raw: unknown): IntroSuggestion | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  for (const key of LEAK_KEYS) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return null
  }
  const id = text(row.id, 80)
  const suggested = text(row.suggested_id, 80)
  const name = text(row.full_name, 200)
  const reason = text(row.reason, 200)
  if (!UUID.test(id) || !UUID.test(suggested) || !name || !reason) return null
  if (name.includes('@') || reason.includes('@') || PHONE.test(reason)) return null
  const headline = text(row.headline, 160)
  const company = text(row.company, 200)
  const location = text(row.location, 120)
  if ([headline, company, location].some((item) => item.includes('@') || PHONE.test(item))) return null
  return {
    id,
    suggested_id: suggested,
    full_name: name,
    headline,
    company,
    location,
    reason,
    avatar_style: isStoredAvatarStyle(row.avatar_style) ? row.avatar_style : undefined,
    avatar_path: typeof row.avatar_path === 'string' && AVATAR_PATH.test(row.avatar_path) ? row.avatar_path : null,
  }
}

export function presentIntroSuggestions(raw: unknown): IntroSuggestion[] {
  const rows = Array.isArray(raw) ? raw : []
  return rows.map(presentIntroSuggestion).filter((row): row is IntroSuggestion => row != null)
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

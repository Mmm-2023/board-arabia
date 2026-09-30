/**
 * P5 allowlist. Unknown keys are dropped.
 * Turnover, AUM band, capacity, phone, CR number, and statement never pass.
 */
export const ALLOWED_PROPERTIES = [
  'path',
  'page_type',
  'device_type',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'first_touch_source',
  'first_touch_medium',
  'consent_state',
  'title',
  'referrer_host',
  'engaged_seconds',
  'max_scroll_pct',
  'reached_50',
  'reached_75',
  'reached_90',
  'cta_location',
  'cta_label',
  'location',
  'entry_path',
  'has_invite',
  'role_group',
  'region_group',
  'step',
  'error_code',
  'method',
  'required',
  'steps_done',
  'days_since_verified',
  'optional_done_count',
  'tier',
  'seat_side',
  'days_since_request',
] as const

export type AllowedProperty = (typeof ALLOWED_PROPERTIES)[number]

export const BANNED_PROPERTIES = [
  'turnover',
  'fo_aum',
  'aum',
  'aum_band',
  'turnover_band',
  'financial_band',
  'scale_band',
  'investable_capacity',
  'investable_capacity_usd',
  'capacity',
  'phone',
  'cr',
  'cr_number',
  'commercial_registration',
  'statement',
  'statement_text',
  'full_name',
  'name',
  'email',
  'linkedin_url',
  'linkedin',
  'company',
  'company_name',
  'companies',
  'band',
  'invite_reason',
  'job_titles',
  'notes',
  'ip',
  '$ip',
  'user_agent',
  '$user_agent',
  '$device_id',
  '$session_id',
] as const

const ALLOWED = new Set<string>(ALLOWED_PROPERTIES)
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
const PHONE_RE = /(?:\+?\d[\d\s().-]{6,}\d)|\d{8,}/

const STRING_KEYS = new Set<AllowedProperty>([
  'path',
  'page_type',
  'device_type',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'first_touch_source',
  'first_touch_medium',
  'consent_state',
  'title',
  'referrer_host',
  'cta_location',
  'cta_label',
  'location',
  'entry_path',
  'role_group',
  'region_group',
  'step',
  'error_code',
  'method',
  'tier',
  'seat_side',
])

function cleanString(key: AllowedProperty, value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim().slice(0, key === 'title' || key === 'cta_label' ? 120 : 100)
  if (!text || EMAIL_RE.test(text) || PHONE_RE.test(text)) return null
  if (key === 'device_type' && text !== 'mobile' && text !== 'desktop') return null
  if (key === 'consent_state' && text !== 'anonymous' && text !== 'accepted') return null
  if (key === 'page_type' && !/^(home|apply|marketing|login|other)$/.test(text)) return null
  if (key === 'path' && !/^\/[a-z0-9/_-]{0,99}$/i.test(text)) return null
  if (
    (key === 'cta_location' || key === 'location' || key.startsWith('utm_') || key.startsWith('first_touch_')) &&
    !/^[a-z0-9][a-z0-9_-]{0,99}$/.test(text.toLowerCase())
  ) {
    return null
  }
  if (key === 'cta_location' || key === 'location' || key.startsWith('utm_') || key.startsWith('first_touch_')) {
    return text.toLowerCase()
  }
  if (key === 'referrer_host' && !/^[a-z0-9.-]{1,100}$/.test(text.toLowerCase())) return null
  if (key === 'referrer_host') return text.toLowerCase()
  if (key === 'entry_path' && !/^\/[a-z0-9/_-]{0,99}$/i.test(text)) return null
  if (key === 'role_group' && !/^(chairperson|board_member|c_suite|other)$/.test(text)) return null
  if (key === 'region_group' && !/^(ksa_gcc|intl)$/.test(text)) return null
  if (key === 'method' && !/^(code|link|password)$/.test(text)) return null
  if (key === 'tier' && !/^(founding|member)$/.test(text)) return null
  if (key === 'seat_side' && !/^(ksa|intl)$/.test(text)) return null
  if ((key === 'step' || key === 'error_code') && !/^[a-z0-9_]{1,40}$/.test(text)) return null
  return text
}

function cleanNumber(key: AllowedProperty, value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  if (key === 'engaged_seconds' && rounded >= 0 && rounded <= 86400) return rounded
  if (key === 'max_scroll_pct' && rounded >= 0 && rounded <= 100) return rounded
  if (
    (key === 'steps_done' || key === 'days_since_verified' || key === 'optional_done_count' || key === 'days_since_request') &&
    rounded >= 0 &&
    rounded <= 100000
  ) {
    return rounded
  }
  return null
}

export function sanitizeProperties(input: unknown): Record<string, string | number | boolean> {
  const clean: Record<string, string | number | boolean> = {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) return clean
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!ALLOWED.has(key)) continue
    const name = key as AllowedProperty
    if (name === 'reached_50' || name === 'reached_75' || name === 'reached_90' || name === 'has_invite' || name === 'required') {
      if (typeof value === 'boolean') clean[name] = value
      continue
    }
    if (
      name === 'engaged_seconds' ||
      name === 'max_scroll_pct' ||
      name === 'steps_done' ||
      name === 'days_since_verified' ||
      name === 'optional_done_count' ||
      name === 'days_since_request'
    ) {
      const number = cleanNumber(name, value)
      if (number != null) clean[name] = number
      continue
    }
    if (STRING_KEYS.has(name)) {
      const text = cleanString(name, value)
      if (text) clean[name] = text
    }
  }
  return clean
}

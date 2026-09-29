/** Profile availability and tags. The migration allowlist must match these lists. */

export const AVAILABILITY = ['open', 'selective', 'at_capacity'] as const

export type Availability = (typeof AVAILABILITY)[number]

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  open: 'Open',
  selective: 'Selective',
  at_capacity: 'At capacity',
}

export const SECTOR_TAGS = [
  'Energy transition',
  'Health',
  'Tourism',
  'Financial services',
  'Logistics',
  'Mining',
  'Digital infrastructure',
  'Food security',
] as const

export const VISION_2030_THEMES = [
  'Vibrant society',
  'Thriving economy',
  'Ambitious nation',
  'Quality of life',
  'Health transformation',
  'Housing',
  'Financial sector development',
  'Industrial development and logistics',
  'Renewable energy',
  'Tourism',
  'Food security',
  'Localization',
] as const

export const MAX_PROFILE_TAGS = 3

/** Example directory rows. Ids only. The migration stamps the same availability and themes. */
export const SAMPLE_DIRECTORY_TAGS = [
  {
    id: 'a1000001-0000-4000-8000-000000000001',
    availability: 'open',
    themes: ['Renewable energy', 'Thriving economy'],
  },
  {
    id: 'a1000001-0000-4000-8000-000000000002',
    availability: 'selective',
    themes: ['Health transformation'],
  },
  {
    id: 'a1000001-0000-4000-8000-000000000003',
    availability: 'open',
    themes: ['Quality of life'],
  },
  {
    id: 'a1000001-0000-4000-8000-000000000004',
    availability: 'at_capacity',
    themes: ['Financial sector development'],
  },
  {
    id: 'a1000001-0000-4000-8000-000000000005',
    availability: 'selective',
    themes: ['Industrial development and logistics'],
  },
  {
    id: 'a1000001-0000-4000-8000-000000000006',
    availability: 'open',
    themes: ['Thriving economy'],
  },
  {
    id: 'a1000001-0000-4000-8000-000000000007',
    availability: 'selective',
    themes: ['Localization'],
  },
  {
    id: 'a1000001-0000-4000-8000-000000000008',
    availability: 'at_capacity',
    themes: ['Food security'],
  },
] as const

export function isAvailability(value: unknown): value is Availability {
  return typeof value === 'string' && (AVAILABILITY as readonly string[]).includes(value)
}

export function availabilityLabel(value: Availability | null) {
  if (!value) return ''
  return AVAILABILITY_LABEL[value]
}

export function normalizeTags(value: unknown, allowed: readonly string[], max = MAX_PROFILE_TAGS) {
  const raw = Array.isArray(value) ? value : []
  const next: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed || !(allowed as readonly string[]).includes(trimmed) || next.includes(trimmed)) continue
    next.push(trimmed)
    if (next.length >= max) break
  }
  return next
}

export function toggleTag(
  current: readonly string[],
  tag: string,
  allowed: readonly string[],
  max = MAX_PROFILE_TAGS,
) {
  if (!(allowed as readonly string[]).includes(tag)) return { next: [...current], limited: false }
  if (current.includes(tag)) return { next: current.filter((item) => item !== tag), limited: false }
  if (current.length >= max) return { next: [...current], limited: true }
  return { next: [...current, tag], limited: false }
}

/** City picklist. The migration allowlist and aliases must match this module. */

export const CITIES = [
  { key: 'riyadh', label: 'Riyadh' },
  { key: 'jeddah', label: 'Jeddah' },
  { key: 'dammam_khobar', label: 'Dammam and Khobar' },
  { key: 'makkah', label: 'Makkah' },
  { key: 'madinah', label: 'Madinah' },
  { key: 'dubai', label: 'Dubai' },
  { key: 'abu_dhabi', label: 'Abu Dhabi' },
  { key: 'doha', label: 'Doha' },
  { key: 'kuwait_city', label: 'Kuwait City' },
  { key: 'manama', label: 'Manama' },
  { key: 'muscat', label: 'Muscat' },
  { key: 'london', label: 'London' },
  { key: 'other', label: 'Other' },
] as const

export type CityKey = (typeof CITIES)[number]['key']

export const OTHER_CITY_MAX = 120

/** Normalised first comma part. Hyphens become spaces. */
export const CITY_ALIASES: Record<string, CityKey> = {
  riyadh: 'riyadh',
  riaydh: 'riyadh',
  jeddah: 'jeddah',
  jiddah: 'jeddah',
  jidda: 'jeddah',
  dammam: 'dammam_khobar',
  khobar: 'dammam_khobar',
  'al khobar': 'dammam_khobar',
  'dammam and khobar': 'dammam_khobar',
  makkah: 'makkah',
  mecca: 'makkah',
  makka: 'makkah',
  madinah: 'madinah',
  medina: 'madinah',
  madina: 'madinah',
  'al madinah': 'madinah',
  dubai: 'dubai',
  'abu dhabi': 'abu_dhabi',
  doha: 'doha',
  kuwait: 'kuwait_city',
  'kuwait city': 'kuwait_city',
  manama: 'manama',
  muscat: 'muscat',
  masqat: 'muscat',
  london: 'london',
}

export function isCityKey(value: string): value is CityKey {
  return CITIES.some((city) => city.key === value)
}

export function isFixedCityKey(value: string): boolean {
  return isCityKey(value) && value !== 'other'
}

export function cityLabel(key: string): string {
  return CITIES.find((city) => city.key === key)?.label ?? ''
}

/** Trim, lower case, first comma part, hyphens to spaces, collapsed spaces. */
export function cityToken(raw: string): string {
  const first = raw.trim().toLowerCase().split(',')[0] ?? ''
  return first.replace(/[-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function cityKeyFromLocation(raw: string | null | undefined): CityKey | null {
  if (raw == null) return null
  const token = cityToken(raw)
  if (!token) return null
  return CITY_ALIASES[token] ?? 'other'
}

/**
 * Known cities use the picklist label as display text.
 * Anything else is other and keeps the trimmed text.
 */
export function mapStoredLocation(raw: string | null | undefined): {
  city_key: CityKey | null
  location: string | null
} {
  const key = cityKeyFromLocation(raw)
  if (!key) return { city_key: null, location: null }
  const trimmed = (raw ?? '').trim()
  if (key === 'other') return { city_key: 'other', location: trimmed }
  return { city_key: key, location: cityLabel(key) }
}

export function profileCityState(input: { city_key?: string | null; location?: string | null } | null | undefined): {
  key: CityKey | ''
  other: string
} {
  const stored = (input?.city_key ?? '').trim()
  const location = (input?.location ?? '').trim()
  if (isFixedCityKey(stored)) return { key: stored as CityKey, other: '' }
  if (stored === 'other') return { key: 'other', other: location }
  const derived = cityKeyFromLocation(location)
  if (!derived) return { key: '', other: '' }
  if (derived === 'other') return { key: 'other', other: location }
  return { key: derived, other: '' }
}

export function resolveProfileCity(
  key: string,
  otherText: string,
): { ok: true; city_key: CityKey | null; location: string | null } | { ok: false; error: string } {
  if (!key) return { ok: true, city_key: null, location: null }
  if (!isCityKey(key)) return { ok: false, error: 'Choose a city from the list.' }
  if (key === 'other') {
    const text = otherText.trim()
    if (!text) return { ok: false, error: 'Type a city, or choose one from the list.' }
    if (text.length > OTHER_CITY_MAX) return { ok: false, error: 'City can be 120 characters at most.' }
    return { ok: true, city_key: 'other', location: text }
  }
  return { ok: true, city_key: key, location: cityLabel(key) }
}

/** Saudi administrative regions, in the locked order. */
export const RE_REGIONS = [
  'Riyadh',
  'Makkah',
  'Madinah',
  'Eastern Province',
  'Asir',
  'Tabuk',
  'Qassim',
  "Ha'il",
  'Northern Borders',
  'Jazan',
  'Najran',
  'Al Bahah',
  'Al Jawf',
] as const

export type ReRegion = (typeof RE_REGIONS)[number]

/** Stored names that are projects, not regions. They stay off the filter. */
export const RE_GIGA_PROJECTS = ['NEOM', 'Red Sea', 'Qiddiya', 'Diriyah', 'ROSHN'] as const

/** Older stored values the check still accepts so existing rows remain valid. */
export const RE_LEGACY_PLACES = ['Jeddah', 'other', ...RE_GIGA_PROJECTS] as const

export const RE_STORED_CITIES = [...RE_REGIONS, ...RE_LEGACY_PLACES] as const

export type ReStoredCity = (typeof RE_STORED_CITIES)[number]

const GIGA_REGION: Record<(typeof RE_GIGA_PROJECTS)[number], ReRegion> = {
  NEOM: 'Tabuk',
  'Red Sea': 'Tabuk',
  Qiddiya: 'Riyadh',
  Diriyah: 'Riyadh',
  ROSHN: 'Riyadh',
}

const HINTS: readonly [string, ReRegion][] = [
  ['eastern province', 'Eastern Province'],
  ['northern borders', 'Northern Borders'],
  ['al bahah', 'Al Bahah'],
  ['al jawf', 'Al Jawf'],
  ['red sea', 'Tabuk'],
  ['qiddiya', 'Riyadh'],
  ['diriyah', 'Riyadh'],
  ['jeddah', 'Makkah'],
  ['neom', 'Tabuk'],
  ['makkah', 'Makkah'],
  ['madinah', 'Madinah'],
  ['asir', 'Asir'],
  ['tabuk', 'Tabuk'],
  ['qassim', 'Qassim'],
  ["ha'il", "Ha'il"],
  ['jazan', 'Jazan'],
  ['najran', 'Najran'],
  ['riyadh', 'Riyadh'],
]

export function isReRegion(value: string): value is ReRegion {
  return (RE_REGIONS as readonly string[]).includes(value)
}

export function reGigaTag(city: string): string | null {
  const value = city.trim()
  return (RE_GIGA_PROJECTS as readonly string[]).includes(value) ? value : null
}

/** Region named in free text. A non-Riyadh hit wins, so a ROSHN note can leave Riyadh. */
export function reRegionInText(hint: string): ReRegion | null {
  const text = hint.toLowerCase()
  let riyadh = false
  for (const [needle, region] of HINTS) {
    if (!text.includes(needle)) continue
    if (region !== 'Riyadh') return region
    riyadh = true
  }
  return riyadh ? 'Riyadh' : null
}

export function reRegionFor(city: string, hint = ''): ReRegion | null {
  const value = city.trim()
  if (isReRegion(value)) return value
  if (value === 'Jeddah') return 'Makkah'
  if (value === 'ROSHN') return reRegionInText(hint) ?? 'Riyadh'
  if ((RE_GIGA_PROJECTS as readonly string[]).includes(value)) {
    return GIGA_REGION[value as (typeof RE_GIGA_PROJECTS)[number]]
  }
  return null
}

export function rePlace(city: string, hint = ''): { region: string; tag: string | null } {
  return {
    region: reRegionFor(city, hint) ?? city,
    tag: reGigaTag(city),
  }
}

/** Focus chips and the offer/ask match. Fixed lists only. No free-text matching. */

export const CAN_HELP_WITH = [
  'Board experience',
  'Co-investment',
  'Deal introductions',
  'Market entry into Saudi Arabia',
  'GCC partners',
  'Family office peers',
  'Talent and executives',
  'Government and regulatory know-how',
] as const

export const LOOKING_FOR = [
  'Board seat',
  'Co-investors',
  'Deal flow',
  'Advisers',
  'Capital for my company',
  'Partners in a sector',
  'Peers to compare notes',
] as const

export const LANGUAGES = ['Arabic', 'English', 'French', 'Urdu', 'Hindi', 'Other'] as const

export const MAX_FOCUS_CHIPS = 3
export const FOCUS_LINE_MAX = 140

/**
 * Looking-for chip to the can-help chip that satisfies it.
 * Capital for my company and Co-investors both map to Co-investment.
 * Market entry, Talent and executives, and languages are not match keys.
 */
export const LOOKING_FOR_TO_HELP: Record<(typeof LOOKING_FOR)[number], (typeof CAN_HELP_WITH)[number]> = {
  'Board seat': 'Board experience',
  'Co-investors': 'Co-investment',
  'Deal flow': 'Deal introductions',
  Advisers: 'Government and regulatory know-how',
  'Capital for my company': 'Co-investment',
  'Partners in a sector': 'GCC partners',
  'Peers to compare notes': 'Family office peers',
}

/** One shared sector scores 3. One chip match scores 1, so a sector stays stronger. */
export const FOCUS_CHIP_WEIGHT = 1

/** Suggested Vision 2030 themes for a sector. The member taps to add. Nothing is saved automatically. */
export const SECTOR_THEME_SUGGESTIONS: Record<string, readonly string[]> = {
  'Energy transition': ['Renewable energy'],
  Health: ['Health transformation'],
  Tourism: ['Tourism', 'Quality of life'],
  'Financial services': ['Financial sector development'],
  Logistics: ['Industrial development and logistics'],
  Mining: ['Localization'],
  'Digital infrastructure': ['Thriving economy'],
  'Food security': ['Food security'],
  'Real estate': ['Housing'],
  'Industrials and manufacturing': ['Industrial development and logistics'],
  'Technology and telecom': ['Thriving economy'],
  'Consumer and retail': ['Quality of life'],
  'Construction and infrastructure': ['Housing'],
  Education: ['Ambitious nation'],
  'Media and entertainment': ['Vibrant society'],
  'Utilities and water': ['Ambitious nation'],
}

export function allowedChips(value: unknown, allowed: readonly string[], max = MAX_FOCUS_CHIPS): string[] {
  const raw = Array.isArray(value) ? value : []
  const next: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed || !allowed.includes(trimmed) || next.includes(trimmed)) continue
    next.push(trimmed)
    if (next.length >= max) break
  }
  return next
}

export function suggestedVisionThemes(sectors: readonly string[]): string[] {
  const next: string[] = []
  for (const sector of sectors) {
    const themes = SECTOR_THEME_SUGGESTIONS[sector] ?? []
    for (const theme of themes) {
      if (!next.includes(theme)) next.push(theme)
    }
  }
  return next
}

/** Help chips on the other member that satisfy this member's looking-for chips. Order follows the ask. */
export function matchedHelpChips(lookingFor: readonly string[], canHelp: readonly string[]): string[] {
  const offered = new Set(allowedChips(canHelp, CAN_HELP_WITH))
  const next: string[] = []
  for (const ask of allowedChips(lookingFor, LOOKING_FOR)) {
    const help = LOOKING_FOR_TO_HELP[ask as (typeof LOOKING_FOR)[number]]
    if (!help || !offered.has(help) || next.includes(help)) continue
    next.push(help)
  }
  return next
}

function chipInSentence(chip: string): string {
  const trimmed = chip.trim()
  const first = trimmed.split(' ')[0] ?? ''
  if (first.length > 1 && first === first.toUpperCase()) return trimmed
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1)
}

export function focusMatchReason(chip: string): string {
  return `They can help with ${chipInSentence(chip)}, which you are looking for.`
}

/** Empty when the line can be stored. Rejects email and phone-like runs. Years in words are fine. */
export function focusLineProblem(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.length > FOCUS_LINE_MAX) return 'That line can be 140 characters at most.'
  if (trimmed.includes('@') || focusLineHasPhone(trimmed)) {
    return 'Do not add an email or a phone number on that line.'
  }
  return ''
}

export function focusLineHasPhone(value: string): boolean {
  const pattern = /\+?[0-9][0-9\s().-]{6,}/g
  for (const match of value.matchAll(pattern)) {
    const digits = match[0].replace(/[^0-9]/g, '')
    if (digits.length >= 8) return true
  }
  return false
}

/**
 * Staff mandate shortlist.
 * Score: 3 per shared sector, 2 per shared Vision 2030 theme,
 * 2 when availability is Open, 1 when it is Selective.
 * The migration uses the same weights. Sample and inactive members stay out.
 */
import {
  SECTOR_TAGS,
  VISION_2030_THEMES,
  availabilityLabel,
  isAvailability,
  normalizeTags,
} from './profileTags.ts'

export const MATCH_SECTOR_POINTS = 3
export const MATCH_VISION_POINTS = 2
export const MATCH_OPEN_POINTS = 2
export const MATCH_SELECTIVE_POINTS = 1

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type FitAvailability = 'open' | 'selective'

export type MandateTagInput = {
  sector: string
  sectorTags: readonly string[]
  visionThemes: readonly string[]
}

export type MatchCandidate = {
  userId: string
  fullName: string
  headline: string
  company: string
  seat: string
  isDemo: boolean
  status: string
  availability: string | null
  sectorTags: readonly string[]
  visionThemes: readonly string[]
}

export type StaffMandateBrief = {
  id: string
  isDemo: boolean
  published: boolean
  sector: string
  dealType: string
  ticketBand: string
  geography: string
  stage: string
  oneLiner: string
  companyName: string
  sectorTags: string[]
  visionThemes: string[]
  matchCount: number
}

export type MandateMatchRow = {
  userId: string
  fullName: string
  headline: string
  company: string
  seat: string
  availability: FitAvailability
  sectorOverlap: string[]
  visionOverlap: string[]
  score: number
}

export type StaffMandateMatch = Omit<StaffMandateBrief, 'matchCount'> & {
  matches: MandateMatchRow[]
}

export function mandateTagSets(input: MandateTagInput) {
  const storedSectors = normalizeTags(input.sectorTags, SECTOR_TAGS, SECTOR_TAGS.length)
  const sector = input.sector.trim()
  const sectorTags =
    storedSectors.length > 0
      ? storedSectors
      : (SECTOR_TAGS as readonly string[]).includes(sector)
        ? [sector]
        : []
  return {
    sectorTags,
    visionThemes: normalizeTags(input.visionThemes, VISION_2030_THEMES, VISION_2030_THEMES.length),
  }
}

export function mandateHasTags(input: MandateTagInput) {
  const tags = mandateTagSets(input)
  return tags.sectorTags.length + tags.visionThemes.length > 0
}

export function matchScore(sectorCount: number, visionCount: number, availability: FitAvailability) {
  const availabilityPoints = availability === 'open' ? MATCH_OPEN_POINTS : MATCH_SELECTIVE_POINTS
  return sectorCount * MATCH_SECTOR_POINTS + visionCount * MATCH_VISION_POINTS + availabilityPoints
}

function overlap(mandateTags: readonly string[], memberTags: readonly string[], allowed: readonly string[]) {
  const member = new Set(normalizeTags(memberTags, allowed, allowed.length))
  return normalizeTags(mandateTags, allowed, allowed.length).filter((tag) => member.has(tag))
}

function fitAvailability(value: string | null): FitAvailability | null {
  if (value !== 'open' && value !== 'selective') return null
  return value
}

export function rankMandateMatches(mandate: MandateTagInput, candidates: readonly MatchCandidate[]): MandateMatchRow[] {
  const tags = mandateTagSets(mandate)
  if (tags.sectorTags.length + tags.visionThemes.length === 0) return []
  const ranked: MandateMatchRow[] = []
  for (const candidate of candidates) {
    if (candidate.isDemo || candidate.status !== 'active') continue
    const availability = fitAvailability(candidate.availability)
    if (!availability) continue
    const sectorOverlap = overlap(tags.sectorTags, candidate.sectorTags, SECTOR_TAGS)
    const visionOverlap = overlap(tags.visionThemes, candidate.visionThemes, VISION_2030_THEMES)
    if (sectorOverlap.length + visionOverlap.length === 0) continue
    const name = candidate.fullName.trim() || 'Member'
    ranked.push({
      userId: candidate.userId,
      fullName: name,
      headline: candidate.headline.trim(),
      company: candidate.company.trim(),
      seat: candidate.seat,
      availability,
      sectorOverlap,
      visionOverlap,
      score: matchScore(sectorOverlap.length, visionOverlap.length, availability),
    })
  }
  ranked.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score
    if (right.sectorOverlap.length !== left.sectorOverlap.length) {
      return right.sectorOverlap.length - left.sectorOverlap.length
    }
    if (right.visionOverlap.length !== left.visionOverlap.length) {
      return right.visionOverlap.length - left.visionOverlap.length
    }
    const name = left.fullName.localeCompare(right.fullName, 'en')
    if (name !== 0) return name
    return left.userId.localeCompare(right.userId)
  })
  return ranked
}

export function matchReason(row: Pick<MandateMatchRow, 'sectorOverlap' | 'visionOverlap'>) {
  const parts: string[] = []
  if (row.sectorOverlap.length > 0) parts.push(`Sector: ${row.sectorOverlap.join(', ')}`)
  if (row.visionOverlap.length > 0) parts.push(`Vision 2030: ${row.visionOverlap.join(', ')}`)
  return parts.join('. ')
}

export function shortlistText(
  mandate: { sector: string; dealType: string },
  matches: readonly MandateMatchRow[],
) {
  const lines = matches.map((row, index) => {
    const reason = matchReason(row)
    return `${index + 1}. ${row.fullName}. Score ${row.score}. ${availabilityLabel(row.availability)}. ${reason}.`
  })
  return [`Shortlist for ${mandate.sector}, ${mandate.dealType}`, ...lines].join('\n')
}

export function memberAdminHref(userId: string) {
  if (!UUID_RE.test(userId)) return null
  return `/admin/people#member-${userId}`
}

export function isMandateId(value: string) {
  return UUID_RE.test(value)
}

function text(value: unknown, max: number) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function flag(value: unknown) {
  return value === true
}

function countOf(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.floor(value)
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim())
  return 0
}

function presentBrief(row: Record<string, unknown>): StaffMandateBrief | null {
  const id = text(row.id, 80)
  if (!isMandateId(id)) return null
  const sector = text(row.sector, 120)
  const tags = mandateTagSets({
    sector,
    sectorTags: Array.isArray(row.sector_tags) ? row.sector_tags.filter((item) => typeof item === 'string') : [],
    visionThemes: Array.isArray(row.vision_themes) ? row.vision_themes.filter((item) => typeof item === 'string') : [],
  })
  return {
    id,
    isDemo: flag(row.is_demo),
    published: flag(row.published),
    sector,
    dealType: text(row.deal_type, 120),
    ticketBand: text(row.ticket_band, 80),
    geography: text(row.geography, 80),
    stage: text(row.stage, 80),
    oneLiner: text(row.one_liner, 280),
    companyName: text(row.company_name, 200),
    sectorTags: tags.sectorTags,
    visionThemes: tags.visionThemes,
    matchCount: countOf(row.match_count),
  }
}

export function presentStaffMandateList(raw: unknown): StaffMandateBrief[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const brief = presentBrief(item as Record<string, unknown>)
    return brief ? [brief] : []
  })
}

function presentMatch(raw: unknown): MandateMatchRow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const userId = text(row.user_id, 80)
  if (!isMandateId(userId)) return null
  const availability = isAvailability(row.availability) ? fitAvailability(row.availability) : null
  if (!availability) return null
  const sectorOverlap = normalizeTags(
    Array.isArray(row.sector_overlap) ? row.sector_overlap : [],
    SECTOR_TAGS,
    SECTOR_TAGS.length,
  )
  const visionOverlap = normalizeTags(
    Array.isArray(row.vision_overlap) ? row.vision_overlap : [],
    VISION_2030_THEMES,
    VISION_2030_THEMES.length,
  )
  if (sectorOverlap.length + visionOverlap.length === 0) return null
  return {
    userId,
    fullName: text(row.full_name, 200) || 'Member',
    headline: text(row.headline, 160),
    company: text(row.company, 200),
    seat: text(row.seat, 40),
    availability,
    sectorOverlap,
    visionOverlap,
    score: matchScore(sectorOverlap.length, visionOverlap.length, availability),
  }
}

export function presentStaffMandateMatch(raw: unknown): StaffMandateMatch | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const brief = presentBrief(row)
  if (!brief) return null
  const matches = Array.isArray(row.matches)
    ? row.matches.flatMap((item) => {
        const match = presentMatch(item)
        return match ? [match] : []
      })
    : []
  return {
    id: brief.id,
    isDemo: brief.isDemo,
    published: brief.published,
    sector: brief.sector,
    dealType: brief.dealType,
    ticketBand: brief.ticketBand,
    geography: brief.geography,
    stage: brief.stage,
    oneLiner: brief.oneLiner,
    companyName: brief.companyName,
    sectorTags: brief.sectorTags,
    visionThemes: brief.visionThemes,
    matches,
  }
}

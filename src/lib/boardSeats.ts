import { BOARD_EXPERTISE } from './boardroom.ts'
import { normalizeTags, SECTOR_TAGS } from './profileTags.ts'
import { RE_REGIONS } from './reRegions.ts'

/** General seats on the existing board roles table. Real estate kinds stay separate. */

export const BOARD_SEAT_KINDS = ['company_board', 'ned', 'adviser'] as const

export type BoardSeatKind = (typeof BOARD_SEAT_KINDS)[number]

export const BOARD_SEAT_KIND_LABEL: Record<BoardSeatKind, string> = {
  company_board: 'Company board',
  ned: 'Non-executive',
  adviser: 'Adviser',
}

export const BOARD_SEAT_STATUSES = ['draft', 'pending_review', 'published', 'closed'] as const

export type BoardSeatStatus = (typeof BOARD_SEAT_STATUSES)[number]

export const BOARD_SEAT_STATUS_LABEL: Record<BoardSeatStatus, string> = {
  draft: 'Draft',
  pending_review: 'Waiting for approval',
  published: 'Published',
  closed: 'Closed',
}

export const BOARD_SEAT_LIMITS = {
  title: 160,
  sector: 120,
  capacity: 160,
  organisation: 200,
  terms: 400,
  narrative: 2000,
  contactName: 120,
  contactPhone: 40,
  sectors: SECTOR_TAGS.length,
  regions: RE_REGIONS.length,
} as const

const PHONE = /[0-9](?:[0-9]|[\s\-().]){6,}[0-9]/

export type BoardSeatDraft = {
  seatKind: BoardSeatKind
  title: string
  sector: string
  capacity: string
  sectorTags: string[]
  regions: string[]
  organisationName: string
  terms: string
  contactName: string
  contactEmail: string
  contactPhone: string
  narrative: string
  skillsWanted: string[]
}

export type BoardSeatRow = BoardSeatDraft & {
  id: string
  isDemo: boolean
  status: BoardSeatStatus
  posterName: string | null
  applicantCount: number
}

export type BoardSeatApplicant = {
  id: string
  memberName: string
  headline: string
  company: string
  note: string
  status: string
}

export type UnreadNotification = {
  id: string
  title: string
  body: string
}

export function emptyBoardSeatDraft(): BoardSeatDraft {
  return {
    seatKind: 'company_board',
    title: '',
    sector: '',
    capacity: '',
    sectorTags: [],
    regions: [],
    organisationName: '',
    terms: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    narrative: '',
    skillsWanted: [],
  }
}

export function boardSeatKindLabel(value: string) {
  return BOARD_SEAT_KIND_LABEL[value as BoardSeatKind] ?? value
}

function text(value: unknown, max: number) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== 'string') return null
  return (allowed as readonly string[]).includes(value) ? (value as T) : null
}

function stringList(value: unknown, allowed: readonly string[], max: number) {
  return normalizeTags(value, allowed, max)
}

function leaksContact(value: string) {
  return value.includes('@') || PHONE.test(value)
}

export function boardSeatProblem(draft: BoardSeatDraft, mode: 'draft' | 'publish') {
  const title = draft.title.trim()
  const sector = draft.sector.trim()
  const capacity = draft.capacity.trim()
  const organisation = draft.organisationName.trim()
  const terms = draft.terms.trim()
  const narrative = draft.narrative.trim()
  const org = organisation.toLowerCase()
  if (!oneOf(draft.seatKind, BOARD_SEAT_KINDS)) return 'Choose a seat kind.'
  if (!title || title.length > BOARD_SEAT_LIMITS.title) return 'Enter a title.'
  if (!sector || sector.length > BOARD_SEAT_LIMITS.sector) return 'Enter a sector.'
  if (!capacity || capacity.length > BOARD_SEAT_LIMITS.capacity) return 'Enter the time commitment.'
  if (!organisation || organisation.length > BOARD_SEAT_LIMITS.organisation) return 'Enter the organisation.'
  if (!terms || terms.length > BOARD_SEAT_LIMITS.terms) return 'Enter the seat terms.'
  if (!narrative || narrative.length > BOARD_SEAT_LIMITS.narrative) return 'Enter a short narrative.'
  if (
    [title, sector, capacity, organisation, terms, narrative].some((value) => value.includes('@'))
    || [title, sector, capacity].some((value) => org && value.toLowerCase().includes(org))
    || [title, sector, capacity, terms, narrative].some((value) => PHONE.test(value))
  ) {
    return 'Keep the organisation, @, and phone numbers out of the public lines.'
  }
  const tags = stringList(draft.sectorTags, SECTOR_TAGS, BOARD_SEAT_LIMITS.sectors)
  const regions = stringList(draft.regions, RE_REGIONS, BOARD_SEAT_LIMITS.regions)
  if (tags.length !== draft.sectorTags.length || regions.length !== draft.regions.length) {
    return 'Use the sector and region lists.'
  }
  if (mode === 'publish' && tags.length === 0 && regions.length === 0) {
    return 'Choose at least one sector or region before you publish.'
  }
  const skills = stringList(draft.skillsWanted, BOARD_EXPERTISE, 3)
  if (skills.length !== draft.skillsWanted.length) return 'Choose expertise from the list. Up to 3.'
  if (draft.seatKind === 'company_board') {
    const name = draft.contactName.trim()
    const email = draft.contactEmail.trim()
    const phone = draft.contactPhone.trim()
    if (!name || !email || !phone) return 'Enter a company contact name, email, and phone.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a contact email like name@example.com.'
    if (name.length > BOARD_SEAT_LIMITS.contactName || phone.length > BOARD_SEAT_LIMITS.contactPhone) {
      return 'Shorten the company contact.'
    }
    if (name.includes('@') || phone.includes('@')) return 'Put the email only in the email field.'
  }
  return ''
}

export function presentBoardSeat(raw: unknown): BoardSeatRow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const id = text(row.id, 80)
  const seatKind = oneOf(row.seat_kind, BOARD_SEAT_KINDS)
  const status = oneOf(row.status, BOARD_SEAT_STATUSES)
  const title = text(row.title, BOARD_SEAT_LIMITS.title)
  const sector = text(row.sector, BOARD_SEAT_LIMITS.sector)
  const capacity = text(row.capacity, BOARD_SEAT_LIMITS.capacity)
  const organisationName = text(row.organisation_name, BOARD_SEAT_LIMITS.organisation)
  const terms = text(row.terms, BOARD_SEAT_LIMITS.terms)
  const narrative = text(row.narrative, BOARD_SEAT_LIMITS.narrative)
  if (!id || !seatKind || !status || !title || !sector || !capacity || !organisationName || !terms || !narrative) {
    return null
  }
  const count = row.applicant_count
  return {
    id,
    isDemo: row.is_demo === true,
    seatKind,
    status,
    title,
    sector,
    capacity,
    sectorTags: stringList(row.sector_tags, SECTOR_TAGS, BOARD_SEAT_LIMITS.sectors),
    regions: stringList(row.regions, RE_REGIONS, BOARD_SEAT_LIMITS.regions),
    skillsWanted: stringList(row.skills_wanted, BOARD_EXPERTISE, 3),
    organisationName,
    terms,
    narrative,
    contactName: text(row.contact_name, BOARD_SEAT_LIMITS.contactName),
    contactEmail: text(row.contact_email, 320),
    contactPhone: text(row.contact_phone, BOARD_SEAT_LIMITS.contactPhone),
    posterName: row.poster_name == null ? null : text(row.poster_name, 120) || 'Member',
    applicantCount: typeof count === 'number' && Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0,
  }
}

export function presentBoardSeatList(raw: unknown): BoardSeatRow[] {
  const rows = Array.isArray(raw) ? raw : []
  return rows.map(presentBoardSeat).filter((row): row is BoardSeatRow => row != null)
}

export function presentBoardSeatApplicant(raw: unknown): BoardSeatApplicant | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const id = text(row.id, 80)
  const memberName = text(row.member_name, 120)
  const headline = text(row.headline, 160)
  const company = text(row.company, 200)
  const note = text(row.note, 400)
  const status = text(row.status, 40)
  if (!id || !memberName || !status) return null
  if ([memberName, headline, company, note].some((value) => leaksContact(value))) return null
  return { id, memberName, headline, company, note, status }
}

export function presentBoardSeatApplicants(raw: unknown): BoardSeatApplicant[] {
  const rows = Array.isArray(raw) ? raw : []
  return rows.map(presentBoardSeatApplicant).filter((row): row is BoardSeatApplicant => row != null)
}

export function presentUnreadNotification(raw: unknown): UnreadNotification | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const id = text(row.id, 80)
  const title = text(row.title, 120)
  const body = text(row.body, 280)
  if (!id || !title) return null
  if (leaksContact(title) || leaksContact(body)) return null
  return { id, title, body }
}

export function notificationLine(note: UnreadNotification) {
  const body = note.body.trim()
  if (!body) return note.title.trim()
  return `${note.title.trim()} ${body}`
}

export function draftFromBoardSeat(seat: BoardSeatRow): BoardSeatDraft {
  return {
    seatKind: seat.seatKind,
    title: seat.title,
    sector: seat.sector,
    capacity: seat.capacity,
    sectorTags: seat.sectorTags,
    regions: seat.regions,
    organisationName: seat.organisationName,
    terms: seat.terms,
    contactName: seat.contactName,
    contactEmail: seat.contactEmail,
    contactPhone: seat.contactPhone,
    narrative: seat.narrative,
    skillsWanted: seat.skillsWanted,
  }
}

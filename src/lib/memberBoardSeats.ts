import { normalizeTags, SECTOR_TAGS } from './profileTags.ts'
import { RE_REGIONS } from './reRegions.ts'
import {
  BOARD_SEAT_KINDS,
  BOARD_SEAT_LIMITS,
  BOARD_SEAT_STATUSES,
  type BoardSeatKind,
  type BoardSeatStatus,
} from './boardSeats.ts'

/** What a member posts, and what a poster may see. No contact fields. */

export const BOARD_SEAT_NOTE_LIMIT = 400

const PHONE = /[0-9](?:[0-9]|[\s\-().]){6,}[0-9]/

const APPLICATION_STATUSES = ['pending', 'approved', 'declined'] as const

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export type MemberSeatDraft = {
  seatKind: BoardSeatKind
  title: string
  sector: string
  capacity: string
  sectorTags: string[]
  regions: string[]
  organisationName: string
  terms: string
  narrative: string
}

export type PublishedBoardSeat = {
  id: string
  seatKind: BoardSeatKind
  status: BoardSeatStatus
  title: string
  sector: string
  capacity: string
  sectorTags: string[]
  regions: string[]
  organisationName: string
  terms: string
  narrative: string
  isDemo: boolean
  posterIsPartner: boolean
}

export type BoardSeatDetail = PublishedBoardSeat & {
  mine: boolean
  applicationStatus: ApplicationStatus | null
  showCardToPartners: boolean
}

export type BoardSeatApplication = {
  id: string
  roleId: string
  title: string
  organisationName: string
  seatKind: BoardSeatKind
  seatStatus: BoardSeatStatus
  status: ApplicationStatus
  note: string
}

export type PostedBoardSeat = {
  id: string
  title: string
  organisationName: string
  seatKind: BoardSeatKind
  status: BoardSeatStatus
  sector: string
  capacity: string
  applicantCount: number
}

export type ShortlistPerson = {
  id: string
  memberName: string
  headline: string
  company: string
  note: string
  status: string
}

export function emptyMemberSeatDraft(): MemberSeatDraft {
  return {
    seatKind: 'ned',
    title: '',
    sector: '',
    capacity: '',
    sectorTags: [],
    regions: [],
    organisationName: '',
    terms: '',
    narrative: '',
  }
}

function text(value: unknown, max: number) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== 'string') return null
  return (allowed as readonly string[]).includes(value) ? (value as T) : null
}

export function leaksContact(value: string) {
  return value.includes('@') || PHONE.test(value)
}

export function memberSeatProblem(draft: MemberSeatDraft) {
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
    return 'Keep the organisation, email addresses, and phone numbers out of the public lines.'
  }
  const tags = normalizeTags(draft.sectorTags, SECTOR_TAGS, BOARD_SEAT_LIMITS.sectors)
  const regions = normalizeTags(draft.regions, RE_REGIONS, BOARD_SEAT_LIMITS.regions)
  if (tags.length !== draft.sectorTags.length || regions.length !== draft.regions.length) {
    return 'Use the sector and region lists.'
  }
  if (tags.length === 0 && regions.length === 0) {
    return 'Choose at least one sector or region.'
  }
  return ''
}

export function boardSeatNoteProblem(note: string) {
  const value = note.trim()
  if (!value) return ''
  if (value.length > BOARD_SEAT_NOTE_LIMIT) return 'Shorten the note.'
  if (leaksContact(value)) return 'Keep email addresses and phone numbers out of the note.'
  return ''
}

function publishedSeat(row: Record<string, unknown>): PublishedBoardSeat | null {
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
  const publicLines = [title, sector, capacity, organisationName, terms, narrative]
  if (publicLines.some((value) => leaksContact(value))) return null
  return {
    id,
    seatKind,
    status,
    title,
    sector,
    capacity,
    sectorTags: normalizeTags(row.sector_tags, SECTOR_TAGS, BOARD_SEAT_LIMITS.sectors),
    regions: normalizeTags(row.regions, RE_REGIONS, BOARD_SEAT_LIMITS.regions),
    organisationName,
    terms,
    narrative,
    isDemo: row.is_demo === true,
    posterIsPartner: row.poster_is_partner === true,
  }
}

export function presentPublishedBoardSeats(raw: unknown): PublishedBoardSeat[] {
  const rows = Array.isArray(raw) ? raw : []
  return rows
    .map((item) => (item && typeof item === 'object' && !Array.isArray(item) ? publishedSeat(item as Record<string, unknown>) : null))
    .filter((row): row is PublishedBoardSeat => row != null)
}

export function presentBoardSeatDetail(raw: unknown): BoardSeatDetail | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const seat = publishedSeat(row)
  if (!seat) return null
  const application = row.application_status == null ? null : oneOf(row.application_status, APPLICATION_STATUSES)
  if (row.application_status != null && application == null) return null
  return {
    ...seat,
    mine: row.mine === true,
    applicationStatus: application,
    showCardToPartners: row.show_card_to_partners === true,
  }
}

export function presentBoardSeatApplications(raw: unknown): BoardSeatApplication[] {
  const rows = Array.isArray(raw) ? raw : []
  return rows
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null
      const row = item as Record<string, unknown>
      const id = text(row.id, 80)
      const roleId = text(row.role_id, 80)
      const title = text(row.title, BOARD_SEAT_LIMITS.title)
      const organisationName = text(row.organisation_name, BOARD_SEAT_LIMITS.organisation)
      const seatKind = oneOf(row.seat_kind, BOARD_SEAT_KINDS)
      const seatStatus = oneOf(row.seat_status, BOARD_SEAT_STATUSES)
      const status = oneOf(row.status, APPLICATION_STATUSES)
      const note = text(row.note, BOARD_SEAT_NOTE_LIMIT)
      if (!id || !roleId || !title || !organisationName || !seatKind || !seatStatus || !status) return null
      if ([title, organisationName, note].some((value) => leaksContact(value))) return null
      return { id, roleId, title, organisationName, seatKind, seatStatus, status, note }
    })
    .filter((row): row is BoardSeatApplication => row != null)
}

export function presentPostedBoardSeats(raw: unknown): PostedBoardSeat[] {
  const rows = Array.isArray(raw) ? raw : []
  return rows
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null
      const row = item as Record<string, unknown>
      const id = text(row.id, 80)
      const title = text(row.title, BOARD_SEAT_LIMITS.title)
      const organisationName = text(row.organisation_name, BOARD_SEAT_LIMITS.organisation)
      const seatKind = oneOf(row.seat_kind, BOARD_SEAT_KINDS)
      const status = oneOf(row.status, BOARD_SEAT_STATUSES)
      const sector = text(row.sector, BOARD_SEAT_LIMITS.sector)
      const capacity = text(row.capacity, BOARD_SEAT_LIMITS.capacity)
      const count = row.applicant_count
      if (!id || !title || !organisationName || !seatKind || !status) return null
      if ([title, organisationName, sector, capacity].some((value) => leaksContact(value))) return null
      return {
        id,
        title,
        organisationName,
        seatKind,
        status,
        sector,
        capacity,
        applicantCount: typeof count === 'number' && Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0,
      }
    })
    .filter((row): row is PostedBoardSeat => row != null)
}

export function presentShortlist(raw: unknown): ShortlistPerson[] {
  const rows = Array.isArray(raw) ? raw : []
  return rows
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null
      const row = item as Record<string, unknown>
      const id = text(row.id, 80)
      const memberName = text(row.member_name, 120)
      const headline = text(row.headline, 160)
      const company = text(row.company, 200)
      const note = text(row.note, BOARD_SEAT_NOTE_LIMIT)
      const status = text(row.status, 40)
      if (!id || !memberName || !status) return null
      if ([memberName, headline, company, note].some((value) => leaksContact(value))) return null
      return { id, memberName, headline, company, note, status }
    })
    .filter((row): row is ShortlistPerson => row != null)
}

export function applicationStatusLabel(status: ApplicationStatus) {
  if (status === 'pending') return 'Put yourself forward'
  if (status === 'approved') return 'Introduction open'
  return 'Not taken forward'
}

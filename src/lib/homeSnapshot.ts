/**
 * Member Home snapshot. Pure shaping only: no fetches, no invented totals.
 * Founding seats are ksa and intl. Any other seat is a Member.
 * A Sponsor badge is intentionally not decided here.
 * Vouchers and personal capacity stay Founding-only.
 * Example rows follow public.demo_thresholds via demoRowsVisible.
 */
import { formatMajlisWhen, MAJLIS_REGIONS, countPublishedByRegion } from '../../supabase/functions/_shared/majlis.ts'
import { formatPublicUsd } from './capacity.ts'
import { DEMO_THRESHOLD_DEFAULTS, demoRowsVisible } from './demoThreshold.ts'
import { displayPlatformMoney } from './platformFloors.ts'
import { seatLine, type PlatformStats } from './platformStats.ts'

export type MembershipBadge = 'Founding' | 'Member'
export type HomeCtaId = 'profile' | 'intro' | 'majlis' | 'mandate' | 'invite'
export type IntroState = 'pending' | 'approved' | 'declined' | null

export type HomeCta = {
  id: HomeCtaId
  label: string
  to: string
}

export type Headline = {
  id: 'intros' | 'mandates' | 'vouchers' | 'rooms' | 'directory'
  label: string
  value: string
  body: string
  to: string
  example: boolean
}

export type HomeGathering = {
  id: string
  title: string
  region: string
  startsAt: string
  endsAt: string
  status: string
  host: boolean
  rsvp: 'registered' | 'waitlist' | 'cancelled' | null
}

export type MandateBrief = {
  id: string
  is_demo: boolean
  sector: string
  deal_type: string
  ticket_band: string
  geography: string
  stage: string
  one_liner: string
  intro_status: IntroState
}

export type RoomBrief = {
  id: string
  is_demo: boolean
  name: string
  sector: string
  stage: string
}

export type DirectoryBrief = {
  id: string
  is_demo: boolean
  full_name: string
  headline: string
  seat: 'ksa' | 'intl'
}

export type PartnerBrief = {
  id: string
  is_demo: boolean
  name: string
  monogram: string
}

export type HomeActivity = {
  id: string
  kind: 'intro' | 'majlis'
  label: string
  detail: string
  happenedAt: string
  href: string
  example: boolean
}

export type AttentionItem = {
  title: string
  body: string
  to: string
  cta: string
}

export type HomeModel = {
  identity: {
    name: string
    initials: string
    photoUrl: string | null
    badge: MembershipBadge
    founding: boolean
    seatLabel: string
    profileNeedsWork: boolean
    profileTo: string
  }
  attention: AttentionItem[]
  pulse: Headline[]
  majlis: {
    title: string
    body: string
    to: string
  } | null
  cta: HomeCta | null
  platform: {
    fill: { admitted: number; label: string; split: string; personal: boolean } | null
    capacityNote: string | null
    regions: { region: string; count: number; to: string }[]
    regionsKnown: boolean
    money: { label: string; value: string }[]
    partners: { id: string; name: string; monogram: string; example: boolean }[]
  }
  teasers: {
    directory: { id: string; name: string; headline: string; seat: string; example: boolean }[]
    mandates: MandateTeaser[]
    rooms: { id: string; name: string; sector: string; stage: string; example: boolean }[]
    majlis: { id: string; title: string; region: string; when: string }[]
  }
  activity: HomeActivity[]
  activityStatus: 'loading' | 'ready' | 'empty' | 'unavailable' | 'error'
  loading: boolean
  partialError: boolean
  updatedLabel: string | null
}

export type MandateTeaser = {
  id: string
  example: boolean
  sector: string
  dealType: string
  ticketBand: string
  geography: string
  stage: string
  oneLiner: string
}

export type CtaInput = {
  profileReady: boolean
  mustSetPassword: boolean
  pendingIntros: number | null
  canRegisterMajlis: boolean
  openMajlisId: string | null
  newMandates: number | null
  founding: boolean
  invitesRemaining: number
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const PHONE = /\+?\d[\d\s()-]{7,}/
const ACTIVITY_LABELS = new Set([
  'Intro requested',
  'Intro approved',
  'Intro declined',
  'Majlis registration',
  'Majlis waitlist',
  'Majlis you are hosting',
])
const ACTIVITY_HREF = /^\/dashboard\/(?:deals\/mandates|mandates|people\/intros|majlis)(?:\?event=[0-9a-f-]{36})?$/
const LEAK_KEYS = [
  'email',
  'contact_email',
  'contact_phone',
  'phone',
  'exact_amount',
  'company_name',
  'recipient',
  'token',
  'deck_url',
]

export function isFoundingMember(seat: string): boolean {
  return seat === 'ksa' || seat === 'intl'
}

export function membershipBadge(seat: string): MembershipBadge {
  return isFoundingMember(seat) ? 'Founding' : 'Member'
}

export function homeSeatLabel(seat: string): string {
  if (seat === 'ksa') return 'Saudi Arabia'
  if (seat === 'intl') return 'International'
  return 'Member seat'
}

export function canRegisterMajlis(seat: string): boolean {
  return seat !== 'sponsor'
}

export function homeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase()
  }
  if (parts[0]) return parts[0].slice(0, 2).toUpperCase()
  return 'BA'
}

export function applyDemoThreshold<T extends { is_demo: boolean }>(rows: T[], threshold: number): T[] {
  const real = rows.reduce((sum, row) => sum + (row.is_demo ? 0 : 1), 0)
  if (demoRowsVisible(real, threshold)) return rows
  return rows.filter((row) => !row.is_demo)
}

/** First row for an id wins. A repeated id must not render as a second card. */
export function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>()
  const next: T[] = []
  for (const row of rows) {
    if (!row.id || seen.has(row.id)) continue
    seen.add(row.id)
    next.push(row)
  }
  return next
}

export function primaryHomeCta(input: CtaInput): HomeCta | null {
  if (!input.profileReady || input.mustSetPassword) {
    const passwordOnly = input.mustSetPassword && input.profileReady
    return {
      id: 'profile',
      label: 'Complete profile',
      to: passwordOnly ? '/dashboard/profile#password' : '/dashboard/profile',
    }
  }
  if (input.pendingIntros != null && input.pendingIntros > 0) {
    return { id: 'intro', label: 'Review intro', to: '/dashboard/deals/mandates' }
  }
  if (input.canRegisterMajlis && input.openMajlisId) {
    return {
      id: 'majlis',
      label: 'Register majlis',
      to: `/dashboard/majlis?event=${input.openMajlisId}`,
    }
  }
  if (input.newMandates != null && input.newMandates > 0) {
    return { id: 'mandate', label: 'New mandate', to: '/dashboard/deals/mandates' }
  }
  const invites = normalizeCount(input.invitesRemaining)
  if (input.founding && invites > 0) {
    return { id: 'invite', label: 'Invite peer', to: '/dashboard/people/invites' }
  }
  return null
}

export function visiblePendingIntros(rows: { id?: string; is_demo: boolean; intro_status: IntroState }[] | null): number | null {
  if (!rows) return null
  const visible = dedupeIdentified(applyDemoThreshold(rows, DEMO_THRESHOLD_DEFAULTS.mandates))
  return visible.filter((row) => !row.is_demo && row.intro_status === 'pending').length
}

export function visibleNewMandates(rows: { id?: string; is_demo: boolean; intro_status: IntroState }[] | null): number | null {
  if (!rows) return null
  const visible = dedupeIdentified(applyDemoThreshold(rows, DEMO_THRESHOLD_DEFAULTS.mandates))
  return visible.filter((row) => !row.is_demo && row.intro_status == null).length
}

export function buildHeadlines(input: {
  founding: boolean
  invitesRemaining: number
  mandates: { is_demo: boolean; intro_status: IntroState }[] | null
  rooms: { is_demo: boolean }[] | null
  directory: { is_demo: boolean }[] | null
}): Headline[] {
  const headlines: Headline[] = []
  const push = (item: Headline) => {
    if (headlines.length >= 5) return
    headlines.push(item)
  }

  if (input.mandates) {
    const visible = dedupeIdentified(applyDemoThreshold(input.mandates, DEMO_THRESHOLD_DEFAULTS.mandates))
    const livePending = visible.filter((row) => !row.is_demo && row.intro_status === 'pending').length
    if (livePending > 0) {
      push(pulseHeadline('intros', 'Intros pending', livePending, false))
    }
    const liveFresh = visible.filter((row) => !row.is_demo && row.intro_status == null).length
    if (liveFresh > 0) {
      push(pulseHeadline('mandates', 'New mandates', liveFresh, false))
    }
  }

  if (input.founding) {
    const left = normalizeCount(input.invitesRemaining)
    if (left > 0) {
      push(pulseHeadline('vouchers', 'Invites left', left, false))
    }
  }

  if (input.rooms) {
    const visible = dedupeIdentified(applyDemoThreshold(input.rooms, DEMO_THRESHOLD_DEFAULTS.rooms))
    const live = visible.filter((row) => !row.is_demo).length
    if (live > 0) {
      push(pulseHeadline('rooms', 'Rooms needing action', live, false))
    }
  }

  if (headlines.length < 3 && input.directory) {
    const visible = dedupeIdentified(applyDemoThreshold(input.directory, DEMO_THRESHOLD_DEFAULTS.directory))
    const live = visible.filter((row) => !row.is_demo).length
    if (live > 0) {
      push(pulseHeadline('directory', 'Directory', live, false))
    }
  }

  return headlines
}

export function nextPersonalMajlis(events: HomeGathering[], nowMs: number): HomeGathering | null {
  return soonest(
    events.filter((event) => {
      if (!upcoming(event, nowMs)) return false
      if (!safePublicText(event.title) || !safePublicText(event.region)) return false
      const visible = event.status === 'published' || (event.host && event.status === 'pending_approval')
      if (!visible) return false
      return event.host || event.rsvp === 'registered'
    }),
  )
}

export function nextOpenMajlis(events: HomeGathering[], nowMs: number): HomeGathering | null {
  return soonest(
    events.filter((event) => {
      if (event.status !== 'published' || !upcoming(event, nowMs)) return false
      if (!safePublicText(event.title)) return false
      if (event.host) return false
      return event.rsvp !== 'registered' && event.rsvp !== 'waitlist'
    }),
  )
}

export function upcomingRegions(events: Pick<HomeGathering, 'region' | 'status' | 'endsAt'>[], nowMs: number) {
  const published = events.filter((event) => event.status === 'published' && Date.parse(event.endsAt) > nowMs)
  const counts = countPublishedByRegion(MAJLIS_REGIONS, published)
  return MAJLIS_REGIONS.filter((region) => (counts[region] ?? 0) > 0).map((region) => ({
    region,
    count: counts[region] ?? 0,
    to: `/dashboard/majlis?region=${encodeURIComponent(region)}`,
  }))
}

export function mandateTeaser(row: MandateBrief & Record<string, unknown>): MandateTeaser {
  return {
    id: clip(row.id, 80),
    example: row.is_demo === true,
    sector: clip(row.sector, 120),
    dealType: clip(row.deal_type, 80),
    ticketBand: clip(row.ticket_band, 40),
    geography: clip(row.geography, 40),
    stage: clip(row.stage, 40),
    oneLiner: clip(row.one_liner, 280),
  }
}

export function presentHomeActivity(raw: unknown): HomeActivity | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  if (LEAK_KEYS.some((key) => typeof row[key] === 'string' && row[key].trim().length > 0)) return null
  const id = clip(typeof row.id === 'string' ? row.id : '', 80)
  const label = clip(typeof row.label === 'string' ? row.label : '', 80)
  const detail = clip(typeof row.detail === 'string' ? row.detail : '', 180)
  const happenedAt = clip(typeof row.happened_at === 'string' ? row.happened_at : '', 40)
  const href = clip(typeof row.href === 'string' ? row.href : '', 120)
  const kind = row.kind === 'intro' || row.kind === 'majlis' ? row.kind : null
  if (!id || !kind || !ACTIVITY_LABELS.has(label) || !detail || !happenedAt || !ACTIVITY_HREF.test(href)) {
    return null
  }
  if (!safePublicText(detail) || !safePublicText(label)) return null
  return {
    id,
    kind,
    label,
    detail,
    happenedAt,
    href: href.replace('/dashboard/mandates', '/dashboard/deals/mandates'),
    example: row.is_demo === true,
  }
}

export function presentHomeActivityList(raw: unknown): HomeActivity[] {
  const rows = Array.isArray(raw) ? raw : []
  return rows
    .map(presentHomeActivity)
    .filter((row): row is HomeActivity => row != null)
    .sort((a, b) => b.happenedAt.localeCompare(a.happenedAt))
    .slice(0, 5)
}

export function formatActivityWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

export function platformMoneyLines(stats: PlatformStats | null): { label: string; value: string }[] | null {
  if (!stats) return null
  const money = displayPlatformMoney(stats)
  const lines: { label: string; value: string }[] = []
  if (money.investment != null) {
    lines.push({ label: 'Platform investment capability', value: formatPublicUsd(money.investment) })
  }
  if (money.foAum != null) {
    lines.push({ label: 'Family office AUM represented', value: formatPublicUsd(money.foAum) })
  }
  if (money.turnover != null) {
    lines.push({ label: 'Business turnover capacity', value: formatPublicUsd(money.turnover) })
  }
  return lines
}

export type AssembleInput = {
  nowMs: number
  seat: string
  name: string
  photoUrl: string | null
  profileReady: boolean
  mustSetPassword: boolean
  invitesRemaining: number
  personalCapacityIncluded: boolean | null
  attention: AttentionItem[]
  mandates: MandateBrief[] | null
  rooms: RoomBrief[] | null
  directory: DirectoryBrief[] | null
  partners: PartnerBrief[] | null
  gatherings: HomeGathering[] | null
  admitted: number | null
  ksa: number | null
  intl: number | null
  money: { label: string; value: string }[] | null
  activity: HomeActivity[] | null
  activityStatus: HomeModel['activityStatus']
  loading: boolean
  partialError: boolean
  updatedLabel: string | null
}

export function assembleHome(input: AssembleInput): HomeModel {
  const founding = isFoundingMember(input.seat)
  const profileNeedsWork = !input.profileReady || input.mustSetPassword
  const gatherings = input.gatherings ?? []
  const personal = nextPersonalMajlis(gatherings, input.nowMs)
  const open = nextOpenMajlis(gatherings, input.nowMs)
  const pulse = input.loading
    ? []
    : buildHeadlines({
        founding,
        invitesRemaining: input.invitesRemaining,
        mandates: input.mandates,
        rooms: input.rooms,
        directory: input.directory,
      })
  const cta = input.loading
    ? null
    : primaryHomeCta({
        profileReady: input.profileReady,
        mustSetPassword: input.mustSetPassword,
        pendingIntros: visiblePendingIntros(input.mandates),
        canRegisterMajlis: canRegisterMajlis(input.seat),
        openMajlisId: open?.id ?? null,
        newMandates: visibleNewMandates(input.mandates),
        founding,
        invitesRemaining: input.invitesRemaining,
      })

  const fill =
    input.admitted != null && input.ksa != null && input.intl != null
      ? { ...foundingFill(input.admitted, input.ksa, input.intl), personal: founding }
      : null

  const capacityNote = founding && input.personalCapacityIncluded != null
    ? input.personalCapacityIncluded
      ? 'Your capacity is included in platform totals.'
      : 'Your capacity is not in the platform totals yet.'
    : null

  const directoryRows = input.directory
    ? uniqueById(applyDemoThreshold(input.directory, DEMO_THRESHOLD_DEFAULTS.directory))
    : []
  const mandateRows = input.mandates
    ? uniqueById(applyDemoThreshold(input.mandates, DEMO_THRESHOLD_DEFAULTS.mandates))
    : []
  const roomRows = input.rooms
    ? uniqueById(applyDemoThreshold(input.rooms, DEMO_THRESHOLD_DEFAULTS.rooms))
    : []
  const partnerRows = input.partners
    ? uniqueById(applyDemoThreshold(input.partners, DEMO_THRESHOLD_DEFAULTS.partners))
    : []

  return {
    identity: {
      name: input.name.trim() || "You're in",
      initials: homeInitials(input.name),
      photoUrl: input.photoUrl,
      badge: membershipBadge(input.seat),
      founding,
      seatLabel: homeSeatLabel(input.seat),
      profileNeedsWork,
      profileTo: input.mustSetPassword && input.profileReady ? '/dashboard/profile#password' : '/dashboard/profile',
    },
    attention: input.attention,
    pulse,
    majlis: personal
      ? {
          title: personal.title,
          body: `${personal.host ? 'Hosting' : 'Registered'}. ${personal.region}. ${formatMajlisWhen(personal.startsAt, personal.endsAt)}`,
          to: `/dashboard/majlis?event=${personal.id}`,
        }
      : null,
    cta,
    platform: {
      fill,
      capacityNote,
      regions: input.gatherings ? upcomingRegions(input.gatherings, input.nowMs) : [],
      regionsKnown: input.gatherings != null,
      money: input.money ?? [],
      partners: partnerRows.map((partner) => ({
        id: partner.id,
        name: partner.name,
        monogram: partner.monogram,
        example: partner.is_demo,
      })),
    },
    teasers: {
      directory: directoryRows.slice(0, 2).map((card) => ({
        id: card.id,
        name: card.full_name,
        headline: card.headline,
        seat: card.seat === 'intl' ? 'International' : 'Saudi Arabia',
        example: card.is_demo,
      })),
      mandates: mandateRows.slice(0, 2).map((row) => mandateTeaser(row)),
      rooms: roomRows.slice(0, 2).map((room) => ({
        id: room.id,
        name: room.name,
        sector: room.sector,
        stage: room.stage,
        example: room.is_demo,
      })),
      majlis: uniqueById(
        gatherings.filter(
          (event) => event.status === 'published' && upcoming(event, input.nowMs) && safePublicText(event.title),
        ),
      )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .slice(0, 2)
        .map((event) => ({
          id: event.id,
          title: event.title,
          region: event.region,
          when: formatMajlisWhen(event.startsAt, event.endsAt),
        })),
    },
    activity: input.activity ?? [],
    activityStatus: input.activityStatus,
    loading: input.loading,
    partialError: input.partialError,
    updatedLabel: input.updatedLabel,
  }
}

function foundingFill(admitted: number, ksa: number, intl: number) {
  const line = seatLine({
    admitted,
    ksa,
    intl,
    investment: null,
    foAum: null,
    turnover: null,
    contributorsInvestment: 0,
    contributorsFo: 0,
    contributorsTurnover: 0,
    updatedAt: null,
  })
  return { admitted: line.admitted, label: line.label, split: line.split }
}

function dedupeIdentified<T extends { is_demo: boolean }>(rows: T[]): T[] {
  const identified = rows.every((row) => {
    const id = (row as { id?: unknown }).id
    return typeof id === 'string' && id.length > 0
  })
  if (!identified) return rows
  return uniqueById(rows as (T & { id: string })[])
}

function pulseHeadline(
  id: Headline['id'],
  label: string,
  count: number,
  example: boolean,
): Headline {
  return {
    id,
    label,
    value: String(count),
    body: pulseBody(id, example),
    to:
      id === 'intros'
        ? '/dashboard/people/intros'
        : id === 'vouchers'
          ? '/dashboard/people/invites'
          : id === 'rooms'
            ? '/dashboard/deals/rooms'
            : id === 'directory'
              ? '/dashboard/people/directory'
              : '/dashboard/deals/mandates',
    example,
  }
}

function pulseBody(id: Headline['id'], example: boolean): string {
  if (id === 'intros') {
    return example
      ? 'Sample requests. Marked Example. Inbound intros are not listed here.'
      : 'Requests you sent are waiting. Inbound intros are not listed here.'
  }
  if (id === 'mandates') {
    return example
      ? 'Sample briefs. Marked Example. Locked details stay on Mandates.'
      : 'Clear fields only. Locked details stay on Mandates.'
  }
  if (id === 'vouchers') return 'Peer invites remaining.'
  if (id === 'rooms') {
    return example ? 'Sample rooms. Marked Example.' : 'Open rooms to review.'
  }
  return example
    ? 'Sample peers. Marked Example until more members are admitted.'
    : 'Admitted peers in the directory.'
}

function soonest(events: HomeGathering[]): HomeGathering | null {
  const ordered = [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  return ordered[0] ?? null
}

function upcoming(event: { endsAt: string }, nowMs: number): boolean {
  const end = Date.parse(event.endsAt)
  return Number.isFinite(end) && end > nowMs
}

function safePublicText(value: string): boolean {
  if (!value.trim()) return false
  if (value.includes('@') || /https?:\/\//i.test(value)) return false
  if (EMAIL.test(value) || PHONE.test(value)) return false
  return true
}

function clip(value: string, max: number): string {
  return value.trim().slice(0, max)
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

/** Sponsor desk projection. Package text comes from sponsor_packages, never from this file. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG = /^[a-z0-9_]{2,40}$/

export type SponsorPackage = {
  slug: string
  name: string
  price_label: string
  is_placeholder: boolean
  majlis_slots: number
  intro_credits: number
  room_credits: number
}

export type SponsorDeskEvent = {
  id: string
  title: string
  starts_at: string
  ends_at: string
  region: string
  presented_by: string
  status: 'published' | 'hidden'
}

export type SponsorDesk = {
  package: SponsorPackage | null
  category: { slug: string; name: string } | null
  majlis: {
    entitled: number | null
    used: number
    events: SponsorDeskEvent[]
  }
  intros: { approved: number; pending: number; declined: number }
  credits: {
    intro_entitled: number
    intro_used: number
    room_entitled: number
    room_used: number
  } | null
}

export type SponsorPackageRow = SponsorPackage & {
  sort_order: number
  active: boolean
}

export type SponsorRosterRow = {
  user_id: string
  email: string
  status: string
  label: string
  package_slug: string | null
  category_slug: string | null
  category_name: string | null
}

export type SponsorCatalog = {
  packages: SponsorPackageRow[]
  categories: { slug: string; name: string }[]
  sponsors: SponsorRosterRow[]
  presented_by: { event_id: string; member_id: string }[]
}

export type PackageSave = {
  slug: string
  name: string
  price_label: string
  majlis_slots: number
  intro_credits: number
  room_credits: number
  active: boolean
  is_placeholder: boolean
}

export const PLACEHOLDER_PRICE_NOTE = 'Placeholder. Staff have not locked a price.'
export const SPONSOR_PACKAGE_HEADING = 'Your sponsorship'
export const NO_PACKAGE = 'No package on this seat yet.'

export type SponsorPackageFace =
  | { kind: 'open'; heading: typeof SPONSOR_PACKAGE_HEADING }
  | { kind: 'set'; name: string; price: string }

/** Sponsors see a name and price only after staff save a real package. */
export function sponsorPackageFace(pack: SponsorPackage | null): SponsorPackageFace {
  if (!pack || pack.is_placeholder || !priceIsSet(pack.price_label)) {
    return { kind: 'open', heading: SPONSOR_PACKAGE_HEADING }
  }
  return { kind: 'set', name: pack.name, price: pack.price_label }
}

function priceIsSet(price: string | null | undefined) {
  const value = price?.trim() ?? ''
  if (!value) return false
  return value.toLowerCase() !== 'placeholder'
}

export function sponsorDeskDenied(message: string) {
  return /not_allowed|42501/i.test(message)
}

export function presentedByLine(label: string | null | undefined): string | null {
  const name = publicText(label, 120)
  if (!name) return null
  return `Presented by ${name}`
}

export function slotLine(used: number, entitled: number | null): string {
  if (entitled == null) return NO_PACKAGE
  return `${used} of ${entitled} used`
}

export function introStatusLine(approved: number, pending: number, declined: number): string {
  return `${approved} approved, ${pending} waiting, ${declined} not approved.`
}

export function parsePackageSave(input: {
  slug: string
  name: string
  priceLabel: string
  majlisSlots: string
  introCredits: string
  roomCredits: string
  active: boolean
  isPlaceholder: boolean
}): { ok: true; value: PackageSave } | { ok: false; error: string } {
  const slug = input.slug.trim().toLowerCase()
  const name = input.name.trim()
  const price = input.priceLabel.trim()
  if (!SLUG.test(slug)) {
    return { ok: false, error: 'Use a short package key of letters, numbers, and underscores.' }
  }
  if (name.length < 1 || name.length > 80 || name.includes('@')) {
    return { ok: false, error: 'The package name must be 80 characters or fewer and cannot include an email address.' }
  }
  if (price.length < 1 || price.length > 80 || price.includes('@')) {
    return { ok: false, error: 'The price label must be 80 characters or fewer and cannot include an email address.' }
  }
  const majlis = whole(input.majlisSlots, 0, 24, 'Majlis slots')
  if (typeof majlis !== 'number') return { ok: false, error: majlis }
  const intro = whole(input.introCredits, 0, 500, 'Intro credits')
  if (typeof intro !== 'number') return { ok: false, error: intro }
  const room = whole(input.roomCredits, 0, 500, 'Room credits')
  if (typeof room !== 'number') return { ok: false, error: room }
  return {
    ok: true,
    value: {
      slug,
      name,
      price_label: price,
      majlis_slots: majlis,
      intro_credits: intro,
      room_credits: room,
      active: input.active,
      is_placeholder: input.isPlaceholder,
    },
  }
}

export function presentSponsorDesk(raw: unknown): SponsorDesk | null {
  const row = record(raw)
  if (!row) return null
  const pack = optionalObject(row.package, presentPackage)
  if (!pack.ok) return null
  const category = optionalObject(row.category, presentCategory)
  if (!category.ok) return null
  const intros = presentCounts(row.intros)
  if (!intros) return null
  const majlis = presentMajlis(row.majlis, pack.value)
  if (!majlis) return null
  const credits = presentCredits(row.credits, pack.value)
  if (pack.value && !credits) return null
  return {
    package: pack.value,
    category: category.value,
    majlis,
    intros,
    credits: pack.value ? credits : null,
  }
}

export function presentSponsorCatalog(raw: unknown): SponsorCatalog | null {
  const row = record(raw)
  if (!row) return null
  if (!Array.isArray(row.packages) || !Array.isArray(row.categories) || !Array.isArray(row.sponsors)) return null
  const packages: SponsorPackageRow[] = []
  for (const item of row.packages) {
    const parsed = presentPackageRow(item)
    if (parsed) packages.push(parsed)
  }
  const categories: { slug: string; name: string }[] = []
  for (const item of row.categories) {
    const parsed = presentCategory(item)
    if (parsed) categories.push(parsed)
  }
  const sponsors: SponsorRosterRow[] = []
  for (const item of row.sponsors) {
    const parsed = presentRoster(item)
    if (parsed) sponsors.push(parsed)
  }
  const presented_by: { event_id: string; member_id: string }[] = []
  if (Array.isArray(row.presented_by)) {
    for (const item of row.presented_by) {
      const link = record(item)
      if (!link) continue
      const eventId = text(link.event_id, 80)
      const memberId = text(link.member_id, 80)
      if (!UUID.test(eventId) || !UUID.test(memberId)) continue
      presented_by.push({ event_id: eventId, member_id: memberId })
    }
  }
  return { packages, categories, sponsors, presented_by }
}

function presentMajlis(raw: unknown, pack: SponsorPackage | null): SponsorDesk['majlis'] | null {
  const row = record(raw)
  if (!row) return null
  const used = count(row.used)
  if (used == null) return null
  const events: SponsorDeskEvent[] = []
  if (Array.isArray(row.events)) {
    for (const item of row.events) {
      const event = presentEvent(item)
      if (event) events.push(event)
    }
  }
  return {
    entitled: pack ? pack.majlis_slots : null,
    used,
    events,
  }
}

function presentEvent(raw: unknown): SponsorDeskEvent | null {
  const row = record(raw)
  if (!row) return null
  const id = text(row.id, 80)
  const title = publicText(row.title, 160)
  const starts = text(row.starts_at, 40)
  const ends = text(row.ends_at, 40) || starts
  const region = publicText(row.region, 80)
  const presented = publicText(row.presented_by, 120)
  const status = row.status === 'published' || row.status === 'hidden' ? row.status : null
  if (!UUID.test(id) || !title || !region || !status) return null
  if (Number.isNaN(new Date(starts).getTime())) return null
  return {
    id,
    title,
    starts_at: starts,
    ends_at: ends,
    region,
    presented_by: presented,
    status,
  }
}

function presentCredits(raw: unknown, pack: SponsorPackage | null): SponsorDesk['credits'] | null {
  if (!pack) return null
  const row = record(raw)
  if (!row) return null
  const introUsed = count(row.intro_used)
  const roomUsed = count(row.room_used)
  if (introUsed == null || roomUsed == null) return null
  return {
    intro_entitled: pack.intro_credits,
    intro_used: introUsed,
    room_entitled: pack.room_credits,
    room_used: roomUsed,
  }
}

function presentCounts(raw: unknown): SponsorDesk['intros'] | null {
  const row = record(raw)
  if (!row) return null
  const approved = count(row.approved)
  const pending = count(row.pending)
  const declined = count(row.declined)
  if (approved == null || pending == null || declined == null) return null
  return { approved, pending, declined }
}

function presentPackage(raw: unknown): SponsorPackage | null {
  const row = record(raw)
  if (!row) return null
  const slug = text(row.slug, 40)
  const name = publicText(row.name, 80)
  const price = publicText(row.price_label, 80)
  const majlis = count(row.majlis_slots)
  const intro = count(row.intro_credits)
  const room = count(row.room_credits)
  if (!SLUG.test(slug) || !name || !price || majlis == null || intro == null || room == null) return null
  if (majlis > 24 || intro > 500 || room > 500) return null
  return {
    slug,
    name,
    price_label: price,
    is_placeholder: row.is_placeholder === true,
    majlis_slots: majlis,
    intro_credits: intro,
    room_credits: room,
  }
}

function presentPackageRow(raw: unknown): SponsorPackageRow | null {
  const pack = presentPackage(raw)
  const row = record(raw)
  if (!pack || !row) return null
  const sort = count(row.sort_order)
  if (sort == null) return null
  return { ...pack, sort_order: sort, active: row.active !== false }
}

function presentCategory(raw: unknown): { slug: string; name: string } | null {
  const row = record(raw)
  if (!row) return null
  const slug = text(row.slug, 40)
  const name = publicText(row.name, 80)
  if (!SLUG.test(slug) || !name) return null
  return { slug, name }
}

function presentRoster(raw: unknown): SponsorRosterRow | null {
  const row = record(raw)
  if (!row) return null
  const userId = text(row.user_id, 80)
  const label = publicText(row.label, 200) || 'Sponsor'
  const status = row.status === 'invited' || row.status === 'active' ? row.status : ''
  const email = text(row.email, 320)
  if (!UUID.test(userId) || !status) return null
  const packageSlug = text(row.package_slug, 40)
  const categorySlug = text(row.category_slug, 40)
  const categoryName = publicText(row.category_name, 80)
  return {
    user_id: userId,
    email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : '',
    status,
    label,
    package_slug: SLUG.test(packageSlug) ? packageSlug : null,
    category_slug: SLUG.test(categorySlug) ? categorySlug : null,
    category_name: categoryName || null,
  }
}

function optionalObject<T>(raw: unknown, parse: (value: unknown) => T | null): { ok: true; value: T | null } | { ok: false } {
  if (raw == null) return { ok: true, value: null }
  const value = parse(raw)
  if (!value) return { ok: false }
  return { ok: true, value }
}

function whole(raw: string, min: number, max: number, label: string): number | string {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return `${label} must be a whole number.`
  const value = Number(trimmed)
  if (value < min || value > max) return `${label} must be between ${min} and ${max}.`
  return value
}

function count(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Number.NaN
  if (!Number.isInteger(number) || number < 0 || number > 10000) return null
  return number
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function publicText(value: unknown, max: number): string {
  return text(value, max)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

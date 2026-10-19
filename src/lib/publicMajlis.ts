export const PUBLIC_MAJLIS_REPLY = 'Thanks, we have your request.'
export const PUBLIC_MAJLIS_MAIL = 'Check your email. It has a code or a sign-in link.'
export const PUBLIC_MAJLIS_CONSENT = 'public-majlis-2026-10'

export const PUBLIC_MAJLIS_ROLES = [
  { id: 'chairperson', label: 'Chairperson' },
  { id: 'board_member', label: 'Board member' },
  { id: 'c_suite', label: 'C-suite executive' },
  { id: 'other', label: 'Other' },
] as const

export const PUBLIC_MAJLIS_REGIONS = [
  { id: 'ksa_gcc', label: 'Saudi Arabia and the GCC' },
  { id: 'intl', label: 'International' },
] as const

const PLACES = new Set(['open', 'few', 'full'])
const ROLE_IDS = new Set(PUBLIC_MAJLIS_ROLES.map((item) => item.id))
const REGION_IDS = new Set(PUBLIC_MAJLIS_REGIONS.map((item) => item.id))

export type PublicMajlisPlace = 'open' | 'few' | 'full'

export type PublicMajlisEvent = {
  id: string
  title: string
  description: string
  region: string
  focusTags: string[]
  startsAt: string
  endsAt: string
  place: PublicMajlisPlace
}

export type PublicMajlisSnapshot = {
  full_name: string
  phone: string
  company: string
  role: string
  linkedin: string
  why: string
}

export type PublicMajlisInput = {
  fullName: string
  email: string
  company: string
  role: string
  phone: string
  linkedin: string
  why: string
  consent: boolean
  region: string
  signedIn: boolean
}

export function publicMajlisReply() {
  return PUBLIC_MAJLIS_REPLY
}

export function placeLabel(place: string) {
  if (place === 'few') return 'Few places left'
  if (place === 'full') return 'Full, join the waitlist'
  return 'Open'
}

export function internationalPhone(value: string): string | null {
  const compact = value.replace(/[^0-9+]/g, '')
  if (!/^\+[1-9][0-9]{7,14}$/.test(compact)) return null
  return compact
}

export function optionalLinkedIn(value: string): string | null {
  const text = value.trim()
  if (!text) return ''
  if (text.includes('@') || text.length > 300) return null
  try {
    const url = new URL(text)
    if (url.protocol !== 'https:') return null
    if (url.hostname !== 'linkedin.com' && !url.hostname.endsWith('.linkedin.com')) return null
    return url.toString().slice(0, 300)
  } catch {
    return null
  }
}

function cleanText(value: unknown, max: number) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/https?:\/\/meet\.google\.com\S*/gi, '')
    .replace(/@/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && !value.includes('\n')
}

export function presentPublicMajlis(raw: unknown): PublicMajlisEvent[] {
  if (!Array.isArray(raw)) return []
  const rows: PublicMajlisEvent[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = cleanText(row.id, 80)
    if (!/^[0-9a-f-]{36}$/i.test(id)) continue
    const place = typeof row.place === 'string' && PLACES.has(row.place) ? (row.place as PublicMajlisPlace) : 'open'
    const tags = Array.isArray(row.focus_tags)
      ? row.focus_tags.map((tag) => cleanText(tag, 40)).filter(Boolean).slice(0, 8)
      : []
    rows.push({
      id,
      title: cleanText(row.title, 160) || 'Majlis',
      description: cleanText(row.description, 500),
      region: cleanText(row.region, 80),
      focusTags: tags,
      startsAt: cleanText(row.starts_at, 40),
      endsAt: cleanText(row.ends_at, 40),
      place,
    })
  }
  return rows
}

export function formatPublicWhen(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const when = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
  return `${when} Asia/Riyadh`
}

export function validatePublicMajlis(
  input: PublicMajlisInput,
): { ok: true; snapshot: PublicMajlisSnapshot; email: string; region: string; roleId: string } | { ok: false; error: string } {
  const fullName = input.fullName.replace(/@/g, '').trim().slice(0, 200)
  const company = input.company.replace(/@/g, '').trim().slice(0, 200)
  const roleId = input.role.trim()
  const role = PUBLIC_MAJLIS_ROLES.find((item) => item.id === roleId)
  const phone = internationalPhone(input.phone)
  const linkedin = optionalLinkedIn(input.linkedin)
  const why = input.why.replace(/@/g, '').trim().slice(0, 1000)
  const email = input.email.trim().toLowerCase().slice(0, 320)
  const region = input.region.trim()

  if (!fullName || !company || !role) {
    return { ok: false, error: 'Name, company, and role are required.' }
  }
  if (!phone) {
    return { ok: false, error: 'Enter a phone number with a country code, such as +966 or +44.' }
  }
  if (linkedin === null) {
    return { ok: false, error: 'LinkedIn must be an https link on linkedin.com, or leave it blank.' }
  }
  if (!input.consent) {
    return { ok: false, error: 'Agree to the Terms and Privacy notice to continue.' }
  }
  if (!input.signedIn) {
    if (!isEmail(email)) return { ok: false, error: 'Enter a valid work email.' }
    if (!REGION_IDS.has(region as 'ksa_gcc' | 'intl')) {
      return { ok: false, error: 'Name, work email, role, and region are required.' }
    }
  }
  if (!ROLE_IDS.has(role.id)) {
    return { ok: false, error: 'Name, company, and role are required.' }
  }

  return {
    ok: true,
    snapshot: {
      full_name: fullName,
      phone,
      company,
      role: role.label,
      linkedin,
      why,
    },
    email,
    region,
    roleId: role.id,
  }
}

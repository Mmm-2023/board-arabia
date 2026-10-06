/**
 * Checklist, meter, gate, and candidate-facing status copy.
 * Scale band ids are stored in Supabase. They are not analytics properties.
 */

export const REQUIRED_STEP_IDS = [
  'email',
  'role',
  'company_title',
  'linkedin',
  'scale_band',
  'sectors',
  'statement',
] as const

export const OPTIONAL_STEP_IDS = ['cr_number', 'referral', 'capacity', 'phone'] as const

export type RequiredStepId = (typeof REQUIRED_STEP_IDS)[number]
export type OptionalStepId = (typeof OPTIONAL_STEP_IDS)[number]
export type StepId = RequiredStepId | OptionalStepId

export const TURNOVER_BANDS = [
  { id: 't_under_10m', label: 'Under $10m' },
  { id: 't_10m_to_50m', label: '$10m to $50m' },
  { id: 't_50m_to_250m', label: '$50m to $250m' },
  { id: 't_250m_to_1bn', label: '$250m to $1bn' },
  { id: 't_over_1bn', label: 'Over $1bn' },
] as const

export const AUM_BANDS = [
  { id: 'a_under_50m', label: 'Under $50m' },
  { id: 'a_50m_to_250m', label: '$50m to $250m' },
  { id: 'a_250m_to_1bn', label: '$250m to $1bn' },
  { id: 'a_over_1bn', label: 'Over $1bn' },
] as const

export const SCALE_BAND_IDS = [...TURNOVER_BANDS.map((item) => item.id), ...AUM_BANDS.map((item) => item.id)]

export const ROLE_OPTIONS = [
  { id: 'chairperson', label: 'Chairperson' },
  { id: 'board_member', label: 'Board member' },
  { id: 'c_suite', label: 'C-suite executive' },
  { id: 'other', label: 'Other' },
] as const

export const STEP_COPY: Record<StepId, { label: string; why: string; required: boolean }> = {
  email: {
    label: 'Verified email',
    why: 'So our admin team can reach you and your sign-in is yours.',
    required: true,
  },
  role: {
    label: 'Role',
    why: 'Board Arabia is held for Chairpersons, Board members and C-suite executives.',
    required: true,
  },
  company_title: {
    label: 'Company and title',
    why: 'Your current company and title, as you would like them to appear to members after approval.',
    required: true,
  },
  linkedin: {
    label: 'LinkedIn profile',
    why: 'Our admin team checks your board and executive record here. It is not shown to other candidates.',
    required: true,
  },
  scale_band: {
    label: 'Scale',
    why: 'Used only for review and never shown individually.',
    required: true,
  },
  sectors: {
    label: 'Sector and Vision 2030 tags',
    why: 'So mandates and introductions match what you know.',
    required: true,
  },
  statement: {
    label: 'Short statement',
    why: 'Read only by our admin team. What would you bring to the room, and what do you want from it?',
    required: true,
  },
  cr_number: {
    label: 'Company registration',
    why: 'Confirms the company exists. We ask for the number only, never a document.',
    required: false,
  },
  referral: {
    label: 'Referral or peer invite',
    why: 'Name a member who knows your work. Our admin team may ask them.',
    required: false,
  },
  capacity: {
    label: 'Investable capacity',
    why: 'Used only inside a platform sum, and only after our admin team verifies it.',
    required: false,
  },
  phone: {
    label: 'Phone',
    why: 'Only used if our admin team offers a short call.',
    required: false,
  },
}

export const REASON_CODES = [
  { id: 'fit', label: 'Fit' },
  { id: 'not_in_audience', label: 'Not in audience' },
  { id: 'not_enough_information', label: 'Not enough information' },
  { id: 'capacity', label: 'Capacity' },
  { id: 'duplicate', label: 'Duplicate' },
  { id: 'spam', label: 'Spam' },
] as const

export type ReasonCode = (typeof REASON_CODES)[number]['id']

export type ChecklistInput = {
  emailVerified: boolean
  role: string
  boardSeats: string
  companyName: string
  jobTitle: string
  companyWebsite: string
  linkedinUrl: string
  scaleKind: string
  scaleBand: string
  sectorTags: string[]
  visionTags: string[]
  statement: string
  crNumber: string
  crCountry: string
  referralName: string
  invited: boolean
  investable: string
  phone: string
}

export function checklistFromRecord(row: {
  email_verified_at?: string | null
  role?: string | null
  board_seats?: string | null
  company_name?: string | null
  job_title?: string | null
  company_website?: string | null
  linkedin_url?: string | null
  scale_kind?: string | null
  scale_band?: string | null
  sector_tags?: string[] | null
  vision_tags?: string[] | null
  statement?: string | null
  cr_number?: string | null
  cr_country?: string | null
  referral_name?: string | null
  invited_by_member_id?: string | null
  investable_capacity_usd?: number | string | null
  phone?: string | null
}): ChecklistInput {
  return {
    emailVerified: Boolean(row.email_verified_at),
    role: row.role || '',
    boardSeats: row.board_seats || '',
    companyName: row.company_name || '',
    jobTitle: row.job_title || '',
    companyWebsite: row.company_website || '',
    linkedinUrl: row.linkedin_url || '',
    scaleKind: row.scale_kind || '',
    scaleBand: row.scale_band || '',
    sectorTags: row.sector_tags || [],
    visionTags: row.vision_tags || [],
    statement: row.statement || '',
    crNumber: row.cr_number || '',
    crCountry: row.cr_country || '',
    referralName: row.referral_name || '',
    invited: Boolean(row.invited_by_member_id),
    investable: row.investable_capacity_usd == null ? '' : String(row.investable_capacity_usd),
    phone: row.phone || '',
  }
}

export const EMPTY_CHECKLIST: ChecklistInput = {
  emailVerified: false,
  role: '',
  boardSeats: '',
  companyName: '',
  jobTitle: '',
  companyWebsite: '',
  linkedinUrl: '',
  scaleKind: '',
  scaleBand: '',
  sectorTags: [],
  visionTags: [],
  statement: '',
  crNumber: '',
  crCountry: '',
  referralName: '',
  invited: false,
  investable: '',
  phone: '',
}

const LINKEDIN_RE = /^https:\/\/(www\.)?linkedin\.com\/in\/[a-z0-9_%-]{3,100}\/?$/i
const WEBSITE_RE = /^https:\/\/[^\s]{3,480}$/i
const SAUDI_CR_RE = /^[0-9]{10}$/
const OTHER_CR_RE = /^[A-Za-z0-9-]{3,40}$/

export function roleLabel(role: string) {
  return ROLE_OPTIONS.find((item) => item.id === role)?.label || ''
}

export function bandLabel(kind: string, band: string) {
  const list = kind === 'aum' ? AUM_BANDS : TURNOVER_BANDS
  return list.find((item) => item.id === band)?.label || ''
}

export function tagCount(input: ChecklistInput) {
  return input.sectorTags.length + input.visionTags.length
}

export function stepDone(input: ChecklistInput, step: StepId) {
  if (step === 'email') return input.emailVerified
  if (step === 'role') return ROLE_OPTIONS.some((item) => item.id === input.role)
  if (step === 'company_title') return Boolean(input.companyName.trim() && input.jobTitle.trim())
  if (step === 'linkedin') return LINKEDIN_RE.test(input.linkedinUrl.trim())
  if (step === 'scale_band') {
    if (input.scaleKind === 'turnover') return TURNOVER_BANDS.some((item) => item.id === input.scaleBand)
    if (input.scaleKind === 'aum') return AUM_BANDS.some((item) => item.id === input.scaleBand)
    return false
  }
  if (step === 'sectors') {
    const count = tagCount(input)
    return count >= 1 && count <= 5
  }
  if (step === 'statement') {
    const length = input.statement.trim().length
    return length >= 200 && length <= 600
  }
  if (step === 'cr_number') {
    const number = input.crNumber.trim()
    const country = input.crCountry.trim()
    if (!number) return false
    if (!country || country.toUpperCase() === 'SA') return SAUDI_CR_RE.test(number)
    return country.length >= 2 && country.length <= 80 && OTHER_CR_RE.test(number)
  }
  if (step === 'referral') return Boolean(input.referralName.trim() || input.invited)
  if (step === 'capacity') {
    if (!input.investable.trim()) return false
    const amount = Number(input.investable)
    return Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000_000_000
  }
  if (step === 'phone') {
    const phone = input.phone.trim()
    return phone.length >= 8 && phone.length <= 40
  }
  return false
}

export function requiredDoneCount(input: ChecklistInput) {
  return REQUIRED_STEP_IDS.filter((step) => stepDone(input, step)).length
}

export function optionalDoneCount(input: ChecklistInput) {
  return OPTIONAL_STEP_IDS.filter((step) => stepDone(input, step)).length
}

export function missingRequired(input: ChecklistInput) {
  return REQUIRED_STEP_IDS.filter((step) => !stepDone(input, step)).map((step) => ({
    id: step,
    label: STEP_COPY[step].label,
  }))
}

export function stepSubtitle(input: ChecklistInput, step: StepId) {
  if (step === 'email') return 'Done at sign-up'
  if (step === 'role' && stepDone(input, step)) {
    const role = roleLabel(input.role)
    const seats = input.boardSeats.trim().split('\n').map((line) => line.trim()).filter(Boolean)
    return [role, ...seats].filter(Boolean).join(', ')
  }
  if (step === 'company_title' && stepDone(input, step)) {
    return `${input.companyName.trim()}, ${input.jobTitle.trim()}`
  }
  return STEP_COPY[step].why
}

export function gateCopy(input: ChecklistInput, state: string, declinedUntil: string | null, now = Date.now()) {
  if (state === 'declined' && declinedUntil && Date.parse(declinedUntil) > now) {
    return {
      enabled: false,
      label: 'Request full membership',
      helper: `You can ask again after ${formatDeskDate(declinedUntil)}.`,
      links: [] as { id: StepId; label: string }[],
    }
  }
  const missing = missingRequired(input)
  if (missing.length > 0) {
    const noun = missing.length === 1 ? 'step' : 'steps'
    return {
      enabled: false,
      label: 'Request full membership',
      helper: `${missing.length} ${noun} left:`,
      links: missing,
    }
  }
  return {
    enabled: state === 'open' || (state === 'declined' && (!declinedUntil || Date.parse(declinedUntil) <= now)),
    label: 'Request full membership',
    helper: 'You can still add optional details. Our admin team reads everything you send.',
    links: [] as { id: StepId; label: string }[],
  }
}

export function lockButton(input: ChecklistInput, state: string) {
  if (state === 'waitlisted') return { label: 'On the waitlist', enabled: false }
  if (state !== 'open' && state !== 'declined') return { label: 'Request submitted', enabled: false }
  if (requiredDoneCount(input) < 7) return { label: 'Continue your request', enabled: true }
  return { label: 'Request full membership', enabled: true }
}

export function statusCopy(state: string, submittedAt: string | null, declinedUntil: string | null) {
  if (state === 'submitted') {
    const when = submittedAt ? formatDeskDate(submittedAt) : 'today'
    return `Request received on ${when}. Our admin team reviews every request personally. There is no fixed response time.`
  }
  if (state === 'in_review') return 'Our admin team is reviewing your request.'
  if (state === 'needs_info') return 'Our admin team has one question. Reply below to keep your request moving.'
  if (state === 'review_call') return 'Our admin team would like a short conversation. We have emailed you a private link to arrange it.'
  if (state === 'waitlisted') return 'Your request is on the waitlist. We will write to you when a place opens.'
  if (state === 'declined') {
    const when = declinedUntil ? formatDeskDate(declinedUntil) : 'the cooling off date'
    return `Our admin team has not offered full membership at this time. Your account stays open to look around. You can ask again after ${when}.`
  }
  if (state === 'closed') return 'This request is closed.'
  if (state === 'approved') return 'Full membership is open on this sign-in.'
  return ''
}

const DESK_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatDeskDate(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Riyadh',
  }).formatToParts(date)
  const day = Number(parts.find((part) => part.type === 'day')?.value || '0')
  const month = Number(parts.find((part) => part.type === 'month')?.value || '1')
  const year = parts.find((part) => part.type === 'year')?.value || ''
  return `${day} ${DESK_MONTHS[month - 1] || ''} ${year}`
}

export function daysSince(iso: string | null, now = Date.now()) {
  if (!iso) return 0
  const start = Date.parse(iso)
  if (!Number.isFinite(start)) return 0
  return Math.max(0, Math.floor((now - start) / 86_400_000))
}

export function websiteOk(value: string) {
  const text = value.trim()
  if (!text) return true
  return WEBSITE_RE.test(text)
}

export function stepError(input: ChecklistInput, step: StepId) {
  if (step === 'company_title' && input.companyWebsite.trim() && !websiteOk(input.companyWebsite)) {
    return 'Company website must start with https://'
  }
  if (step === 'linkedin' && input.linkedinUrl.trim() && !LINKEDIN_RE.test(input.linkedinUrl.trim())) {
    return 'Use a https://www.linkedin.com/in/ link.'
  }
  if (step === 'statement' && input.statement.trim() && !stepDone(input, 'statement')) {
    const length = input.statement.trim().length
    if (length < 200) return `${200 - length} characters still needed (200 to 600).`
    return 'Keep the statement to 600 characters.'
  }
  if (step === 'cr_number' && input.crNumber.trim() && !stepDone(input, 'cr_number')) {
    return 'Use a 10 digit Saudi CR, or a registry number with a country. No documents.'
  }
  if (step === 'sectors' && tagCount(input) > 5) return 'Choose 1 to 5 tags.'
  if (step === 'capacity' && input.investable.trim() && !stepDone(input, 'capacity')) {
    return 'Enter a USD amount, or leave it blank.'
  }
  if (step === 'phone' && input.phone.trim() && !stepDone(input, 'phone')) return 'Enter a phone number our admin team can use.'
  return ''
}

export function domainMatches(email: string, website: string) {
  const mail = email.split('@')[1]?.trim().toLowerCase() || ''
  if (!mail || !website.trim()) return false
  try {
    const host = new URL(website.trim()).hostname.replace(/^www\./, '').toLowerCase()
    return host === mail || mail.endsWith(`.${host}`) || host.endsWith(`.${mail}`)
  } catch {
    return false
  }
}

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function riyadhParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Riyadh',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const read = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return {
    weekday: WEEKDAY[read('weekday')] ?? 0,
    key: `${read('year')}-${read('month')}-${read('day')}`,
  }
}

/** Business days after the start date, through today. Sunday to Thursday, Riyadh. */
export function businessDaysElapsed(startIso: string, now = new Date()) {
  const start = new Date(startIso)
  if (Number.isNaN(start.getTime())) return 0
  let cursor = start.getTime()
  const endKey = riyadhParts(now).key
  let count = 0
  for (let guard = 0; guard < 400; guard += 1) {
    cursor += 86_400_000
    const part = riyadhParts(new Date(cursor))
    if (part.key > endKey) break
    if (part.weekday !== 5 && part.weekday !== 6) count += 1
    if (part.key === endKey) break
  }
  return count
}

export function slaTone(state: string, stateChangedAt: string | null, submittedAt: string | null, now = new Date()) {
  const anchor = state === 'submitted' ? submittedAt : stateChangedAt || submittedAt
  if (!anchor) return 'ok' as const
  const age = businessDaysElapsed(anchor, now)
  if (state === 'submitted' && age > 2) return 'attention' as const
  if ((state === 'in_review' || state === 'review_call' || state === 'needs_info') && age > 10) return 'late' as const
  return 'ok' as const
}

export function ageLabel(iso: string | null, now = new Date()) {
  if (!iso) return 'Not submitted'
  const age = businessDaysElapsed(iso, now)
  if (age === 0) return 'Today'
  if (age === 1) return '1 business day'
  return `${age} business days`
}

export const TRANSITIONS: Record<string, readonly string[]> = {
  submitted: ['in_review'],
  in_review: ['needs_info', 'review_call', 'waitlisted', 'approved', 'declined', 'closed'],
  needs_info: ['in_review', 'closed'],
  review_call: ['in_review', 'approved', 'declined', 'waitlisted'],
  waitlisted: ['in_review', 'approved', 'declined'],
}

export function transitionAllowed(from: string, to: string) {
  return (TRANSITIONS[from] || []).includes(to)
}

/** The private booking link is emailed only for this state. */
export function sendsBookingLink(to: string) {
  return to === 'review_call'
}

export function coolingUntil(fromIso: string) {
  const date = new Date(fromIso)
  if (Number.isNaN(date.getTime())) return ''
  date.setUTCDate(date.getUTCDate() + 180)
  return date.toISOString()
}

export function revisitUntil(fromIso: string) {
  const date = new Date(fromIso)
  if (Number.isNaN(date.getTime())) return ''
  date.setUTCDate(date.getUTCDate() + 30)
  return date.toISOString()
}

export function isReasonCode(value: string): value is ReasonCode {
  return REASON_CODES.some((item) => item.id === value)
}

export function membershipLine(tier: string | null | undefined, foundingNumber: number | null | undefined) {
  if (typeof foundingNumber === 'number' && foundingNumber >= 1 && foundingNumber <= 100) {
    return `You are Founding Member No. ${foundingNumber}.`
  }
  if (tier === 'member') return 'Your Member seat is live.'
  return ''
}

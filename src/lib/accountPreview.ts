import { LANDING_PREVIEW_EXAMPLES, presentLandingDealList, type LandingDeal } from './landingPreview.ts'
import { presentServerTotals, type DisplayTotals } from './platformFloors.ts'

export type AccountDeal = LandingDeal

export function presentAccountDeals(raw: unknown): AccountDeal[] {
  return presentLandingDealList(raw)
}

export function accountDealFallback(): AccountDeal[] {
  return LANDING_PREVIEW_EXAMPLES.map((deal) => ({ ...deal }))
}

export function presentAccountTotals(raw: unknown): DisplayTotals | null {
  return presentServerTotals(raw)
}

export const ACCOUNT_REAL_ESTATE = {
  sector: 'Industrial',
  line: 'A fictional site used only to show the card shape.',
} as const

export const LOCK_COPY = {
  title: 'Open to full members',
  deals: 'Access to capital. Mandates, real estate and deal rooms reach full members after our admin team reviews them.',
  people: 'Business relationships. The Directory shows admitted Chairpersons, Board members and C-suite executives only.',
  intros: 'Introductions stay between full members.',
  invites: 'Full members receive two peer invites to put a peer forward for review.',
  majlis: 'Opening doors. Majlis invitations go to full members.',
  rooms: 'A deal room is a private space for a full member and the people they invite.',
  ai: 'AI Due Diligence runs for full members. Here is a sample report.',
  button: 'Request full membership',
  secondary: 'What full members get',
  footnote: 'Membership is by review. Credentials first, then a decision.',
} as const

export const MAJLIS_ACCOUNT_COPY = {
  title: 'Majlis',
  body: 'Majlis is four small salons a year, in person, and off the record. Invitations go to full members.',
} as const

export const DIRECTORY_ACCOUNT_COPY = {
  title: 'Directory',
  body: 'The Directory shows admitted Chairpersons, Board members and C-suite executives. A full member sees a name, a headline, a company and a city.',
  privacy: 'Email, phone and capacity figures are not on that card.',
} as const

export const HOME_TILES = [
  { id: 'mandates', label: 'Mandates', line: 'Clear fields on a mandate, then a locked brief.', to: '/dashboard/deals/mandates' },
  { id: 'directory', label: 'Directory', line: 'Admitted members, after a human review.', to: '/dashboard/people/directory' },
  { id: 'majlis', label: 'Majlis', line: 'Four small salons a year, off the record.', to: '/dashboard/majlis' },
  { id: 'ai', label: 'AI Due Diligence', line: 'A sample report. Runs open with full membership.', to: '/dashboard/ai/due-diligence' },
  { id: 'rooms', label: 'Deal rooms', line: 'A private room for a full member and their guests.', to: '/dashboard/deals/rooms' },
] as const

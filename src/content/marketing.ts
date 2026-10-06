export const PARTNER_EMAIL = 'partners@boardarabia.com'

/** One audience line. Landing and About use this wording. */
export const AUDIENCE_LINE = 'Chairpersons, Board members, and C-suite executives'

/** No day-count is published. Say this instead of inventing an SLA. */
export const REVIEW_SLA =
  'There is no fixed response time. Every application is reviewed personally.'

export type MemberTool = {
  id: string
  n: string
  title: string
  home: string
  href: string
}

/** Home tiles. Destinations are the subpages that explain each tool. */
export const MEMBER_TOOLS: MemberTool[] = [
  {
    id: 'directory',
    n: '01',
    title: 'Private directory',
    home: 'Find Saudi and international Chairpersons, Board members, and C-suite executives who passed the same review. Not published on this site.',
    href: '/for-members#directory',
  },
  {
    id: 'inbox',
    n: '02',
    title: 'Mandate inbox',
    home: 'Access to capital: mandates reach you after our admin team reviews them. Not cold outreach.',
    href: '/for-members#inbox',
  },
  {
    id: 'intros',
    n: '03',
    title: 'Warm introductions',
    home: 'Opening doors: intros proposed, then released. No open messaging.',
    href: '/for-members#intros',
  },
  {
    id: 'rooms',
    n: '04',
    title: 'Deal rooms',
    home: 'A private room for a live mandate. Opened by our admin team, closed when the work ends.',
    href: '/for-members#rooms',
  },
  {
    id: 'majlis',
    n: '05',
    title: 'Quarterly Majlis',
    home: 'Four small salons a year. In person. Off the public record.',
    href: '/for-members#majlis',
  },
  {
    id: 'vouchers',
    n: '06',
    title: 'Peer vouchers',
    home: 'Invite someone you would sit with on a board. They still face review.',
    href: '/for-members#vouchers',
  },
  {
    id: 'tags',
    n: '07',
    title: 'Sector tags',
    home: 'Vision 2030 and sector tags inside the membership only.',
    href: '/for-members#tags',
  },
  {
    id: 'badge',
    n: '08',
    title: 'Founding badge',
    home: 'A founding mark you may announce, including on LinkedIn, once admitted.',
    href: '/for-members#badge',
  },
  {
    id: 'due-diligence',
    n: '09',
    title: 'AI Due Diligence',
    home: 'Public-source diligence language for governance conversations. Not a deal verdict.',
    href: '/for-members',
  },
]

export type ProcessStep = {
  n: string
  title: string
  home: string
  detail: string
}

export const PROCESS_STEPS: ProcessStep[] = [
  {
    n: '01',
    title: 'Pre-vet',
    home: 'Submit credentials for consideration. The form does not reserve a time.',
    detail:
      'The application asks for your name, email, phone if you wish, LinkedIn, titles, companies, turnover or family-office size, and an optional investable capacity in US dollars. You can include that capacity in the public platform totals. The form does not hold a slot and it does not open a calendar.',
  },
  {
    n: '02',
    title: 'Review',
    home: 'Every application is reviewed personally. There is no fixed response time.',
    detail:
      'There is no fixed response time. Every application is reviewed personally. Nothing is accepted automatically, and there is no score you can game. Fit is a judgment about credentials and about whether you will contribute to the room. You hear back with an acceptance or a clear decline.',
  },
  {
    n: '03',
    title: 'Accept',
    home: 'A fit is accepted. Otherwise you receive a polite decline.',
    detail:
      'Acceptance means the conversation can be offered. A decline is sent as a clear note, not left as silence. Neither outcome is published.',
  },
  {
    n: '04',
    title: 'Private invite email',
    home: 'If accepted, you get a private invite email. We never publish it here.',
    detail:
      'Only an accepted candidate receives the private invite email. It does not appear on this website, in the navigation, or in any public page. Visitors cannot arrange a conversation from here.',
  },
  {
    n: '05',
    title: 'Admit',
    home: 'After the conversation, admitted members enter the dashboard.',
    detail:
      'The conversation is about fit: the room, the contribution expected of founding members, and whether admission is right. Admitted members then enter the dashboard: directory, availability, introductions, mandate inbox, and the founding mark.',
  },
]

export type PartnerCategory = {
  name: string
  gloss: string
}

export const PARTNER_CATEGORIES: PartnerCategory[] = [
  {
    name: 'Investment banking',
    gloss: 'Coverage, mandates, and sell-side work.',
  },
  {
    name: 'Private equity',
    gloss: 'Sponsors acquiring or governing companies.',
  },
  {
    name: 'Venture capital',
    gloss: 'Funds backing companies that will need boards.',
  },
  {
    name: 'Family offices',
    gloss: 'Principals investing their own capital.',
  },
  {
    name: 'Sovereign and development finance',
    gloss: 'Public and development capital with a Saudi nexus.',
  },
  {
    name: 'Asset management',
    gloss: 'Long-only and alternative managers.',
  },
  {
    name: 'Private credit and direct lending',
    gloss: 'Lenders inside a capital structure.',
  },
  {
    name: 'Mergers and acquisitions advisory',
    gloss: 'Boutiques running a live process.',
  },
  {
    name: 'Equity and debt capital markets',
    gloss: 'Issuance for companies and funds.',
  },
  {
    name: 'Project and infrastructure finance',
    gloss: 'Capital for long-lived assets.',
  },
  {
    name: 'Custody, escrow, and fund administration',
    gloss: 'The pipes a closing actually uses.',
  },
  {
    name: 'Placement and capital introduction',
    gloss: 'Raising a fund from the right rooms.',
  },
  {
    name: 'Transaction counsel',
    gloss: 'Counsel on the transaction itself.',
  },
  {
    name: 'Financial due diligence and tax',
    gloss: 'The work that sits under a price.',
  },
  {
    name: 'Corporate finance advisory',
    gloss: 'Independent advice to boards and owners.',
  },
]

/** Public sign-in for members. Staff use /login/staff. */
export const MEMBER_LOGIN = '/login'

export const HELD_FOR_LINE =
  'Held for: Chairperson · Board members · C-suite executives · Saudi Arabia & the GCC · International'

/** First sentence of an approved step body. The rest stays on /how-it-works. */
export function firstSentence(text: string): string {
  const cut = text.search(/[.!?](\s|$)/)
  if (cut === -1) return text
  return text.slice(0, cut + 1)
}

export const NAV_LINKS = [
  { label: 'How it works', to: '/how-it-works' },
  { label: 'Members', to: '/for-members' },
  { label: 'Capital', to: '/for-capital' },
  { label: 'Partners', to: '/partners' },
  { label: 'About', to: '/about' },
] as const

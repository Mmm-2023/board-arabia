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
    title: 'Directory',
    home: 'Find admitted members by name, firm or sector. Only signed-in members can see it.',
    href: '/for-members#directory',
  },
  {
    id: 'mandates',
    n: '02',
    title: 'Mandates',
    home: 'Capital briefs in outline. Request an intro, and admin unlocks the full brief if approved.',
    href: '/for-members#mandates',
  },
  {
    id: 'intros',
    n: '03',
    title: 'Intros',
    home: 'Ask a member with a short reason. They accept or decline. No open messaging.',
    href: '/for-members#intros',
  },
  {
    id: 'rooms',
    n: '04',
    title: 'Deal rooms',
    home: 'A private room for a deal. Members open it and invite the people they choose.',
    href: '/for-members#rooms',
  },
  {
    id: 'majlis',
    n: '05',
    title: 'Majlis',
    home: 'Private member gatherings. Join one, join a waitlist, or ask to host.',
    href: '/for-members#majlis',
  },
  {
    id: 'vouchers',
    n: '06',
    title: 'Invites',
    home: 'Invite someone you would sit with on a board. They still face review.',
    href: '/for-members#vouchers',
  },
  {
    id: 'real-estate',
    n: '07',
    title: 'Real estate',
    home: 'Opportunities, board roles, partner firms, appetite, and co-invest interest. Admin reviews the intros.',
    href: '/for-members#real-estate',
  },
  {
    id: 'due-diligence',
    n: '08',
    title: 'AI Due Diligence',
    home: 'AI reads a PDF or PPTX, lists its claims and suggests questions. Public source checks may be limited.',
    href: '/for-members#ai-tools',
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
    title: 'Private invite',
    home: 'If accepted, admin sends you a private invite. We never publish it here.',
    detail:
      'Only an accepted candidate receives a private invite from admin. It does not appear on this website, in the navigation, or in any public page. Visitors cannot arrange a conversation from here.',
  },
  {
    n: '05',
    title: 'Admit',
    home: 'After the conversation, admitted members enter the dashboard.',
    detail:
      'The conversation is about fit: the room, the contribution expected of founding members, and whether admission is right. Admitted members then enter the dashboard.',
  },
]

export { PARTNER_CATEGORIES, type PartnerCategory } from '../data/partnerCategories.ts'

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

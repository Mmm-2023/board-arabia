import type { AiToolKey } from '../../supabase/functions/_shared/ai_tools.ts'
import { SIGNING_IN, WHERE_DATA_LIVES } from './trust.ts'

export type LandingGroupId = 'people' | 'deals' | 'real-estate' | 'ai' | 'events' | 'security'

export type LandingFeature = {
  id: string
  group: LandingGroupId
  icon:
    | 'directory'
    | 'network'
    | 'profile'
    | 'mandates'
    | 'deals'
    | 'real-estate'
    | 'review'
    | 'capacity'
    | 'ai'
    | 'majlis'
    | 'settings'
  title: string
  body: string
  /** Member or public route. Tests only. Never rendered as a link. */
  route: string
  /** AI tools with a production flag. Due diligence has no flag. */
  flag?: AiToolKey
}

export const LANDING_AI_SCOPE =
  'These are AI tools, not people. They are not legal, financial or investment advice. Each tool says what it will and will not do.'

export const LANDING_GROUPS: { id: LandingGroupId; title: string; scope?: string }[] = [
  { id: 'people', title: 'Meet the right people' },
  { id: 'deals', title: 'Do deals privately' },
  { id: 'real-estate', title: 'Real estate' },
  { id: 'ai', title: 'AI tools for directors', scope: LANDING_AI_SCOPE },
  { id: 'events', title: 'Events' },
  { id: 'security', title: 'Security and privacy' },
]

/**
 * Card A4 names the weekly cap of two.
 * Ranking uses shared sector tags, vision themes, or the same region
 * (suggest_intros.ts). The body says sectors, themes or region.
 * AI Due Diligence uses the limited public-check line. Web search does not
 * run without its search key. Wikipedia and an optional company homepage
 * can still be read, so the card does not claim a full public-source check.
 */
export const LANDING_FEATURES: LandingFeature[] = [
  {
    id: 'directory',
    group: 'people',
    icon: 'directory',
    title: 'Directory',
    body: 'Find admitted members by name, firm or sector. Only signed-in members can see it, and you can hide yourself.',
    route: '/dashboard/people/directory',
  },
  {
    id: 'intros',
    group: 'people',
    icon: 'network',
    title: 'Intros',
    body: 'Ask a member for a warm introduction with a short reason. They accept or decline. No open messaging.',
    route: '/dashboard/people/intros',
  },
  {
    id: 'invites',
    group: 'people',
    icon: 'profile',
    title: 'Invites',
    body: 'Invite a peer you would sit with on a board. They still apply and are reviewed like everyone else.',
    route: '/dashboard/people/invites',
  },
  {
    id: 'suggestions',
    group: 'people',
    icon: 'network',
    title: 'Suggested introductions',
    body: 'Up to two suggested introductions a week, from shared sectors, themes or region.',
    route: '/dashboard/people/intros',
  },
  {
    id: 'mandates',
    group: 'deals',
    icon: 'mandates',
    title: 'Mandates',
    body: 'See capital briefs in outline. Request an intro, and admin unlocks the full brief if approved.',
    route: '/dashboard/deals/mandates',
  },
  {
    id: 'rooms',
    group: 'deals',
    icon: 'deals',
    title: 'Deal rooms',
    body: 'Open a private room for a deal, link a mandate or opportunity, and invite the members you choose.',
    route: '/dashboard/deals/rooms',
  },
  {
    id: 'opportunities',
    group: 'real-estate',
    icon: 'real-estate',
    title: 'Opportunities',
    body: 'Browse real estate opportunities. Counterparty and terms open after admin approves your intro.',
    route: '/dashboard/deals/real-estate',
  },
  {
    id: 'board-roles',
    group: 'real-estate',
    icon: 'review',
    title: 'Board roles',
    body: 'Board and non-executive seats on developer and property company boards, for founding members.',
    route: '/dashboard/deals/real-estate',
  },
  {
    id: 'partners',
    group: 'real-estate',
    icon: 'real-estate',
    title: 'Partners',
    body: 'Request an intro to a vetted real estate partner firm. Admin reviews it before any outreach.',
    route: '/dashboard/deals/real-estate',
  },
  {
    id: 'appetite',
    group: 'real-estate',
    icon: 'capacity',
    title: 'My RE appetite',
    body: 'Set your ticket band, places, asset classes and capital role so admin can match real estate intros.',
    route: '/dashboard/deals/real-estate',
  },
  {
    id: 'co-invest',
    group: 'real-estate',
    icon: 'deals',
    title: 'Co-invest interest',
    body: 'Express interest to co-invest on an opportunity. Admin may then open a club deal room.',
    route: '/dashboard/deals/real-estate',
  },
  {
    id: 'due-diligence',
    group: 'ai',
    icon: 'ai',
    title: 'AI Due Diligence',
    body: 'AI reads a PDF or PPTX, lists its claims and suggests questions. Public source checks may be limited.',
    route: '/dashboard/ai/due-diligence',
  },
  {
    id: 'cfo-check',
    group: 'ai',
    icon: 'ai',
    title: 'CFO check',
    body: 'An AI first read of your accounts or model: runway, margins and red flags. Not accounting or audit.',
    route: '/dashboard/ai/cfo-check',
    flag: 'cfo_check',
  },
  {
    id: 'deal-readiness',
    group: 'ai',
    icon: 'ai',
    title: 'Deal readiness memo',
    body: 'An AI first read of a real estate teaser or information memorandum. Indicative only, not advice.',
    route: '/dashboard/ai/deal-readiness',
    flag: 'deal_readiness',
  },
  {
    id: 'majlis',
    group: 'events',
    icon: 'majlis',
    title: 'Majlis',
    body: 'Small private gatherings for members. Join one, join a waitlist, add to your calendar, or ask to host.',
    route: '/dashboard/majlis',
  },
  {
    id: 'privacy',
    group: 'security',
    icon: 'profile',
    title: 'Your privacy',
    body: 'Hide yourself from the directory, download your data, and delete uploads and AI results at any time.',
    route: '/dashboard/privacy',
  },
  {
    id: 'two-step',
    group: 'security',
    icon: 'review',
    title: 'Two-step sign-in',
    body: SIGNING_IN[2],
    route: '/dashboard/two-step',
  },
  {
    id: 'frankfurt',
    group: 'security',
    icon: 'settings',
    title: 'Stored in Frankfurt',
    body: WHERE_DATA_LIVES[0],
    route: '/security',
  },
  {
    id: 'encrypted',
    group: 'security',
    icon: 'settings',
    title: 'Encrypted',
    body: WHERE_DATA_LIVES[1],
    route: '/security',
  },
]

/** Production flags confirmed on for members on 6 Oct 2026. Update only after a read of public.ai_tool_flags. */
export const LANDING_LIVE_AI_FLAGS: readonly AiToolKey[] = ['cfo_check', 'deal_readiness']

/** Terms that must never appear on the landing as live features. */
export const LANDING_NOT_YET: readonly RegExp[] = [
  /\bnewsletter\b/i,
  /\btrusted partners\b/i,
  /\bthree seats a year\b/i,
  /\bvault\b/i,
  /\bdocuments\b/i,
  /\bmarket brief\b/i,
  /\bdaily brief\b/i,
  /\bseat matching\b/i,
  /\bprivate messag/i,
  /\bmessage thread\b/i,
  /\bdirect message\b/i,
  /\bchat\b/i,
  /\boffice hours\b/i,
  /\bspotlight\b/i,
  /\bdeal tracker\b/i,
  /\brules tracker\b/i,
  /\bwarm path\b/i,
  /\bpath finder\b/i,
  /\bfollow-ups\b/i,
  /\blinkedin sign/i,
  /\bsign in with linkedin\b/i,
  /\bapp store\b/i,
  /\bgoogle play\b/i,
  /\biphone\b/i,
  /\bandroid\b/i,
  /\bemail notification\b/i,
  /\bterm sheet\b/i,
  /\bpricing sense\b/i,
  /\bgovernance tool\b/i,
  /\bnegotiation\b/i,
  /\bquarterly\b/i,
  /\bfour salons\b/i,
  /\bfounding badge\b/i,
  /\bmandate inbox\b/i,
  /\bpeer voucher\b/i,
  /\beach tile opens\b/i,
  /\bopened by our admin team\b/i,
]

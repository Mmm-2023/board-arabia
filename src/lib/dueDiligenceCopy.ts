/**
 * Member desk strings for the public-information check.
 * Paste-ready copy. No em dash in these strings.
 */
import { MEMBER_MESSAGES } from '../../supabase/functions/_shared/due_diligence.ts'

export const DD_COPY = {
  browserTitle: 'AI Due Diligence \u00b7 Board Arabia',
  introPrimary: 'Check a pitch deck against publicly available information.',
  introSupporting:
    'We read the deck you upload, then look for matching facts on the open web (and on a company site you optionally add). Private data rooms are not opened. This is awareness for you as a board member. It is not formal due diligence and it is not legal advice. You decide what to do next.',
  introShort:
    'Open-web research only. Not formal due diligence. Not legal advice. You decide what to do with the report.',
  doesHeading: 'What this check does',
  willNotHeading: 'What this check will not do',
  willDo: [
    'Pull claims and facts from your deck',
    'Compare them with publicly available sources',
    'Show how much looked publicly consistent vs not publicly verifiable',
    'Suggest follow-up questions and next steps for you',
  ],
  willNot: [
    'Open private data rooms or password-only pages',
    'Rate a deal as good or bad',
    'Replace your judgment, counsel, or a formal diligence process',
  ],
  idle: 'Upload a deck to start a public-information check.',
  fileChosen: 'Deck ready. Add a company site if you have one, then start the check.',
  emptyHistory: 'No checks yet. Your reports will show up here.',
  deckLabel: 'Pitch deck',
  deckButton: 'Choose PDF or PPTX',
  deckHint:
    'PDF or PPTX, up to 15 MB. Text-based files work best. Scanned image-only decks may not be readable.',
  ctaPrimary: 'Check this deck',
  ctaDisabled: 'Choose a deck first',
  ctaRunning: 'Starting\u2026',
  siteLabel: 'Company site (optional)',
  sitePlaceholder: 'https://',
  siteHelper:
    'Add the company\u2019s public homepage if you have it. We only fetch that https page and other open-web sources. Private data rooms, login pages, and shared drive links are not used.',
  siteHelperShort: 'Public https homepage only. Private data rooms are not used.',
  statusRunning: 'Checking public sources\u2026',
  statusReading: 'Reading your deck\u2026',
  statusResearching: 'Looking up public information\u2026',
  statusWriting: 'Building your report\u2026',
  progressHint: 'This usually takes a few minutes. You can leave this page open.',
  errorStart:
    'Could not start this check. Try again in a moment. If it keeps failing, contact support with the time you tried.',
  errorRetry: 'Try again',
  errorUnreadable:
    'Could not read this deck. Upload a text-based PDF or PPTX. Scanned image-only files usually will not work.',
  errorTooLarge: 'That file is too large. Use a PDF or PPTX up to 15 MB.',
  errorRate: 'You have reached today\u2019s check limit. Try again tomorrow, or open a past report below.',
  errorNetwork: 'Connection dropped. Check your network and try again.',
  errorGeneric: 'Something went wrong on this check. Try again, or open a past report if you have one.',
} as const

/** Member report chrome. Paste-ready. No em dash. */
export const REPORT_COPY = {
  nav: 'AI Due Diligence',
  back: 'All checks',
  preparedLabel: 'Prepared',
  documentsLabel: 'Documents reviewed',
  sectionOverview: 'Assessment overview',
  sectionScorecard: 'Area scorecard',
  sectionSummary: 'Overall summary',
  sectionSources: 'Sources',
  sectionNext: 'Next steps',
  metaCompany: 'Company',
  metaSector: 'Sector',
  metaAim: 'Aim',
  colArea: 'Area',
  colStatus: 'Status',
  colReason: 'Key reason',
  colClaim: 'Claim',
  colSource: 'Source',
  colFinding: 'Finding',
  summaryConsistent: 'Publicly consistent',
  summaryNotVerifiable: 'Not publicly verifiable',
  summaryConsistentHelper: 'Share of checked claims that matched public sources in this run.',
  summaryNotVerifiableHelper: 'Share of checked claims we could not match on the open web in this run.',
  groupP1: 'Priority 1 \u00b7 Confirm what is public',
  groupP2: 'Priority 2 \u00b7 Fill evidence gaps',
  groupNote: 'How to use this',
  copyAsk: 'Copy ask',
  copied: 'Copied',
  more: 'More asks',
  closingNote:
    'This note is a public-source assist. It is not formal due diligence and it is not legal advice. You decide the next conversation.',
  sourcesEmpty: 'No public URLs were attached to this report.',
  nextEmpty:
    'No follow-up asks were generated. Use the overview and findings to guide your next conversation.',
  showMore: 'Show more',
  showLess: 'Show less',
} as const

const DESK_ERROR_REPLACEMENTS: Record<string, string> = {
  [MEMBER_MESSAGES.start]: DD_COPY.errorStart,
  [MEMBER_MESSAGES.finish]: DD_COPY.errorGeneric,
  [MEMBER_MESSAGES.unreadable]: DD_COPY.errorUnreadable,
  [MEMBER_MESSAGES.scanned]: DD_COPY.errorUnreadable,
  [MEMBER_MESSAGES.rate]: DD_COPY.errorRate,
  [MEMBER_MESSAGES.file]: DD_COPY.errorTooLarge,
  'Could not read this deck. Upload a text-based PDF or PPTX.': DD_COPY.errorUnreadable,
}

/** Map an Edge or legacy safe string onto the member desk wording. */
export function presentDeskError(raw: string): string {
  if (!raw) return ''
  return DESK_ERROR_REPLACEMENTS[raw] ?? raw
}

export function deskCtaLabel(input: { busy: boolean; fileChosen: boolean }): string {
  if (input.busy) return DD_COPY.ctaRunning
  if (!input.fileChosen) return DD_COPY.ctaDisabled
  return DD_COPY.ctaPrimary
}

/** Map real job stage labels. Unknown stages use the generic running line. */
export function deskProgressLine(stage: string): string {
  const value = stage.trim().toLowerCase()
  if (value.includes('reading')) return DD_COPY.statusReading
  if (value.includes('writing') || value.includes('building')) return DD_COPY.statusWriting
  if (value.includes('checking') || value.includes('looking')) return DD_COPY.statusResearching
  if (!value || value.includes('queued') || value.includes('starting')) return DD_COPY.ctaRunning
  return DD_COPY.statusRunning
}

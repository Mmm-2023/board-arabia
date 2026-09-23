/**
 * Plain product English for empty, loading, error, permission, and filtered-zero.
 * Strings are the locked brief. Do not add an em dash.
 */

export type ViewStatus = 'ready' | 'empty' | 'loading' | 'error' | 'denied' | 'filtered'

export type ViewCopy = {
  empty: string
  error: string
  denied: string
  filtered: string
  retry: string
  clear: string
}

export const REFRESH_ERROR = "Couldn't refresh. Showing last update …"

export const MEMBER_VIEWS = {
  home: {
    empty: "You're in. Finish profile to unlock Directory.",
    emptyCta: 'Complete profile',
    error: REFRESH_ERROR,
    retry: 'Retry',
    denied: 'Sign in to open the member home.',
    filtered: '',
  },
  directory: {
    empty: 'No peers yet. Founding 100 is filling.',
    emptyBeforeAdmit: 'Directory unlocks after admit.',
    error: REFRESH_ERROR,
    retry: 'Retry',
    denied: 'The directory is for admitted members.',
    filtered: 'No matches. Clear filters.',
    clear: 'Clear filters',
  },
  mandates: {
    empty: 'No mandates yet. When capital briefs are approved, they land here.',
    error: REFRESH_ERROR,
    retry: 'Retry',
    denied: 'Mandates are for admitted members.',
    filtered: 'No matches. Clear filters.',
    clear: 'Clear filters',
  },
  network: {
    invites: 'You have 2 peer invites.',
    intros: 'No intro requests yet.',
    error: REFRESH_ERROR,
    retry: 'Retry',
    denied: 'Network is for admitted members.',
    filtered: 'No matches. Clear filters.',
    clear: 'Clear filters',
  },
  profile: {
    saveError: 'Could not save. Retry.',
    denied: 'Profile is for admitted members.',
  },
} as const

export const STAFF_VIEWS = {
  home: {
    empty: 'No pending applications.',
    error: REFRESH_ERROR,
    retry: 'Retry',
    denied: 'This desk is for staff.',
  },
  applications: {
    empty: 'No applications yet.',
    filtered: 'No applications in this filter.',
    clear: 'Clear filter',
    viewAll: 'View all',
    error: REFRESH_ERROR,
    retry: 'Retry',
    denied: 'A member-only account cannot review applications.',
  },
  people: {
    empty: 'No members yet. Admit from Applications.',
    error: REFRESH_ERROR,
    retry: 'Retry',
    denied: 'A sponsor login cannot open full member records here.',
    filtered: 'No matches. Clear filters.',
    clear: 'Clear filters',
  },
  capacity: {
    early:
      'Aggregates appear after verified opted-in admits (min N on public site).',
    error: REFRESH_ERROR,
    retry: 'Retry',
    denied: 'Capacity totals are for staff.',
  },
  settings: {
    booking: 'The private booking link is emailed on Accept. It is not shown on this page.',
    optional: 'Optional desk notes are not stored yet. Nothing here is published on the marketing site.',
    masterLock: 'Promote Admin is limited to the master login.',
    switchAbsent: 'Switch to member appears when this login also holds an active member seat.',
    saveError: 'Could not save. Retry.',
    denied: 'Settings are for staff.',
  },
} as const

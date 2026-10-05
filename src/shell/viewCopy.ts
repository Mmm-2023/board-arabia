/**
 * Plain product English for empty, loading, error, permission, and filtered-zero.
 * Strings are the locked brief. Do not add an em dash.
 */
import { DD_COPY } from '../lib/dueDiligenceCopy.ts'

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

export const ADMIN_PANEL_NOTICE = "This panel couldn't load. Try again shortly."

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
  realEstate: {
    intro:
      'Sector, region, asset class, ticket band, capital role, and readiness stay visible. Counterparty and terms stay locked until you request an intro and the desk approves it for you.',
    forming:
      'Real estate opportunities are still forming. These examples stay until real briefs can take their place.',
    empty: 'No opportunities yet. When the desk publishes a brief, it lands here.',
    error: REFRESH_ERROR,
    retry: 'Retry',
    denied: 'Real Estate is for admitted members.',
    filtered: 'No matches. Clear filters.',
    clear: 'Clear filters',
    partnersIntro:
      'Request intro asks the desk to make the introduction. This page does not open a message thread.',
    partnersForming:
      'Real estate partners are still forming. These examples stay until vetted firms can take their place.',
    partnersEmpty: 'No partners yet. When the desk publishes a firm, it lands here.',
    partnersDenied: 'Partners are for admitted members.',
    partnersRequested: 'Intro requested. The desk reviews it before any outreach.',
    partnersApproved:
      'The desk approved this intro. The desk handles outreach. Contact details stay off this page.',
    partnersDeclined: 'This intro was not approved.',
    rolesIntro:
      'Board and non-executive seats on developer and property company boards. Title, sector, capacity, and fit stay visible. The organisation and the seat terms stay locked until you request an intro and the desk approves it for you.',
    rolesForming: 'Board roles are still forming. These examples stay until real seats can take their place.',
    rolesEmpty: 'No board roles yet. When the desk publishes a seat, it lands here.',
    rolesEmptyAction: 'See opportunities',
    rolesDenied: 'Board roles are for founding members.',
    rolesLocked: 'The organisation and seat terms stay locked. Request intro to unlock.',
    rolesRequested: 'Intro requested. The desk must approve it before the organisation and seat terms open.',
    rolesApproved: 'Intro approved for you.',
    rolesDeclined: 'This intro was not approved.',
    rolesInventory: 'Desk record of this seat.',
    appetite: {
      title: 'My RE appetite',
      empty:
        'No appetite yet. Set the ticket, places, asset classes, and capital role you want. The desk uses this when matching intros.',
      lead: 'The desk uses this when matching intros.',
      formNote: 'These tags match the opportunity list. Saving does not reserve a deal.',
      set: 'Set appetite',
      edit: 'Edit appetite',
      save: 'Save appetite',
      saving: 'Saving',
      cancel: 'Cancel',
      error: 'Could not save appetite. Your choices are still here. Retry.',
      loadError: 'Could not load appetite. Retry.',
      unavailable: 'Appetite is not available yet.',
      denied: 'Appetite is for founding members.',
      loading: 'Loading appetite',
      retry: 'Retry',
      fit: 'Fits your appetite',
      ticket: 'Ticket band',
      regions: 'Regions',
      corridors: 'Corridors',
      assets: 'Asset classes',
      places: 'Places',
      role: 'Capital role',
      roleHint: 'Choose every role you will consider.',
      ticketError: 'Choose a ticket band.',
      placeError: 'Choose at least one region or corridor.',
      assetError: 'Choose at least one asset class.',
      roleError: 'Choose at least one capital role.',
    },
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
  majlis: {
    empty: 'No majlis is published yet.',
    error: REFRESH_ERROR,
    retry: 'Retry',
    denied: 'Majlis is for members.',
    filtered: 'No majlis matches these filters.',
    clear: 'Clear filters',
    mapUnavailable: 'The regional map is not available yet.',
  },
  rooms: {
    empty: 'A deal room is a private space to share documents and talk terms with the people on a deal.',
    emptyCta: 'Create room',
    openRoom: 'Open a room',
    error: REFRESH_ERROR,
    retry: 'Retry',
    denied: 'Deal rooms are for active members.',
  },
  dueDiligence: {
    empty: DD_COPY.emptyHistory,
    error: REFRESH_ERROR,
    retry: 'Retry',
    denied: 'AI Due Diligence is for members.',
    unavailable: 'AI Due Diligence is not available yet. Try again later.',
    ready: DD_COPY.fileChosen,
    noScore: 'No percentage. The deck did not state a checkable claim.',
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
  rooms: {
    empty: 'No deal rooms yet.',
    error: REFRESH_ERROR,
    retry: 'Retry',
    denied: 'This list is for staff.',
  },
  mandates: {
    empty: 'No mandates on the desk yet.',
    intro:
      'Open a mandate to see members whose sector tags, Vision 2030 themes, and availability fit. The desk sees this list. Members are not emailed or notified.',
    deskNote: 'Staff only. Copying a shortlist does not email or notify anyone.',
    noTags: 'This mandate has no sector or Vision 2030 tags, so there is no one to match.',
    noMatches:
      'No active members share these tags. Sample profiles are left out, and so are members who are inactive or unavailable.',
    scoreNote:
      'Score adds 3 for each shared sector, 2 for each shared Vision 2030 theme, 2 when availability is Open, and 1 when it is Selective.',
    copyFailed: 'Could not copy. Select the shortlist below and copy it yourself.',
    notFound: 'That mandate is not on the desk.',
    missing: 'The shortlist is not available on this database yet.',
    error: REFRESH_ERROR,
    retry: 'Retry',
    denied: 'This shortlist is for staff.',
  },
  capacity: {
    early:
      'Totals go public once enough verified members opt in.',
    error: REFRESH_ERROR,
    retry: 'Retry',
    denied: 'Capacity totals are for staff.',
  },
  majlis: {
    empty: 'No majlis is waiting for review.',
    emptyEvents: 'No majlis events yet.',
    filtered: 'No majlis matches these filters.',
    clear: 'Clear filters',
    error: REFRESH_ERROR,
    retry: 'Retry',
    denied: 'The majlis queue is for staff.',
  },
  reBoardRoles: {
    queue: 'Board role intros',
    queueError: 'Could not load board role intro requests.',
    saveError: 'Could not save that decision. Retry.',
    declineTitle: 'Decline this intro?',
    declineBody: 'The member keeps the public seat brief. The organisation and seat terms stay locked.',
    approve: 'Approve intro',
    decline: 'Decline intro',
    requestedBy: 'Requested by',
  },
  reAppetite: {
    title: 'Member RE appetite',
    lead: 'Use this when matching real estate intros.',
    empty: 'No member has set an RE appetite yet.',
    error: 'Could not load member appetite. Retry.',
    denied: 'Appetite is for staff.',
    unavailable: 'Appetite is not available yet.',
    loading: 'Loading member appetite',
    retry: 'Retry',
    none: 'No appetite set.',
    prefix: 'Appetite',
  },
  settings: {
    booking: 'The private invite email is sent on Accept. It is not shown on this page.',
    optional: 'Optional desk notes are not stored yet. Nothing here is published on the marketing site.',
    masterLock: 'Promote Admin is limited to the master login.',
    switchAbsent: 'Switch to member appears when this login also holds an active member seat.',
    saveError: 'Could not save. Retry.',
    denied: 'Settings are for staff.',
  },
} as const

import {
  declinedMail,
  deskRequestMail,
  emailLink,
  membershipLiveMail,
  needsInfoMail,
  requestReceivedMail,
  reviewCallMail,
  waitlistMail,
} from './membership_copy.ts'
import { daysSince, formatDeskDate, roleLabel, sendsBookingLink } from './membership_steps.ts'
import { captureApproved, type CaptureEnv } from './server_capture.ts'

export type Outbound = { to: string; subject: string; text: string; html: string; kind: string }

type Person = {
  userId: string
  email: string
  fullName: string
  role: string
  region: string
  company: string
  headline: string
  vouch: string
  analyticsId: string | null
  submittedAt: string | null
}

function dashboard() {
  return emailLink('/dashboard/membership', 'membership-request')
}

function adminLink(userId: string) {
  return emailLink(`/admin/applications/${userId}`, 'membership-request')
}

function liveLink() {
  return emailLink('/dashboard', 'membership-live')
}

/** Builds the letters for one desk transition. Review call is the only letter with the booking link. */
export function lettersForTransition(input: {
  to: string
  person: Person
  bookingUrl: string
  question: string
  declinedUntil: string | null
  foundingNumber: number | null
  tier: 'founding' | 'member' | null
}): { error?: string; letters: Outbound[] } {
  const link = dashboard()
  if (sendsBookingLink(input.to)) {
    const booking = input.bookingUrl.trim()
    if (!booking || !/^https:\/\//i.test(booking)) return { error: 'PRIVATE_BOOKING_LINK is not set', letters: [] }
    const mail = reviewCallMail({ bookingUrl: booking })
    return { letters: [{ to: input.person.email, kind: 'review_call', ...mail }] }
  }

  if (input.to === 'submitted') {
    const received = requestReceivedMail({ dashboardUrl: link })
    const desk = deskRequestMail({
      name: input.person.fullName,
      role: roleLabel(input.person.role) || input.person.role,
      region: input.person.region === 'ksa_gcc' ? 'KSA' : 'Intl',
      company: input.person.company || 'Not listed',
      vouch: input.person.vouch,
      adminUrl: adminLink(input.person.userId),
    })
    return {
      letters: [
        { to: input.person.email, kind: 'request_received', ...received },
        { to: 'desk', kind: 'desk_request', ...desk },
      ],
    }
  }

  if (input.to === 'needs_info') {
    const mail = needsInfoMail({ question: input.question.trim(), dashboardUrl: link })
    return { letters: [{ to: input.person.email, kind: 'needs_info', ...mail }] }
  }

  if (input.to === 'waitlisted') {
    const mail = waitlistMail({ dashboardUrl: link })
    return { letters: [{ to: input.person.email, kind: 'waitlisted', ...mail }] }
  }

  if (input.to === 'declined') {
    const mail = declinedMail({
      askAgain: input.declinedUntil ? formatDeskDate(input.declinedUntil) : 'the cooling off date',
      dashboardUrl: link,
    })
    return { letters: [{ to: input.person.email, kind: 'declined', ...mail }] }
  }

  if (input.to === 'approved' && input.tier) {
    const mail = membershipLiveMail({
      dashboardUrl: liveLink(),
      foundingNumber: input.foundingNumber,
      tier: input.tier,
    })
    return { letters: [{ to: input.person.email, kind: 'membership_live', ...mail }] }
  }

  return { letters: [] }
}

export function letterCarriesBooking(letters: Outbound[], bookingUrl: string) {
  const needle = bookingUrl.trim()
  if (!needle) return false
  return letters.some((letter) => `${letter.subject}\n${letter.text}\n${letter.html}`.includes(needle))
}

export async function maybeCaptureApproved(
  env: CaptureEnv,
  person: Person,
  tier: 'founding' | 'member',
  seat: 'ksa' | 'intl',
  post: (url: string, body: string, key: string) => Promise<boolean>,
) {
  return captureApproved(
    env,
    {
      analyticsId: person.analyticsId,
      tier,
      seat,
      daysSinceRequest: daysSince(person.submittedAt),
    },
    post,
  )
}

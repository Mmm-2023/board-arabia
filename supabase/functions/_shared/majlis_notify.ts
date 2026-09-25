import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { logEmailEvent, publicSite, sendEmail, type SendResult } from './mail.ts'
import {
  eventCancelledLetter,
  eventUpdatedLetter,
  guestCancelledLetter,
  guestPromotedLetter,
  guestRegisteredLetter,
  guestWaitlistLetter,
  hostRsvpLetter,
  reminderLetter,
  type MajlisMailEvent,
} from './majlis_mail.ts'

const ICS = { filename: 'majlis.ics', contentType: 'text/calendar; charset=UTF-8; method=PUBLISH' }

async function deliver(
  admin: SupabaseClient,
  input: {
    to: string
    kind: string
    eventId: string
    subject: string
    text: string
    html: string
    ics?: string | null
  },
): Promise<SendResult> {
  const sent = await sendEmail({
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: input.ics ? [{ ...ICS, content: input.ics }] : undefined,
  })
  await logEmailEvent(admin, {
    application_id: null,
    kind: input.kind,
    recipient: input.to,
    subject: input.subject,
    status: sent.status,
    provider: sent.provider,
    provider_id: sent.providerId,
    detail: sent.detail ?? null,
    payload: { event_id: input.eventId, template: input.kind },
  })
  return sent
}

export async function mailGuestRegistered(
  admin: SupabaseClient,
  to: string,
  event: MajlisMailEvent,
  memberId: string,
) {
  const letter = guestRegisteredLetter(publicSite(), event, memberId)
  return deliver(admin, {
    to,
    kind: 'majlis_e4',
    eventId: event.id,
    subject: letter.subject,
    text: letter.text,
    html: letter.html,
    ics: letter.ics,
  })
}

export async function mailGuestWaitlist(
  admin: SupabaseClient,
  to: string,
  event: MajlisMailEvent,
  position: number,
) {
  const letter = guestWaitlistLetter(publicSite(), event, position)
  return deliver(admin, {
    to,
    kind: 'majlis_e5',
    eventId: event.id,
    subject: letter.subject,
    text: letter.text,
    html: letter.html,
  })
}

export async function mailGuestPromoted(
  admin: SupabaseClient,
  to: string,
  event: MajlisMailEvent,
  memberId: string,
) {
  const letter = guestPromotedLetter(publicSite(), event, memberId)
  return deliver(admin, {
    to,
    kind: 'majlis_e6',
    eventId: event.id,
    subject: letter.subject,
    text: letter.text,
    html: letter.html,
    ics: letter.ics,
  })
}

export async function mailGuestCancelled(admin: SupabaseClient, to: string, event: MajlisMailEvent) {
  const letter = guestCancelledLetter(publicSite(), event)
  return deliver(admin, {
    to,
    kind: 'majlis_e7',
    eventId: event.id,
    subject: letter.subject,
    text: letter.text,
    html: letter.html,
  })
}

export async function mailHostRsvp(
  admin: SupabaseClient,
  to: string,
  event: MajlisMailEvent,
  guestLabel: string,
  change: 'registered' | 'waitlist' | 'cancelled' | 'promoted',
  registeredCount: number,
  waitlistCount: number,
) {
  const letter = hostRsvpLetter(publicSite(), event, guestLabel, change, registeredCount, waitlistCount)
  const kind = change === 'cancelled' ? 'majlis_e9' : 'majlis_e8'
  return deliver(admin, {
    to,
    kind,
    eventId: event.id,
    subject: letter.subject,
    text: letter.text,
    html: letter.html,
  })
}

export async function mailReminder(
  admin: SupabaseClient,
  to: string,
  event: MajlisMailEvent,
  kind: 't7' | 't1',
) {
  const letter = reminderLetter(publicSite(), event, kind)
  return deliver(admin, {
    to,
    kind: kind === 't7' ? 'majlis_e10' : 'majlis_e11',
    eventId: event.id,
    subject: letter.subject,
    text: letter.text,
    html: letter.html,
  })
}

export async function mailEventCancelled(
  admin: SupabaseClient,
  to: string,
  event: MajlisMailEvent,
  reason: string,
) {
  const letter = eventCancelledLetter(publicSite(), event, reason)
  return deliver(admin, {
    to,
    kind: 'majlis_e12',
    eventId: event.id,
    subject: letter.subject,
    text: letter.text,
    html: letter.html,
  })
}

export async function mailEventUpdated(
  admin: SupabaseClient,
  to: string,
  event: MajlisMailEvent,
  registered: boolean,
) {
  const letter = eventUpdatedLetter(publicSite(), event, registered)
  return deliver(admin, {
    to,
    kind: 'majlis_e13',
    eventId: event.id,
    subject: letter.subject,
    text: letter.text,
    html: letter.html,
  })
}

export async function markCalendarSent(admin: SupabaseClient, eventId: string, memberId: string) {
  await admin
    .from('majlis_rsvps')
    .update({ calendar_sent_at: new Date().toISOString() })
    .eq('event_id', eventId)
    .eq('member_id', memberId)
    .eq('status', 'registered')
}

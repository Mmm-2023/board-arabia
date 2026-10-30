import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { logEmailEvent, publicSite, sendEmail, type SendResult } from './mail.ts'
import { enqueueMemberNotice } from './member_notice.ts'
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
  type ReminderKind,
  type ReminderLetterOptions,
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
  kind: ReminderKind,
  notice?: { userId: string; refId: string; eventId: string },
  options?: ReminderLetterOptions,
) {
  if (notice?.userId && notice.refId && notice.eventId) {
    await enqueueMemberNotice({
      typeKey: 'event_reminder',
      userId: notice.userId,
      refId: notice.refId,
      payload: { event_id: notice.eventId },
    })
  }
  if (notice?.userId) {
    const gate = await eventReminderGate(admin, notice.userId)
    if (gate !== 'allow') {
      return {
        dryRun: false,
        provider: 'gmail',
        providerId: null,
        status: 'error' as const,
        detail: gate === 'suppressed' ? 'suppressed' : 'blocked_check_failed',
      }
    }
  }
  const letter = reminderLetter(publicSite(), event, kind, options)
  return deliver(admin, {
    to,
    kind: reminderMailKind(kind),
    eventId: event.id,
    subject: letter.subject,
    text: letter.text,
    html: letter.html,
  })
}

function reminderMailKind(kind: ReminderKind): string {
  if (kind === 't7') return 'majlis_e10'
  if (kind === 't1') return 'majlis_e11'
  if (kind === 't1h') return 'majlis_e14'
  return 'majlis_e15'
}

/** Fail closed. A missing check does not send. */
async function eventReminderGate(
  admin: SupabaseClient,
  userId: string,
): Promise<'allow' | 'suppressed' | 'failed'> {
  const { data, error } = await admin.rpc('service_event_reminder_blocked', { p_user: userId })
  if (error) return 'failed'
  if (data !== false) return 'suppressed'
  return 'allow'
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

import { requireStaff } from '../_shared/require_staff.ts'
import { adminNotifyEmail, corsHeaders, jsonResponse, logEmailEvent, sendEmail } from '../_shared/mail.ts'
import { lettersForTransition, maybeCaptureApproved, type Outbound } from '../_shared/membership_dispatch.ts'
import { deliverAdmitShare } from '../_shared/admit_share.ts'
import {
  admitLiShareEmailEnabled,
  firstName,
  sendDedicatedAdmitShare,
  shareSeat,
} from '../_shared/admit_li_share.ts'
import { emailLink } from '../_shared/membership_copy.ts'

type EnvSource = { get?: (key: string) => string | undefined }

function readEnv(name: string): string | undefined {
  const runtime = globalThis as { Deno?: { env?: EnvSource } }
  return runtime.Deno?.env?.get?.(name)
}

/** Read at send time. Never returned to the browser and never written on the site. */
function privateBookingLink() {
  return readEnv('PRIVATE_BOOKING_LINK')?.trim() || ''
}

const ACTIONS: Record<string, string> = {
  open: 'in_review',
  needs_info: 'needs_info',
  review_call: 'review_call',
  waitlist: 'waitlisted',
  approve: 'approved',
  decline: 'declined',
  close: 'closed',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const gate = await requireStaff(req, (body, status) => jsonResponse(req, body, status))
  if (gate instanceof Response) return gate
  const { user, admin } = gate

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }

  const userId = String(body.user_id || '')
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return jsonResponse(req, { error: 'user_id required' }, 400)

  const action = String(body.action || '')
  if (action === 'note') {
    const note = String(body.note || '').trim()
    if (note.length < 1 || note.length > 2000) return jsonResponse(req, { error: 'Write a note first.' }, 400)
    const { error } = await admin.from('candidate_notes').insert({
      candidate_user_id: userId,
      author_id: user.id,
      body: note,
    })
    if (error) return jsonResponse(req, { error: 'Could not save the note.' }, 500)
    return jsonResponse(req, { ok: true })
  }

  if (action === 'tick') {
    const patch: Record<string, boolean> = {}
    if (typeof body.linkedin_checked === 'boolean') patch.linkedin_checked = body.linkedin_checked
    if (typeof body.cr_checked === 'boolean') patch.cr_checked = body.cr_checked
    if (Object.keys(patch).length === 0) return jsonResponse(req, { error: 'Nothing to update.' }, 400)
    const { error } = await admin.from('candidates').update(patch).eq('user_id', userId)
    if (error) return jsonResponse(req, { error: 'Could not save the check.' }, 500)
    return jsonResponse(req, { ok: true })
  }

  const to = ACTIONS[action]
  if (!to) return jsonResponse(req, { error: 'Unknown action' }, 400)

  const bookingUrl = to === 'review_call' ? privateBookingLink() : ''
  if (to === 'review_call' && !bookingUrl) {
    return jsonResponse(req, { error: 'PRIVATE_BOOKING_LINK is not set' }, 500)
  }

  const before = await loadPerson(admin, userId)
  if (!before) return jsonResponse(req, { error: 'Not found' }, 404)

  const seat = body.seat === 'intl' ? 'intl' : body.seat === 'ksa' ? 'ksa' : null
  const tier = body.tier === 'member' ? 'member' : body.tier === 'founding' ? 'founding' : null
  const { data: result, error } = await admin.rpc('transition_candidate', {
    p_user_id: userId,
    p_actor: user.id,
    p_to: to,
    p_reason: typeof body.reason === 'string' ? body.reason : null,
    p_note: typeof body.note === 'string' ? body.note : null,
    p_items: Array.isArray(body.items) ? body.items.filter((item) => typeof item === 'string') : null,
    p_question: typeof body.question === 'string' ? body.question : null,
    p_seat: seat,
    p_tier: tier,
    p_capacity_verified: body.capacity_verified === true,
  })
  if (error) return jsonResponse(req, { error: transitionError(error.message) }, transitionStatus(error.message))
  const status = String(result?.status || '')
  if (status !== 'ok') return jsonResponse(req, { error: statusMessage(status) }, 409)

  const foundingNumber = typeof result?.founding_number === 'number' ? result.founding_number : null
  const approvedTier = result?.tier === 'member' || result?.tier === 'founding' ? result.tier : tier
  const approvedSeat = result?.seat === 'intl' || result?.seat === 'ksa' ? result.seat : seat
  const declinedUntil = to === 'declined' ? new Date(Date.now() + 180 * 86_400_000).toISOString() : null
  const built = lettersForTransition({
    to,
    person: before,
    bookingUrl,
    question: typeof body.question === 'string' ? body.question : '',
    declinedUntil,
    foundingNumber,
    tier: approvedTier,
  })
  if (built.error) return jsonResponse(req, { error: built.error }, 500)
  await deliver(admin, built.letters, bookingUrl)

  if (to === 'approved' && approvedTier && approvedSeat) {
    await sendShare(admin, before, approvedTier, approvedSeat, userId)
    await maybeCaptureApproved(
      {
        enabled: readEnv('ANALYTICS_ENABLED'),
        key: readEnv('POSTHOG_PROJECT_API_KEY'),
        host: readEnv('POSTHOG_HOST'),
      },
      before,
      approvedTier,
      approvedSeat,
      async (url, payload) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        })
        return res.ok
      },
    )
  }

  return jsonResponse(req, {
    ok: true,
    state: to,
    founding_number: foundingNumber,
  })
})

function transitionError(message: string) {
  if (message.includes('seat_full')) return 'That founding seat is full (50).'
  if (message.includes('founding_numbers_full')) return 'Founding numbers are full (100). Approve as Member.'
  if (message.includes('already_member')) return 'This person is already a member.'
  if (message.includes('invalid_seat')) return 'Choose Saudi Arabia or International.'
  if (message.includes('invalid_tier')) return 'Choose Founding Member or Member.'
  return 'Could not update the request.'
}

function transitionStatus(message: string) {
  if (message.includes('seat_full') || message.includes('founding_numbers_full') || message.includes('already_member')) {
    return 409
  }
  return 500
}

function statusMessage(status: string) {
  if (status === 'blocked') return 'That move is not available from the current state.'
  if (status === 'question_required') return 'Write the question and choose the items.'
  if (status === 'items_required') return 'Choose at least one item.'
  if (status === 'reason_required') return 'Choose a reason.'
  if (status === 'invalid_seat') return 'Choose Saudi Arabia or International.'
  if (status === 'invalid_tier') return 'Choose Founding Member or Member.'
  return 'Could not update the request.'
}

async function loadPerson(admin: { from: (table: string) => any }, userId: string) {
  const { data } = await admin
    .from('candidates')
    .select('user_id, email, full_name, role, region, company_name, job_title, referral_name, analytics_id, submitted_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (!data?.email) return null
  return {
    userId: String(data.user_id),
    email: String(data.email),
    fullName: String(data.full_name || 'there'),
    role: String(data.role || ''),
    region: String(data.region || ''),
    company: String(data.company_name || ''),
    headline: String(data.job_title || ''),
    vouch: String(data.referral_name || ''),
    analyticsId: data.analytics_id ? String(data.analytics_id) : null,
    submittedAt: data.submitted_at ? String(data.submitted_at) : null,
  }
}

async function deliver(admin: Parameters<typeof logEmailEvent>[0], letters: Outbound[], bookingUrl: string) {
  const desk = adminNotifyEmail()
  for (const letter of letters) {
    const body = `${letter.subject}\n${letter.text}\n${letter.html}`
    if (letter.kind !== 'review_call' && bookingUrl && body.includes(bookingUrl)) continue
    if (letter.kind !== 'review_call' && /calendar\.app\.google|nammco/i.test(body)) continue
    const to = letter.to === 'desk' ? desk : letter.to
    if (!to) continue
    const sent = await sendEmail({ to, subject: letter.subject, html: letter.html, text: letter.text })
    await logEmailEvent(admin, {
      application_id: null,
      kind: letter.kind,
      recipient: to,
      subject: letter.subject,
      status: sent.status,
      provider: sent.provider,
      provider_id: sent.providerId,
      detail: letter.kind === 'review_call' ? 'private link emailed' : sent.detail ?? null,
      payload: { kind: letter.kind },
    })
  }
}

async function sendShare(
  admin: {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
  },
  person: { userId: string; email: string; fullName: string; headline: string; company: string },
  tier: 'founding' | 'member',
  seat: 'ksa' | 'intl',
  userId: string,
) {
  const tierLabel = tier === 'founding' ? 'Founding Member' : 'Member'
  const dashboardUrl = emailLink('/dashboard', 'membership-live')
  const dedicated = admitLiShareEmailEnabled()
  let share: { status: string; subject: string; detail: string | null }
  if (!dedicated) {
    share = await deliverAdmitShare(
      {
        to: person.email,
        memberName: person.fullName,
        tier: tierLabel,
        headline: person.headline,
        company: person.company,
        dashboardUrl,
      },
      (message) => sendEmail(message),
    )
  } else {
    const seatShare = shareSeat(tierLabel)
    try {
      share = await sendDedicatedAdmitShare({
        enabled: true,
        to: person.email,
        firstName: firstName(person.fullName),
        seatLabel: seatShare.seatLabel,
        founding: seatShare.founding,
        headline: person.headline,
        company: person.company,
        dashboardUrl,
        clickBase: `${readEnv('SUPABASE_URL') ?? ''}/functions/v1`,
        claim: async (input) => {
          const { data, error } = await admin.rpc('claim_admit_li_share_send', {
            p_user_id: userId,
            p_application_id: null,
            p_token: input.token,
            p_seat_label: input.seatLabel,
            p_post_text: input.postText,
          })
          if (error || !data || typeof data !== 'object') return null
          const row = data as { token?: unknown; post_text?: unknown }
          if (typeof row.token !== 'string' || typeof row.post_text !== 'string') return null
          return { token: row.token, postText: row.post_text }
        },
        release: async () => {
          await admin.rpc('release_admit_li_share_send', { p_user_id: userId })
        },
        send: (message) => sendEmail(message),
      })
    } catch {
      share = { status: 'error', subject: 'Board Arabia LinkedIn draft', detail: 'Share email failed' }
    }
  }
  await logEmailEvent(admin as Parameters<typeof logEmailEvent>[0], {
    application_id: null,
    kind: dedicated ? 'admit_li_share' : 'admit_linkedin_share',
    recipient: person.email,
    subject: share.subject,
    status: share.status,
    provider: 'gmail',
    provider_id: null,
    detail: share.detail,
    payload: { tier: tierLabel, seat },
  })
}

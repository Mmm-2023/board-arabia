import { bumpKeyedLimit } from '../_shared/rate_limit.ts'
import { requireUser } from '../_shared/require_user.ts'
import { adminNotifyEmail, jsonResponse, logEmailEvent, sendEmail, corsHeaders } from '../_shared/mail.ts'
import { lettersForTransition, type Outbound } from '../_shared/membership_dispatch.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const gate = await requireUser(req)
  if ('error' in gate) return jsonResponse(req, { error: gate.error }, gate.status)
  const { user, admin } = gate

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }

  const action = String(body.action || '')
  if (action === 'submit') {
    const limited = await bumpKeyedLimit(admin, 'membership_rate_limits', `submit:${user.id}`, 60 * 60 * 1000, 10)
    if (limited === 'limited') return jsonResponse(req, { error: 'Too many attempts. Try again later.' }, 429)
    if (limited === 'error') return jsonResponse(req, { error: 'Could not submit the request.' }, 503)
    const { data: status, error } = await admin.rpc('submit_candidate_request', {
      p_user_id: user.id,
      p_consent: body.consent === true,
    })
    if (error) return jsonResponse(req, { error: 'Could not submit the request.' }, 500)
    if (status !== 'ok') {
      const code = String(status || 'locked')
      return jsonResponse(req, { error: submitMessage(code), code }, code === 'incomplete' || code === 'consent' ? 400 : 409)
    }
    const person = await loadPerson(admin, user.id)
    if (person) {
      const built = lettersForTransition({
        to: 'submitted',
        person,
        bookingUrl: '',
        question: '',
        declinedUntil: null,
        foundingNumber: null,
        tier: null,
      })
      await deliver(req, admin, built.letters, null)
    }
    return jsonResponse(req, { ok: true, state: 'submitted' })
  }

  if (action === 'reply') {
    const patch = replyPatch(body)
    const { data: status, error } = await admin.rpc('reply_candidate_needs_info', {
      p_user_id: user.id,
      p_patch: patch,
    })
    if (error) return jsonResponse(req, { error: 'Could not save the reply.' }, 500)
    if (status !== 'ok') return jsonResponse(req, { error: 'Admin is not waiting on a reply.' }, 409)
    return jsonResponse(req, { ok: true, state: 'in_review' })
  }

  return jsonResponse(req, { error: 'Unknown action' }, 400)
})

function submitMessage(code: string) {
  if (code === 'consent') return 'Confirm the membership notice before you submit.'
  if (code === 'incomplete') return 'Finish the required steps before you submit.'
  if (code === 'cooling') return 'You can ask again after the cooling off date.'
  if (code === 'locked') return 'This request can no longer be edited.'
  return 'Could not submit the request.'
}

function replyPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {}
  const textKeys = [
    'role',
    'board_seats',
    'company_name',
    'job_title',
    'company_website',
    'linkedin_url',
    'scale_kind',
    'scale_band',
    'statement',
    'cr_number',
    'cr_country',
    'referral_name',
    'phone',
    'reply',
  ]
  for (const key of textKeys) {
    if (typeof body[key] === 'string') patch[key] = body[key]
  }
  if (Array.isArray(body.sector_tags)) patch.sector_tags = body.sector_tags.filter((item) => typeof item === 'string')
  if (Array.isArray(body.vision_tags)) patch.vision_tags = body.vision_tags.filter((item) => typeof item === 'string')
  if (typeof body.investable_capacity_usd === 'number') patch.investable_capacity_usd = body.investable_capacity_usd
  if (typeof body.include_in_public_aggregates === 'boolean') {
    patch.include_in_public_aggregates = body.include_in_public_aggregates
  }
  return patch
}

async function loadPerson(
  admin: { from: (table: string) => any },
  userId: string,
) {
  const { data } = await admin
    .from('candidates')
    .select('user_id, email, full_name, role, region, company_name, referral_name, analytics_id, submitted_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) return null
  return {
    userId: String(data.user_id),
    email: String(data.email || ''),
    fullName: String(data.full_name || 'there'),
    role: String(data.role || ''),
    region: String(data.region || ''),
    company: String(data.company_name || ''),
    headline: '',
    vouch: String(data.referral_name || ''),
    analyticsId: data.analytics_id ? String(data.analytics_id) : null,
    submittedAt: data.submitted_at ? String(data.submitted_at) : null,
  }
}

async function deliver(
  req: Request,
  admin: Parameters<typeof logEmailEvent>[0],
  letters: Outbound[],
  bookingUrl: string | null,
) {
  const desk = adminNotifyEmail()
  for (const letter of letters) {
    if (bookingUrl && letter.kind !== 'review_call' && letter.text.includes(bookingUrl)) continue
    if (letter.kind !== 'review_call' && /calendar\.app\.google|nammco/i.test(`${letter.subject}\n${letter.text}`)) continue
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

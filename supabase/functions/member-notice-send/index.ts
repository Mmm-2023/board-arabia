import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse, publicSite } from '../_shared/mail.ts'
import { memberNoticeMail } from '../_shared/member_notice_copy.ts'
import { deliverMemberNotices, noticeStreamConfig, type NoticeToSend } from '../_shared/member_notice_send.ts'
import { requireStaff } from '../_shared/require_staff.ts'

type ClaimRow = {
  outbox_id?: string
  type_key?: string
  user_id?: string
  ref_id?: string
  address?: string
  unsubscribe_token?: string | null
  essential?: boolean
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) return jsonResponse(req, { error: 'Unauthorized' }, 401)

  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  let admin = createClient(supabaseUrl, serviceKey)
  if (!(bearer && safeEqual(bearer, serviceKey))) {
    const staff = await requireStaff(req, (body, status) => jsonResponse(req, body, status))
    if (staff instanceof Response) return staff
    admin = staff.admin
  }

  const settingsRes = await admin.rpc('service_notice_settings')
  const settings = settingsRes.data as {
    master_enabled?: boolean
    batch_size?: number
    batch_pause_ms?: number
  } | null
  if (settingsRes.error || !settings || typeof settings !== 'object') {
    return jsonResponse(req, { error: 'Could not read notice settings.' }, 500)
  }

  const batchSize = Number(settings.batch_size ?? 50)
  if (settings.master_enabled !== true) {
    await admin.rpc('service_claim_member_notices', { p_limit: batchSize })
    return jsonResponse(req, { ok: true, blocked: 'master_off', sent: 0 })
  }

  const stream = noticeStreamConfig({
    RESEND_API_KEY_MAIL: Deno.env.get('RESEND_API_KEY_MAIL') ?? '',
    EMAIL_FROM_MAIL: Deno.env.get('EMAIL_FROM_MAIL') ?? '',
  })
  const apiKey = stream.apiKey
  const fromMailbox = stream.fromMailbox
  const replyTo = Deno.env.get('EMAIL_REPLY_TO')?.trim() || ''
  const contactEmail = Deno.env.get('PUBLIC_CONTACT_EMAIL')?.trim() || ''
  if (!apiKey || !fromMailbox || !replyTo) {
    return jsonResponse(req, { ok: false, blocked: 'not_configured' }, 503)
  }

  const claim = await admin.rpc('service_claim_member_notices', { p_limit: batchSize })
  if (claim.error || !Array.isArray(claim.data)) {
    return jsonResponse(req, { error: 'Could not read pending notices.' }, 500)
  }

  const edge = supabaseUrl.replace(/\/$/, '')
  const notices: NoticeToSend[] = []
  for (const row of claim.data as ClaimRow[]) {
    if (!row.outbox_id || !row.type_key || !row.user_id || !row.ref_id || !row.address) continue
    const unsubscribeUrl =
      row.essential || !row.unsubscribe_token
        ? null
        : `${edge}/functions/v1/email-unsubscribe?t=${encodeURIComponent(row.unsubscribe_token)}`
    let mail: ReturnType<typeof memberNoticeMail>
    try {
      mail = memberNoticeMail({
        typeKey: row.type_key,
        contactEmail,
        site: publicSite(),
        unsubscribeUrl,
      })
    } catch {
      await admin.rpc('service_finish_member_notice', {
        p_outbox_id: row.outbox_id,
        p_status: 'failed',
        p_reason: 'unknown_notice',
        p_provider_message_id: '',
      })
      continue
    }
    notices.push({
      outboxId: row.outbox_id,
      typeKey: row.type_key,
      userId: row.user_id,
      refId: row.ref_id,
      address: row.address,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      essential: mail.essential,
      unsubscribeUrl,
    })
  }

  const result = await deliverMemberNotices({
    notices,
    masterEnabled: true,
    batchSize,
    pauseMs: Number(settings.batch_pause_ms ?? 1500),
    apiKey,
    fromMailbox,
    replyTo,
  })
  for (const outcome of result.outcomes) {
    await admin.rpc('service_finish_member_notice', {
      p_outbox_id: outcome.outboxId,
      p_status: outcome.status,
      p_reason: outcome.reason,
      p_provider_message_id: outcome.providerMessageId,
    })
  }
  return jsonResponse(req, {
    ok: true,
    sent: result.sent,
    skipped: result.skipped,
    failed: result.failed,
  })
})

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return diff === 0
}

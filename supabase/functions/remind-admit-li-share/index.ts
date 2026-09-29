import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  admitLiReminderMail,
  admitLiShareReminderEnabled,
  admitShareBrandBlocked,
  admitShareClickUrl,
  ADMIT_LI_SHARE_REMINDER_SECRET,
  deliverAdmitShareReminders,
  firstName,
  linkedInShareUrl,
  type AdmitShareReminderRow,
} from '../_shared/admit_li_share.ts'
import { jsonResponse, logEmailEvent, sendEmail } from '../_shared/mail.ts'

type DueRow = AdmitShareReminderRow & {
  applicationId: string | null
  token: string | null
  seatLabel: string
  postText: string | null
  fullName: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type, x-admit-li-share-reminder',
      },
    })
  }
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)
  if (!authorized(req)) return jsonResponse(req, { error: 'Unauthorized' }, 401)
  if (!admitLiShareReminderEnabled()) {
    return jsonResponse(req, { ok: true, sent: 0, failed: 0, dryRun: false, skipped: 0, disabled: true })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) return jsonResponse(req, { error: 'Unauthorized' }, 401)
  const admin = createClient(supabaseUrl, serviceKey)
  const { data, error } = await admin.rpc('due_admit_li_share_reminders')
  if (error) return jsonResponse(req, { error: 'Could not read due reminders.' }, 500)

  const due = ((data ?? []) as Record<string, unknown>[]).map(mapDue).filter((row): row is DueRow => row !== null)
  const clickBase = `${supabaseUrl.replace(/\/$/, '')}/functions/v1`
  const now = new Date()

  const result = await deliverAdmitShareReminders({
    enabled: true,
    now,
    due,
    claim: async (row) => {
      const { data: claimed, error: claimError } = await admin.rpc('claim_admit_li_share_reminder', {
        p_user_id: row.userId,
      })
      return !claimError && claimed === true
    },
    release: async (row) => {
      await admin.rpc('release_admit_li_share_reminder', { p_user_id: row.userId })
    },
    send: async (row) => {
      const postText = row.postText || ''
      if (!postText || !row.email) return { status: 'error' as const }
      const clickUrl = row.token ? admitShareClickUrl(clickBase, row.token) : null
      const mail = admitLiReminderMail({
        memberName: firstName(row.fullName),
        tier: row.seatLabel,
        postText,
        shareUrl: linkedInShareUrl(postText),
        clickUrl,
      })
      if (admitShareBrandBlocked(`${mail.subject}\n${mail.text}\n${mail.html}`)) return { status: 'error' as const }
      const sent = await sendEmail({ to: row.email, subject: mail.subject, html: mail.html, text: mail.text })
      if (sent.status === 'sent' || sent.status === 'error') {
        await logEmailEvent(admin, {
          application_id: row.applicationId,
          kind: 'admit_li_share_reminder',
          recipient: row.email,
          subject: mail.subject,
          status: sent.status,
          provider: sent.provider,
          provider_id: sent.providerId,
          detail: sent.detail ?? null,
          payload: { user_id: row.userId },
        })
      }
      return { status: sent.status }
    },
  })

  return jsonResponse(req, { ok: true, ...result })
})

function mapDue(row: Record<string, unknown>): DueRow | null {
  const userId = typeof row.user_id === 'string' ? row.user_id : ''
  if (!userId) return null
  return {
    userId,
    email: typeof row.email === 'string' ? row.email : null,
    sentAt: typeof row.sent_at === 'string' ? row.sent_at : null,
    clickedAt: typeof row.clicked_at === 'string' ? row.clicked_at : null,
    reminderSentAt: typeof row.reminder_sent_at === 'string' ? row.reminder_sent_at : null,
    suppressedAt: typeof row.suppressed_at === 'string' ? row.suppressed_at : null,
    optedOutAt: typeof row.opted_out_at === 'string' ? row.opted_out_at : null,
    status: typeof row.status === 'string' ? row.status : '',
    applicationId: typeof row.application_id === 'string' ? row.application_id : null,
    token: typeof row.token === 'string' ? row.token : null,
    seatLabel: typeof row.seat_label === 'string' ? row.seat_label : 'Founding Member',
    postText: typeof row.post_text === 'string' ? row.post_text : null,
    fullName: typeof row.full_name === 'string' ? row.full_name : null,
  }
}

function authorized(req: Request): boolean {
  const cron = Deno.env.get(ADMIT_LI_SHARE_REMINDER_SECRET)?.trim() || ''
  const header = req.headers.get('x-admit-li-share-reminder')?.trim() || ''
  if (cron && header && safeEqual(cron, header)) return true
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || ''
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (service && bearer && safeEqual(service, bearer)) return true
  return false
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return diff === 0
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { deliverInviteReminders, type ReminderInvite } from '../_shared/invite_reminder.ts'
import { jsonResponse, logEmailEvent, publicSite, sendEmail } from '../_shared/mail.ts'
import { applyInviteUrl, peerInviteReminderMail } from '../_shared/peer_invite.ts'

type DueRow = ReminderInvite & {
  token: string
  inviter_name: string
  inviter_headline: string | null
  inviter_company: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type, x-invite-reminder',
      },
    })
  }
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)
  if (!authorized(req)) return jsonResponse(req, { error: 'Unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) return jsonResponse(req, { error: 'Unauthorized' }, 401)
  const admin = createClient(supabaseUrl, serviceKey)

  const { data, error } = await admin.rpc('due_member_invite_reminders')
  if (error) return jsonResponse(req, { error: 'Could not read due reminders.' }, 500)
  const due = (data ?? []) as DueRow[]
  const site = publicSite()

  const result = await deliverInviteReminders({
    now: new Date(),
    due,
    claim: async (row) => {
      const { data: claimed, error: claimError } = await admin.rpc('claim_member_invite_reminder', {
        p_invite_id: row.id,
      })
      return !claimError && claimed === true
    },
    release: async (row) => {
      await admin.rpc('release_member_invite_reminder', { p_invite_id: row.id })
    },
    send: async (row) => {
      const mail = peerInviteReminderMail(applyInviteUrl(site, row.token), {
        name: row.inviter_name,
        headline: row.inviter_headline,
        company: row.inviter_company,
      })
      if (/calendar\.app\.google|nammco|sme marketer/i.test(`${mail.subject}\n${mail.text}\n${mail.html}`)) {
        return { status: 'error' }
      }
      const sent = await sendEmail({
        to: row.recipient_email || '',
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      })
      if (sent.status === 'sent' || sent.status === 'error') {
        await logEmailEvent(admin, {
          application_id: null,
          kind: 'peer_invite_reminder',
          recipient: row.recipient_email || '',
          subject: mail.subject,
          status: sent.status,
          provider: sent.provider,
          provider_id: sent.providerId,
          detail: sent.detail ?? null,
          payload: { invite_id: row.id },
        })
      }
      return { status: sent.status }
    },
  })

  return jsonResponse(req, { ok: true, ...result })
})

function authorized(req: Request): boolean {
  const cron = Deno.env.get('INVITE_REMINDER_SECRET')?.trim() || ''
  const header = req.headers.get('x-invite-reminder')?.trim() || ''
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

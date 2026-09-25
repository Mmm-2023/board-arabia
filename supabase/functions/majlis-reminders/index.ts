import { jsonResponse } from '../_shared/mail.ts'
import { mailReminder } from '../_shared/majlis_notify.ts'
import type { MajlisMailEvent } from '../_shared/majlis_mail.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

type DueRow = MajlisMailEvent & {
  rsvp_id: string
  kind: 't7' | 't1'
  member_id: string
  email: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-majlis-cron' } })
  }
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)
  if (!authorized(req)) return jsonResponse(req, { error: 'Unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) return jsonResponse(req, { error: 'Unauthorized' }, 401)
  const admin = createClient(supabaseUrl, serviceKey)

  const { data, error } = await admin.rpc('majlis_due_reminders')
  if (error) return jsonResponse(req, { error: 'Could not read due reminders.' }, 500)
  const due = (data ?? []) as DueRow[]

  let t7 = 0
  let t1 = 0
  let failed = 0
  for (const row of due) {
    if (row.kind !== 't7' && row.kind !== 't1') continue
    if (!row.email || !row.rsvp_id) continue
    const { data: claimed, error: claimError } = await admin.rpc('majlis_claim_reminder', {
      p_rsvp: row.rsvp_id,
      p_kind: row.kind,
    })
    if (claimError || claimed !== true) continue
    const sent = await mailReminder(admin, row.email, row, row.kind)
    if (sent.status !== 'sent') {
      failed += 1
      await admin.rpc('majlis_release_reminder', { p_rsvp: row.rsvp_id, p_kind: row.kind })
      continue
    }
    if (row.kind === 't7') t7 += 1
    else t1 += 1
  }

  return jsonResponse(req, { ok: true, t7, t1, failed })
})

function authorized(req: Request): boolean {
  const cron = Deno.env.get('MAJLIS_CRON_SECRET')?.trim() || ''
  const header = req.headers.get('x-majlis-cron')?.trim() || ''
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

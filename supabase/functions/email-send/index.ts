import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse, publicSite } from '../_shared/mail.ts'
import { requireStaff } from '../_shared/require_staff.ts'
import { handleEmailSend, type LogSendInput, type SendGate, type SendRecipient } from './handle.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const gate = await requireStaff(req, (body, status) => jsonResponse(req, body, status))
  if (gate instanceof Response) return gate

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) return jsonResponse(req, { ok: false, error: 'not_configured' }, 503)

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonResponse(req, { ok: false, error: 'invalid_body' }, 400)
  }

  const { data: staff } = await gate.admin
    .from('staff_users')
    .select('email')
    .eq('user_id', gate.user.id)
    .maybeSingle()

  const admin = createClient(supabaseUrl, serviceKey)
  const result = await handleEmailSend(raw, {
    role: gate.role,
    userId: gate.user.id,
    staffAddress: typeof staff?.email === 'string' ? staff.email : '',
    apiKey: Deno.env.get('RESEND_API_KEY') ?? '',
    fromAddress: Deno.env.get('EMAIL_FROM') ?? '',
    contactEmail: Deno.env.get('PUBLIC_CONTACT_EMAIL') ?? '',
    siteOrigin: publicSite(),
    functionsOrigin: supabaseUrl,
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    fetchImpl: (url, init) => fetch(url, init),
    loadGate: async (campaignId) => {
      const { data, error } = await admin.rpc('email_send_gate', { p_campaign_id: campaignId })
      if (error || !data || data.found !== true) return null
      return data as SendGate
    },
    loadRecipients: async (campaignId) => {
      const { data, error } = await admin.rpc('email_recipients', { p_campaign_id: campaignId })
      if (error || !Array.isArray(data)) return []
      return data.map((row: { user_id: string; address: string; unsubscribe_token: string }) => ({
        userId: row.user_id,
        address: row.address,
        unsubscribeToken: row.unsubscribe_token,
      })) as SendRecipient[]
    },
    isSuppressed: async (emailHash) => {
      const { data, error } = await admin.rpc('email_is_suppressed', { p_email_hash: emailHash })
      if (error) return true
      return data === true
    },
    logSend: async (row: LogSendInput) => {
      const { data, error } = await admin.rpc('email_log_send', {
        p_campaign_id: row.campaignId,
        p_user_id: row.userId,
        p_email_hash: row.emailHash,
        p_is_test: row.isTest,
        p_status: row.status,
        p_skip_reason: row.skipReason,
        p_provider_message_id: row.providerMessageId,
        p_send_id: row.sendId,
      })
      if (error || !data || data.ok !== true) return { ok: false }
      return { ok: true, id: data.id, status: data.status, send: data.send }
    },
    setProgress: async (campaignId, status) => {
      const { data, error } = await admin.rpc('email_set_campaign_progress', {
        p_campaign_id: campaignId,
        p_status: status,
      })
      return !error && data?.ok === true
    },
  })
  return jsonResponse(req, result.body, result.status)
})

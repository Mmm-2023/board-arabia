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
    newsApiKey: Deno.env.get('RESEND_API_KEY_NEWS') ?? '',
    newsFrom: Deno.env.get('EMAIL_FROM_NEWS') ?? '',
    trackedApiKey: Deno.env.get('RESEND_API_KEY_NEWS_TRACKED') ?? '',
    trackedFrom: Deno.env.get('EMAIL_FROM_NEWS_TRACKED') ?? '',
    contactEmail: Deno.env.get('PUBLIC_CONTACT_EMAIL') ?? '',
    siteOrigin: publicSite(),
    functionsOrigin: supabaseUrl,
    streamEnv: {
      RESEND_API_KEY: Deno.env.get('RESEND_API_KEY') ?? '',
      EMAIL_FROM: Deno.env.get('EMAIL_FROM') ?? '',
      RESEND_API_KEY_NEWS: Deno.env.get('RESEND_API_KEY_NEWS') ?? '',
      EMAIL_FROM_NEWS: Deno.env.get('EMAIL_FROM_NEWS') ?? '',
      RESEND_API_KEY_MAIL: Deno.env.get('RESEND_API_KEY_MAIL') ?? '',
      EMAIL_FROM_MAIL: Deno.env.get('EMAIL_FROM_MAIL') ?? '',
    },
    unsubMailto: Deno.env.get('EMAIL_UNSUB_MAILTO') ?? '',
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
      return data.map((row: { user_id: string; address: string; unsubscribe_token: string; measure?: boolean }) => ({
        userId: row.user_id,
        address: row.address,
        unsubscribeToken: row.unsubscribe_token,
        measure: row.measure === true,
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
        p_actor: gate.user.id,
      })
      return !error && data?.ok === true
    },
    setMeasure: async (sendId, measure) => {
      await admin.rpc('email_set_send_measure', { p_send_id: sendId, p_measure: measure })
    },
    markTest: async (campaignId) => {
      const { data, error } = await admin.rpc('email_mark_owner_test', {
        p_campaign_id: campaignId,
        p_actor: gate.user.id,
      })
      return !error && data?.ok === true
    },
    rateCheck: async (campaignId) => {
      const { data, error } = await admin.rpc('email_campaign_rates', { p_campaign_id: campaignId })
      if (error || !data || typeof data !== 'object') return null
      const row = data as { delivered?: unknown; complaints?: unknown; bounces?: unknown }
      return {
        delivered: numberOrZero(row.delivered),
        complaints: numberOrZero(row.complaints),
        bounces: numberOrZero(row.bounces),
      }
    },
    applyPause: async (campaignId, reason) => {
      await admin.rpc('email_apply_pause', { p_campaign_id: campaignId, p_reason: reason })
    },
  })
  return jsonResponse(req, result.body, result.status)
})

function numberOrZero(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.floor(parsed)
}

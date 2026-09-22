import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  PASSWORD_RESET_REDIRECT,
  passwordResetMail,
} from '../_shared/transactional_copy.ts'
import { corsHeaders, jsonResponse, logEmailEvent, sendEmail } from './mail.ts'

const GENERIC = {
  ok: true,
  message: 'If this inbox can sign in, a reset link is on its way.',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }
  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 320) : ''
  if (!isValidEmail(email)) {
    return jsonResponse(req, { error: 'Enter a valid email.' }, 400)
  }

  if (await recentlySent(admin, email)) {
    return jsonResponse(req, GENERIC)
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: PASSWORD_RESET_REDIRECT },
  })
  const tokenHash = data?.properties?.hashed_token || ''
  if (error || !tokenHash) {
    await logEmailEvent(admin, {
      application_id: null,
      kind: 'password_reset',
      recipient: email,
      subject: 'Board Arabia: reset your password',
      status: 'skipped',
      provider: 'gmail',
      detail: 'No recovery link issued.',
    })
    return jsonResponse(req, GENERIC)
  }

  const confirmUrl = `${PASSWORD_RESET_REDIRECT}?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`
  const mail = passwordResetMail(confirmUrl)
  if (/calendar\.app\.google|nammco/i.test(`${mail.subject}\n${mail.text}\n${mail.html}`)) {
    return jsonResponse(req, GENERIC)
  }

  const sent = await sendEmail({
    to: email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  })
  await logEmailEvent(admin, {
    application_id: null,
    kind: 'password_reset',
    recipient: email,
    subject: mail.subject,
    status: sent.status,
    provider: sent.provider,
    provider_id: sent.providerId,
    detail: sent.detail ?? null,
    payload: { mode: 'recovery' },
  })

  return jsonResponse(req, GENERIC)
})

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.includes('\n')
}

async function recentlySent(admin: SupabaseClient, email: string): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await admin
    .from('email_events')
    .select('id', { count: 'exact', head: true })
    .eq('kind', 'password_reset')
    .eq('recipient', email)
    .gte('created_at', since)
  return (count ?? 0) >= 5
}

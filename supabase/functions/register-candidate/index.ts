import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { handleRegister } from '../_shared/candidate_admin.ts'
import { corsHeaders, jsonResponse } from '../_shared/mail.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return jsonResponse(req, { error: 'Registration is not available yet.' }, 503)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON', error_code: 'server' }, 400)
  }

  const remoteIp = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
  const admin = createClient(supabaseUrl, serviceKey)
  const outcome = await handleRegister(admin, body, remoteIp)
  return jsonResponse(req, outcome.body, outcome.status)
})

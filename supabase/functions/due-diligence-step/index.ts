import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/mail.ts'
import { isUuid, MEMBER_MESSAGES } from '../_shared/due_diligence.ts'
import { deferJob, runDueDiligenceStep } from '../due-diligence-start/run.ts'

/**
 * One due diligence step. The previous step calls this immediately.
 * verify_jwt is off. Header x-dd-step must match BA_DD_STEP_SECRET.
 * The handler returns as soon as the step is accepted so the caller
 * does not hold its own wall clock for this step's model time.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)
  if (!stepSecretOk(req.headers.get('x-dd-step'))) {
    return jsonResponse(req, { error: MEMBER_MESSAGES.unauthorized }, 401)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse(req, { error: MEMBER_MESSAGES.missingJob }, 400)
  }
  const jobId = String(body.job_id ?? '')
  if (!isUuid(jobId)) return jsonResponse(req, { error: MEMBER_MESSAGES.missingJob }, 404)

  const admin = createAdmin()
  if (!admin) return jsonResponse(req, { error: MEMBER_MESSAGES.finish }, 500)
  deferJob(runDueDiligenceStep(admin, jobId))
  return jsonResponse(req, { ok: true, accepted: true }, 202)
})

function createAdmin(): SupabaseClient | null {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) return null
  return createClient(supabaseUrl, serviceKey)
}

function stepSecretOk(header: string | null): boolean {
  const secret = Deno.env.get('BA_DD_STEP_SECRET')?.trim() || ''
  const presented = header?.trim() || ''
  if (!secret || !presented || presented.length !== secret.length) return false
  let mismatch = 0
  for (let index = 0; index < secret.length; index += 1) mismatch |= presented.charCodeAt(index) ^ secret.charCodeAt(index)
  return mismatch === 0
}

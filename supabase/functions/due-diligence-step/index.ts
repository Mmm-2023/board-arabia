import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/mail.ts'
import { requireUser } from '../_shared/require_user.ts'
import { isUuid, MEMBER_MESSAGES } from '../_shared/due_diligence.ts'
import { deferJob, runDueDiligenceStep } from '../due-diligence-start/run.ts'

/**
 * One due diligence step. The previous step calls this with the service role
 * already present in the Edge environment. A member poll can call it too.
 * The handler returns as soon as the step is accepted. The step itself runs
 * on this worker's own wall clock.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse(req, { error: MEMBER_MESSAGES.missingJob }, 400)
  }
  const jobId = String(body.job_id ?? '')
  if (!isUuid(jobId)) return jsonResponse(req, { error: MEMBER_MESSAGES.missingJob }, 404)

  const header = req.headers.get('Authorization') || ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  if (isServiceRole(token)) {
    const admin = createAdmin()
    if (!admin) return jsonResponse(req, { error: MEMBER_MESSAGES.finish }, 500)
    deferJob(runDueDiligenceStep(admin, jobId))
    return jsonResponse(req, { ok: true, accepted: true }, 202)
  }

  const session = await requireUser(req)
  if ('error' in session) return jsonResponse(req, { error: MEMBER_MESSAGES.unauthorized }, session.status)
  const owned = await session.admin
    .from('due_diligence_jobs')
    .select('id')
    .eq('id', jobId)
    .eq('member_id', session.user.id)
    .maybeSingle()
  if (owned.error || !owned.data) return jsonResponse(req, { error: MEMBER_MESSAGES.missingJob }, 404)
  deferJob(runDueDiligenceStep(session.admin, jobId))
  return jsonResponse(req, { ok: true, accepted: true }, 202)
})

function createAdmin(): SupabaseClient | null {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) return null
  return createClient(supabaseUrl, serviceKey)
}

function isServiceRole(token: string): boolean {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!key || !token || token.length !== key.length) return false
  let mismatch = 0
  for (let index = 0; index < key.length; index += 1) mismatch |= token.charCodeAt(index) ^ key.charCodeAt(index)
  return mismatch === 0
}

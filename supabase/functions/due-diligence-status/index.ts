import { isLiveMember } from '../_shared/staff_auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/mail.ts'
import { requireUser } from '../_shared/require_user.ts'
import { isUuid, MEMBER_MESSAGES, stageLabel } from '../_shared/due_diligence.ts'
import { advanceDueDiligenceJob, deferJob } from '../due-diligence-start/run.ts'

const ACTIVE = ['reading', 'checking', 'writing']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const session = await requireUser(req)
  if ('error' in session) return jsonResponse(req, { error: MEMBER_MESSAGES.unauthorized }, session.status)

  const member = await session.admin
    .from('members')
    .select('status')
    .eq('user_id', session.user.id)
    .maybeSingle()
  if (member.error || !member.data || !isLiveMember(member.data.status)) {
    return jsonResponse(req, { error: MEMBER_MESSAGES.membersOnly }, 403)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse(req, { error: MEMBER_MESSAGES.missingJob }, 400)
  }
  const jobId = String(body.job_id ?? '')
  if (!isUuid(jobId)) return jsonResponse(req, { error: MEMBER_MESSAGES.missingJob }, 404)

  const loaded = await session.admin
    .from('due_diligence_jobs')
    .select('id, status, progress, error, updated_at')
    .eq('id', jobId)
    .eq('member_id', session.user.id)
    .maybeSingle()
  if (loaded.error || !loaded.data) return jsonResponse(req, { error: MEMBER_MESSAGES.missingJob }, 404)

  let job = loaded.data
  const staleBefore = new Date(Date.now() - 90_000).toISOString()
  if (ACTIVE.includes(job.status) && job.updated_at < staleBefore) {
    await session.admin
      .from('due_diligence_jobs')
      .update({ status: 'queued', progress: 5, error: null })
      .eq('id', job.id)
      .eq('member_id', session.user.id)
      .in('status', ACTIVE)
      .lt('updated_at', staleBefore)
    const again = await session.admin
      .from('due_diligence_jobs')
      .select('id, status, progress, error, updated_at')
      .eq('id', job.id)
      .eq('member_id', session.user.id)
      .maybeSingle()
    if (again.data) job = again.data
  }
  if (job.status === 'queued') {
    deferJob(advanceDueDiligenceJob(session.admin, job.id))
  }

  let reportId: string | null = null
  if (job.status === 'ready') {
    const report = await session.admin
      .from('due_diligence_reports')
      .select('id')
      .eq('job_id', job.id)
      .eq('member_id', session.user.id)
      .maybeSingle()
    reportId = report.data?.id ?? null
  }

  return jsonResponse(req, {
    job: {
      id: job.id,
      status: job.status,
      progress: job.progress,
      stage: stageLabel(job.status),
      error: job.error,
      report_id: reportId,
    },
  })
})

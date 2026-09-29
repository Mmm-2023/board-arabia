import { isLiveMember } from '../_shared/staff_auth.ts'
import { corsHeaders, jsonResponse } from '../_shared/mail.ts'
import { requireUser } from '../_shared/require_user.ts'
import { claimAllowed, isUuid, MEMBER_MESSAGES, modelJobFields, shouldFailStaleJob, stageLabel, stepIsBackingUp } from '../_shared/due_diligence.ts'
import { FALLBACK_MODEL_ID } from '../due-diligence-start/llm.ts'
import { deferJob, runDueDiligenceStep, triggerDueDiligenceStep } from '../due-diligence-start/run.ts'

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
    .select('id, status, progress, error, model_id, pipeline_step, step_claim, pipeline, created_at, updated_at')
    .eq('id', jobId)
    .eq('member_id', session.user.id)
    .maybeSingle()
  if (loaded.error || !loaded.data) return jsonResponse(req, { error: MEMBER_MESSAGES.missingJob }, 404)

  let job = loaded.data
  const pipelineStep = typeof job.pipeline_step === 'string' ? job.pipeline_step : null
  const stepClaim = typeof job.step_claim === 'string' ? job.step_claim : null
  if (
    shouldFailStaleJob({
      status: job.status,
      updatedAt: String(job.updated_at || ''),
      createdAt: String(job.created_at || ''),
      nowMs: Date.now(),
      pipelineStep,
      stepClaim,
    })
  ) {
    const knownModel = typeof job.model_id === 'string' && job.model_id.trim() ? job.model_id.trim() : FALLBACK_MODEL_ID
    const failed = modelJobFields({ modelId: knownModel, skipReason: 'stale_worker' })
    await session.admin
      .from('due_diligence_jobs')
      .update({
        status: 'failed',
        error: MEMBER_MESSAGES.timedOut,
        step_claim: null,
        model_id: failed.model_id,
        model_skip_reason: failed.model_skip_reason,
      })
      .eq('id', job.id)
      .eq('member_id', session.user.id)
      .in('status', ['queued', 'reading', 'checking', 'writing'])
    job = {
      ...job,
      status: 'failed',
      error: MEMBER_MESSAGES.timedOut,
    }
  }
  if (claimAllowed({ status: job.status, pipelineStep: pipelineStep || 'extract', stepClaim })) {
    deferJob((async () => {
      const kicked = await triggerDueDiligenceStep(job.id)
      if (!kicked) await runDueDiligenceStep(session.admin, job.id)
    })())
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
      stage: stageLabel(job.status, job.progress, stepIsBackingUp(pipelineStep || '', recordPipeline(job.pipeline))),
      error: job.error,
      report_id: reportId,
    },
  })
})

function recordPipeline(raw: unknown): { scores_mode?: string; narrative_mode?: string; compose_mode?: string } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  return {
    scores_mode: typeof row.scores_mode === 'string' ? row.scores_mode : undefined,
    narrative_mode: typeof row.narrative_mode === 'string' ? row.narrative_mode : undefined,
    compose_mode: typeof row.compose_mode === 'string' ? row.compose_mode : undefined,
  }
}

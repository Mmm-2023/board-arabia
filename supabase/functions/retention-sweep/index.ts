import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse, sendEmail } from '../_shared/mail.ts'
import { emailLink, idleAccountReminderMail } from '../_shared/membership_copy.ts'
import { retentionDaysOrDefault } from '../_shared/ai_tools.ts'
import {
  ddDeckPathOk,
  orphanPurgeEnabled,
  planStorageOrphans,
  purgeStoragePaths,
  type StorageOrphan,
} from '../_shared/retention_storage.ts'

type Plan = {
  unverified?: string[]
  never_submitted?: string[]
  decided?: string[]
  applications?: string[]
  members?: string[]
  invites?: string[]
  reminders?: string[]
  consent?: string[]
  events?: number
  cache?: number
  invites_returned?: number
  ai_tool_jobs?: string[]
  ai_tool_files?: string[]
  ai_tool_retention_days?: number
  dd_decks?: string[]
  dd_jobs?: string[]
  dd_reports?: string[]
  dd_files?: string[]
  staff_access_log?: string[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)
  if (!authorized(req)) return jsonResponse(req, { error: 'Unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) return jsonResponse(req, { error: 'Not configured' }, 503)
  const admin = createClient(supabaseUrl, serviceKey)
  // A plain POST has no dry_run=1, so dry is false and retention_sweep_plan runs with p_apply true.
  // That is the normal retention sweep, not a dry run. Orphans are listed unless orphanPurgeEnabled is true.
  const dry = new URL(req.url).searchParams.get('dry_run') === '1'
  const purgeOrphans = orphanPurgeEnabled(req.url)

  const { data, error } = await admin.rpc('retention_sweep_plan', { p_apply: !dry })
  if (error || !data || typeof data !== 'object') {
    return jsonResponse(req, { error: 'Retention sweep failed.' }, 500)
  }
  const plan = data as Plan
  const reminders = arrayOf(plan.reminders)
  let remindersSent = 0
  let reminderFailed = false
  if (!dry) {
    for (const userId of reminders) {
      const sent = await sendReminder(admin, userId)
      if (sent === 'sent') remindersSent += 1
      if (sent === 'failed') reminderFailed = true
    }
  }

  const posthog = dry ? { sent: 0, pending: 0, failed: false } : await flushPosthog(admin)
  const aiFiles = dry ? { removed: 0, failed: false } : await purgeAiToolFiles(admin, arrayOf(plan.ai_tool_files))
  const ddFiles = dry
    ? { removed: 0, failed: false, removedPaths: [] as string[] }
    : await purgeDueDiligenceFiles(admin, arrayOf(plan.dd_files))
  const orphans = await runOrphanPass(admin, {
    retentionDays: retentionDaysOrDefault(plan.ai_tool_retention_days),
    purge: purgeOrphans,
  })
  const counts = {
    unverified_7d: arrayOf(plan.unverified).length,
    never_submitted_120d: arrayOf(plan.never_submitted).length,
    decided_12m: arrayOf(plan.decided).length,
    applications_12m: arrayOf(plan.applications).length,
    members_24m: arrayOf(plan.members).length,
    invites_returned: dry ? arrayOf(plan.invites).length : Number(plan.invites_returned || 0),
    reminders_due: reminders.length,
    reminders_sent: remindersSent,
    consent_13m: arrayOf(plan.consent).length,
    candidate_events: Number(plan.events || 0),
    cache_24h: Number(plan.cache || 0),
    posthog_sent: posthog.sent,
    posthog_pending: posthog.pending,
    ai_tool_jobs: arrayOf(plan.ai_tool_jobs).length,
    ai_tool_files: dry ? arrayOf(plan.ai_tool_files).length : aiFiles.removed,
    dd_decks: arrayOf(plan.dd_decks).length,
    dd_jobs: arrayOf(plan.dd_jobs).length,
    dd_reports: arrayOf(plan.dd_reports).length,
    dd_files: dry ? arrayOf(plan.dd_files).length : ddFiles.removed,
    staff_access_13m: arrayOf(plan.staff_access_log).length,
  }

  await admin.from('retention_runs').insert({ dry_run: dry, counts })

  const body: Record<string, unknown> = { ok: true, dry_run: dry, counts, orphans: orphans.body }
  if (dry) {
    body.rows = {
      unverified: arrayOf(plan.unverified),
      never_submitted: arrayOf(plan.never_submitted),
      decided: arrayOf(plan.decided),
      applications: arrayOf(plan.applications),
      members: arrayOf(plan.members),
      invites: arrayOf(plan.invites),
      reminders: reminders,
      consent: arrayOf(plan.consent),
      ai_tool_jobs: arrayOf(plan.ai_tool_jobs),
      ai_tool_files: arrayOf(plan.ai_tool_files),
      dd_decks: arrayOf(plan.dd_decks),
      dd_jobs: arrayOf(plan.dd_jobs),
      dd_reports: arrayOf(plan.dd_reports),
      dd_files: arrayOf(plan.dd_files),
      staff_access_log: arrayOf(plan.staff_access_log),
    }
  }
  if (reminderFailed || posthog.failed || aiFiles.failed || ddFiles.failed || orphans.failed) {
    return jsonResponse(req, body, 500)
  }
  return jsonResponse(req, body)
})

function arrayOf(value: unknown) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

async function sendReminder(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<'sent' | 'failed' | 'skip'> {
  const { data } = await admin.from('candidates').select('email, retention_reminded_at').eq('user_id', userId).maybeSingle()
  if (!data?.email || data.retention_reminded_at) return 'skip'
  const mail = idleAccountReminderMail({
    dashboardUrl: emailLink('/dashboard/membership', 'account-reminder'),
  })
  if (/calendar\.app\.google|nammco/i.test(`${mail.subject}\n${mail.text}`)) return 'failed'
  const sent = await sendEmail({ to: String(data.email), subject: mail.subject, html: mail.html, text: mail.text })
  if (sent.status === 'error') return 'failed'
  const { error } = await admin
    .from('candidates')
    .update({ retention_reminded_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('retention_reminded_at', null)
  if (error) return 'failed'
  return 'sent'
}

async function flushPosthog(admin: ReturnType<typeof createClient>) {
  const key = Deno.env.get('POSTHOG_PROJECT_API_KEY')?.trim() || ''
  const host = (Deno.env.get('POSTHOG_HOST')?.trim() || 'https://eu.posthog.com').replace(/\/$/, '')
  const { data } = await admin.from('retention_posthog_queue').select('analytics_id').limit(200)
  const ids = (data || []).map((row) => String(row.analytics_id || '')).filter(Boolean)
  if (!key) return { sent: 0, pending: ids.length, failed: false }
  let sent = 0
  let failed = false
  for (const id of ids) {
    try {
      const res = await fetch(`${host}/capture/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: key,
          event: '$delete_person',
          distinct_id: id,
          properties: { distinct_id: id },
        }),
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) {
        failed = true
        continue
      }
      const { error } = await admin.from('retention_posthog_queue').delete().eq('analytics_id', id)
      if (error) failed = true
      else sent += 1
    } catch {
      failed = true
    }
  }
  return { sent, pending: ids.length - sent, failed }
}

/**
 * Redeploy retention-sweep after the AI tools migration.
 * Files are removed with the Storage API. SQL does not delete storage.objects.
 */
async function purgeAiToolFiles(
  admin: ReturnType<typeof createClient>,
  paths: string[],
): Promise<{ removed: number; failed: boolean }> {
  let removed = 0
  let failed = false
  for (const path of paths) {
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/source\.(pdf|txt|csv|xlsx|docx)$/i.test(path) || path.includes('..')) {
      failed = true
      continue
    }
    const { error } = await admin.storage.from('ai-tool-uploads').remove([path])
    if (error) {
      failed = true
      continue
    }
    const cleared = await admin.from('ai_tool_file_purge').delete().eq('storage_path', path)
    if (cleared.error) failed = true
    else removed += 1
  }
  return { removed, failed }
}

/** Redeploy retention-sweep with this migration. Deck files leave the due-diligence-decks bucket. */
async function purgeDueDiligenceFiles(
  admin: ReturnType<typeof createClient>,
  paths: string[],
): Promise<{ removed: number; failed: boolean; removedPaths: string[] }> {
  return purgeStoragePaths(
    async (path) => {
      const { error } = await admin.storage.from('due-diligence-decks').remove([path])
      return !error
    },
    async (path) => {
      const cleared = await admin.from('due_diligence_file_purge').delete().eq('storage_path', path)
      return !cleared.error
    },
    paths,
    ddDeckPathOk,
  )
}

/**
 * Orphan storage pass.
 * A plain POST runs the normal retention sweep and only lists orphans.
 * Deletion runs only when purge_orphans=1 is present and dry_run is absent.
 * dry_run=1 lists the retention plan and lists orphans. It does not apply the plan,
 * and it does not delete orphans even when purge_orphans=1 is also present.
 * The age gate stays in planStorageOrphans. Files that are not older than retention_days stay.
 * Counts and paths go to the function log and the JSON response.
 */
async function runOrphanPass(
  admin: ReturnType<typeof createClient>,
  input: { retentionDays: number; purge: boolean },
): Promise<{ failed: boolean; body: Record<string, unknown> }> {
  try {
    const objects = [
      ...(await listBucketObjects(admin, 'ai-tool-uploads')),
      ...(await listBucketObjects(admin, 'due-diligence-decks')),
    ]
    const ownedPaths = [
      ...(await loadStoragePaths(admin, 'ai_tool_jobs')).map((path) => ({ bucket: 'ai-tool-uploads', path })),
      ...(await loadStoragePaths(admin, 'due_diligence_decks')).map((path) => ({
        bucket: 'due-diligence-decks',
        path,
      })),
    ]
    const planned = planStorageOrphans({
      objects,
      ownedPaths,
      retentionDays: input.retentionDays,
      now: new Date(),
      purge: input.purge,
    })
    console.log(JSON.stringify({
      orphans_listed_only: !input.purge,
      orphan_count: planned.report.length,
      orphan_paths: planned.report,
    }))
    let removed = 0
    let failed = false
    if (input.purge) {
      for (const item of planned.remove) {
        const gone = await admin.storage.from(item.bucket).remove([item.path])
        if (gone.error) {
          failed = true
          continue
        }
        const queue = item.bucket === 'ai-tool-uploads' ? 'ai_tool_file_purge' : 'due_diligence_file_purge'
        const cleared = await admin.from(queue).delete().eq('storage_path', item.path)
        if (cleared.error) failed = true
        else removed += 1
      }
    }
    return {
      failed,
      body: {
        listed_only: !input.purge,
        retention_days: input.retentionDays,
        counts: orphanCounts(planned.report),
        paths: planned.report,
        removed,
      },
    }
  } catch {
    return { failed: true, body: { listed_only: !input.purge, error: 'Could not list storage.' } }
  }
}

function orphanCounts(rows: StorageOrphan[]) {
  return {
    'ai-tool-uploads': rows.filter((item) => item.bucket === 'ai-tool-uploads').length,
    'due-diligence-decks': rows.filter((item) => item.bucket === 'due-diligence-decks').length,
  }
}

async function loadStoragePaths(admin: ReturnType<typeof createClient>, table: string): Promise<string[]> {
  const paths: string[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select('storage_path').range(from, from + 999)
    if (error) throw new Error('owned paths failed')
    const rows = data ?? []
    for (const row of rows) {
      const path = row.storage_path
      if (typeof path === 'string' && path) paths.push(path)
    }
    if (rows.length < 1000) break
  }
  return paths
}

async function listBucketObjects(
  admin: ReturnType<typeof createClient>,
  bucket: string,
): Promise<{ bucket: string; path: string; createdAt: string | null }[]> {
  return listPrefix(admin, bucket, '', 0)
}

async function listPrefix(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
  depth: number,
): Promise<{ bucket: string; path: string; createdAt: string | null }[]> {
  if (depth > 4) return []
  const out: { bucket: string; path: string; createdAt: string | null }[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw new Error('list failed')
    const rows = data ?? []
    for (const row of rows) {
      const name = String(row.name || '')
      if (!name || name === '.' || name === '..' || name.includes('..')) continue
      const path = prefix ? `${prefix}/${name}` : name
      if (row.id == null) {
        out.push(...(await listPrefix(admin, bucket, path, depth + 1)))
      } else {
        out.push({ bucket, path, createdAt: row.created_at ?? null })
      }
    }
    if (rows.length < 1000) break
  }
  return out
}

function authorized(req: Request) {
  const secret = Deno.env.get('RETENTION_SWEEP_SECRET')?.trim() || ''
  const header = req.headers.get('x-retention-sweep')?.trim() || ''
  if (!secret || !header || secret.length !== header.length) return false
  let diff = 0
  for (let index = 0; index < secret.length; index += 1) {
    diff |= secret.charCodeAt(index) ^ header.charCodeAt(index)
  }
  return diff === 0
}

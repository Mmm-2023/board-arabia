import { corsHeaders, jsonResponse, sendEmail } from '../_shared/mail.ts'
import { requireUser } from '../_shared/require_user.ts'
import { handleDeleteAccount } from './handle.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const gate = await requireUser(req)
  if ('error' in gate) return jsonResponse(req, { error: gate.error }, gate.status)
  const { user, admin } = gate

  let body: unknown = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const outcome = await handleDeleteAccount({
    userId: user.id,
    email: typeof user.email === 'string' ? user.email : null,
    body,
    now: () => Date.now(),
    pepper: Deno.env.get('CANDIDATE_CODE_PEPPER')?.trim() || '',
    issueCode: async (userId, codeHash, expiresAt) => {
      const { data, error } = await admin.rpc('issue_account_delete_code', {
        p_user_id: userId,
        p_code_hash: codeHash,
        p_expires_at: expiresAt,
      })
      if (error || typeof data !== 'string') return 'error'
      return data
    },
    voidCode: async (userId) => {
      await admin.rpc('void_account_delete_code', { p_user_id: userId })
    },
    confirmDelete: async (userId, codeHash) => {
      const { data, error } = await admin.rpc('confirm_account_delete', {
        p_user_id: userId,
        p_code_hash: codeHash,
      })
      if (error || !data || typeof data !== 'object') return null
      return data as Record<string, unknown>
    },
    sendMail: async (message) => {
      const sent = await sendEmail(message)
      return { ok: sent.status === 'sent' || sent.status === 'dry_run' }
    },
    removeAvatar: async (path) => {
      await admin.storage.from('member-avatars').remove([path])
    },
    deleteAnalytics: async (analyticsId) => {
      const removed = await deletePosthogPerson(analyticsId)
      if (removed) await admin.from('retention_posthog_queue').delete().eq('analytics_id', analyticsId)
    },
  })

  return jsonResponse(req, outcome.body, outcome.status)
})

async function deletePosthogPerson(analyticsId: string) {
  const key = Deno.env.get('POSTHOG_PROJECT_API_KEY')?.trim() || ''
  if (!key) return false
  const host = (Deno.env.get('POSTHOG_HOST')?.trim() || 'https://eu.posthog.com').replace(/\/$/, '')
  try {
    const res = await fetch(`${host}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        event: '$delete_person',
        distinct_id: analyticsId,
        properties: { distinct_id: analyticsId },
      }),
      signal: AbortSignal.timeout(10000),
    })
    return res.ok
  } catch {
    return false
  }
}

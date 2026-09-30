import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { isUuid } from '../_shared/ai_tools.ts'
import { createAiToolStore, type AiToolAdmin } from './db.ts'
import { handleAiToolJob, type AiAuth } from './handle.ts'

function createAdmin(): AiToolAdmin | null {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) return null
  return createClient(supabaseUrl, serviceKey) as unknown as AiToolAdmin
}

Deno.serve((req) =>
  handleAiToolJob(req, {
    resolveUser: async () => resolveAiToolUser(req.headers.get('Authorization')),
    store: () => {
      const admin = createAdmin()
      return admin ? createAiToolStore(admin) : null
    },
    now: () => new Date(),
  }),
)

function resolveAiToolUser(authorization: string | null): AiAuth {
  const token = authorization?.replace(/^Bearer\s+/i, '').trim() || ''
  const payload = decodePayload(token)
  const userId = typeof payload?.sub === 'string' && isUuid(payload.sub) ? payload.sub : ''
  const expOk = typeof payload?.exp === 'number' && payload.exp * 1000 + 30_000 > Date.now()
  if (!payload || !userId || payload.role !== 'authenticated' || !expOk) {
    return { ok: false, status: 401, error: 'Sign in to run this check.', code: 'unauthorized' }
  }
  return { ok: true, userId }
}

function decodePayload(token: string): { sub?: unknown; exp?: unknown; role?: unknown } | null {
  const parts = token.split('.')
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) return null
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
    const payload = JSON.parse(json) as { sub?: unknown; exp?: unknown; role?: unknown }
    return payload && typeof payload === 'object' ? payload : null
  } catch {
    return null
  }
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/mail.ts'
import { acceptConsent, hashClientBucket, type ConsentInsert } from './handle.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) })
  }
  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return jsonResponse(req, { error: 'Choice could not be saved.' }, 400)
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonResponse(req, { error: 'Choice could not be saved.' }, 400)
  }

  const header = req.headers.get('Authorization') || ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  const admin = createClient(supabaseUrl, serviceKey)
  const userId = await optionalUserId(supabaseUrl, anonKey, token)
  const forwarded = (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || ''
  const bucket = await hashClientBucket(forwarded)

  const result = await acceptConsent(raw, {
    now: () => Date.now(),
    bucket,
    userId,
    countForConsent: (consentId, sinceIso) => countRows(admin, { consentId, sinceIso }),
    countGlobal: (sinceIso) => countRows(admin, { sinceIso }),
    insert: (row) => insertRow(admin, row),
  })
  return jsonResponse(req, result.body, result.status)
})

async function optionalUserId(supabaseUrl: string, anonKey: string, token: string): Promise<string | null> {
  if (!token) return null
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data, error } = await userClient.auth.getUser(token)
  if (error || !data.user) return null
  if (data.user.role === 'anon') return null
  return data.user.id
}

async function countRows(
  // deno-lint-ignore no-explicit-any
  admin: any,
  filter: { consentId?: string; sinceIso: string },
): Promise<number> {
  let query = admin.from('consent_log').select('id', { count: 'exact', head: true }).gte('created_at', filter.sinceIso)
  if (filter.consentId) query = query.eq('consent_id', filter.consentId)
  const { count } = await query
  return count ?? 0
}

async function insertRow(
  // deno-lint-ignore no-explicit-any
  admin: any,
  row: ConsentInsert,
): Promise<boolean> {
  const { error } = await admin.from('consent_log').insert({
    consent_id: row.consent_id,
    choice: row.choice,
    banner_version: row.banner_version,
    notice_version: row.notice_version,
    language: row.language,
    user_id: row.user_id,
  })
  return !error
}

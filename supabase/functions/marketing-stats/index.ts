import { requireStaff } from '../_shared/require_staff.ts'
import { corsHeaders, jsonResponse } from '../_shared/mail.ts'
import {
  CACHE_MS,
  CACHE_RETENTION_MS,
  cacheKey,
  errorBody,
  hogqlBundle,
  liveDecision,
  notLiveBody,
  parseStatsRequest,
  personalKeyOk,
  projectIdOk,
  queryUrl,
  responseIsAggregate,
  shapeStats,
} from './handle.ts'

type EnvSource = { get?: (key: string) => string | undefined }

function readEnv(name: string) {
  const runtime = globalThis as { Deno?: { env?: EnvSource } }
  return runtime.Deno?.env?.get?.(name) ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const gate = await requireStaff(req, (body, status) => jsonResponse(req, body, status))
  if (gate instanceof Response) return gate

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonResponse(req, { error: 'Could not read the range.' }, 400)
  }

  const parsed = parseStatsRequest(raw, new Date())
  if (!parsed.ok) return jsonResponse(req, { error: parsed.error }, 400)

  const env = {
    enabled: readEnv('ANALYTICS_ENABLED'),
    personalKey: readEnv('POSTHOG_PERSONAL_API_KEY'),
    projectId: readEnv('POSTHOG_PROJECT_ID'),
  }
  if (liveDecision(env) !== 'live' || !personalKeyOk(env.personalKey) || !projectIdOk(env.projectId)) {
    return jsonResponse(req, notLiveBody(), 200)
  }

  const key = cacheKey(parsed.value)
  const cached = await readCache(gate.admin, key)
  if (cached && Date.parse(cached.expires_at) > Date.now() && responseIsAggregate(cached.payload)) {
    return jsonResponse(req, { ...cached.payload, cached: true }, 200)
  }

  try {
    const bundle = hogqlBundle(parsed.value)
    const results: Record<string, unknown> = {}
    for (const [name, hogql] of Object.entries(bundle)) {
      results[name] = await postHog(env.projectId as string, env.personalKey as string, hogql)
    }
    const body = shapeStats(results, new Date().toISOString())
    if (!responseIsAggregate(body)) {
      return jsonResponse(req, errorBody(cached?.created_at ?? null), 200)
    }
    await writeCache(gate.admin, key, body)
    await purgeOld(gate.admin)
    return jsonResponse(req, body, 200)
  } catch {
    return jsonResponse(req, errorBody(cached?.created_at ?? null), 200)
  }
})

async function postHog(projectId: string, key: string, hogql: string) {
  const response = await fetch(queryUrl(projectId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: hogql } }),
  })
  if (!response.ok) throw new Error('analytics query failed')
  return response.json()
}

type CacheRow = { payload: Record<string, unknown>; created_at: string; expires_at: string }

async function readCache(
  // deno-lint-ignore no-explicit-any
  admin: any,
  key: string,
): Promise<CacheRow | null> {
  const { data, error } = await admin
    .from('marketing_stats_cache')
    .select('payload, created_at, expires_at')
    .eq('cache_key', key)
    .maybeSingle()
  if (error || !data?.payload) return null
  return data as CacheRow
}

async function writeCache(
  // deno-lint-ignore no-explicit-any
  admin: any,
  key: string,
  payload: Record<string, unknown>,
) {
  const now = Date.now()
  await admin.from('marketing_stats_cache').upsert({
    cache_key: key,
    payload,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + CACHE_MS).toISOString(),
  })
}

async function purgeOld(
  // deno-lint-ignore no-explicit-any
  admin: any,
) {
  const cutoff = new Date(Date.now() - CACHE_RETENTION_MS).toISOString()
  await admin.from('marketing_stats_cache').delete().lt('created_at', cutoff)
}

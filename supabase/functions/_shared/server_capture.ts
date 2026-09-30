/**
 * Server event for approval. Sends only when consent stored an analytics id
 * and the edge flag ANALYTICS_ENABLED is the exact string true.
 * The project key is POSTHOG_PROJECT_API_KEY. It is never written to the repo.
 */

const EU_HOSTS = new Set(['https://eu.i.posthog.com', 'https://eu.posthog.com'])

export type CaptureEnv = {
  enabled?: string | null
  key?: string | null
  host?: string | null
}

export type ApprovedCapture = {
  analyticsId: string | null
  tier: 'founding' | 'member'
  seat: 'ksa' | 'intl'
  daysSinceRequest: number
}

export async function captureApproved(
  env: CaptureEnv,
  input: ApprovedCapture,
  post: (url: string, body: string, key: string) => Promise<boolean>,
): Promise<'sent' | 'skipped'> {
  const id = (input.analyticsId || '').trim()
  if (!id || id.includes('@') || id.length > 100) return 'skipped'
  if (env.enabled?.trim() !== 'true') return 'skipped'
  const key = env.key?.trim() || ''
  if (!/^phc_[A-Za-z0-9]{10,}$/.test(key)) return 'skipped'
  const host = EU_HOSTS.has(env.host?.trim() || '') ? env.host!.trim() : 'https://eu.i.posthog.com'
  const body = JSON.stringify({
    api_key: key,
    event: 'approved',
    distinct_id: id,
    properties: {
      tier: input.tier,
      seat_side: input.seat,
      days_since_request: Math.max(0, Math.round(input.daysSinceRequest)),
    },
  })
  const ok = await post(`${host}/capture/`, body, key)
  return ok ? 'sent' : 'skipped'
}

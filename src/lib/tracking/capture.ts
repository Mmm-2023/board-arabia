import { sanitizeProperties } from './allowlist.ts'
import {
  planCapture,
  posthogCaptureUrl,
  posthogScriptUrl,
  type AnalyticsConfig,
  type CaptureContext,
  type CapturePlan,
} from './decide.ts'

export type CaptureDeps = {
  randomId: () => string
  nowIso: () => string
  fetch: (url: string, body: string) => Promise<void>
  loadScript: (url: string) => void
  readAnalyticsId: () => string | null
  captureIdentified: (
    event: string,
    distinctId: string,
    properties: Record<string, string | number | boolean>,
  ) => void
}

export function buildAnonymousPayload(input: {
  apiKey: string
  event: string
  distinctId: string
  properties: Record<string, string | number | boolean>
  timestamp: string
}) {
  return {
    api_key: input.apiKey,
    event: input.event,
    distinct_id: input.distinctId,
    timestamp: input.timestamp,
    properties: {
      ...input.properties,
      distinct_id: input.distinctId,
      $process_person_profile: false as const,
    },
  }
}

export async function runCapture(
  event: string,
  properties: unknown,
  config: AnalyticsConfig,
  ctx: CaptureContext,
  deps: CaptureDeps,
): Promise<CapturePlan> {
  const plan = planCapture(config, ctx, event)
  if (plan.kind === 'skip') return plan
  const clean = sanitizeProperties(properties)
  if (plan.kind === 'anonymous') {
    const distinctId = deps.randomId()
    const body = buildAnonymousPayload({
      apiKey: config.posthogKey || '',
      event,
      distinctId,
      properties: clean,
      timestamp: deps.nowIso(),
    })
    await deps.fetch(posthogCaptureUrl(config.posthogHost), JSON.stringify(body))
    return plan
  }
  deps.loadScript(posthogScriptUrl(config.posthogHost))
  const distinctId = deps.readAnalyticsId() || deps.randomId()
  deps.captureIdentified(event, distinctId, clean)
  return plan
}

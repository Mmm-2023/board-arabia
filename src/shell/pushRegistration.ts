import { classifyIncomingUrl, type IncomingLink } from './incomingLink.ts'

export const PUSH_REGISTRATION_FAILED = 'ba-push-registration-failed'

/** Ask the operating system only after the member turns the control on. */
export function shouldAskPushPermission(native: boolean, turningOn: boolean): boolean {
  return native === true && turningOn === true
}

/** The control is native only. The website does not show it. */
export function showPushSetting(native: boolean): boolean {
  return native === true
}

/** The capture route exists only inside the native shell. */
export function pushShotAllowed(native: boolean): boolean {
  return native === true
}

export function pushPlatform(platform: string): 'ios' | 'android' | null {
  const value = platform.trim().toLowerCase()
  if (value === 'ios' || value === 'android') return value
  return null
}

/** A missing row and any other payload mean the channel stays off. */
export function pushEnabledFromPreference(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  return (data as { push_enabled?: unknown }).push_enabled === true
}

/**
 * A bare site path becomes a Board Arabia https URL so the deep link helper can classify it.
 * Other strings are passed through unchanged.
 */
export function normalizePushTarget(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return `https://boardarabia.com${trimmed}`
  return trimmed
}

/** Read a url or link field and classify it with the APP-2 incoming link helper. */
export function routeFromPushPayload(data: unknown): IncomingLink {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { kind: 'ignore' }
  const row = data as Record<string, unknown>
  for (const key of ['url', 'link']) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return classifyIncomingUrl(normalizePushTarget(value))
  }
  return { kind: 'ignore' }
}

export function routeFromPushAction(
  action: { notification?: { data?: unknown; link?: unknown } } | null | undefined,
): IncomingLink {
  if (!action?.notification) return { kind: 'ignore' }
  const fromData = routeFromPushPayload(action.notification.data)
  if (fromData.kind !== 'ignore') return fromData
  if (typeof action.notification.link === 'string' && action.notification.link.trim()) {
    return classifyIncomingUrl(normalizePushTarget(action.notification.link))
  }
  return { kind: 'ignore' }
}

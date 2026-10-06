/** Build-time gates. Only the exact string true turns capture on. */
export function analyticsEnabled(flag: unknown): boolean {
  return flag === 'true'
}

/** anonymous_counts is the default. none sends nothing until Accept. */
export function preconsentMode(flag: unknown): 'anonymous_counts' | 'none' {
  return flag === 'none' ? 'none' : 'anonymous_counts'
}

const EU_HOSTS = new Set(['https://eu.i.posthog.com', 'https://eu.posthog.com'])

export function posthogHost(flag: unknown): string {
  if (typeof flag === 'string' && EU_HOSTS.has(flag.trim())) return flag.trim()
  return 'https://eu.i.posthog.com'
}

/** Live project keys only. Placeholders never leave the browser. */
export function posthogKey(flag: unknown): string | null {
  if (typeof flag !== 'string') return null
  const key = flag.trim()
  if (!/^phc_[A-Za-z0-9]{10,}$/.test(key)) return null
  if (/placeholder/i.test(key)) return null
  return key
}

export function readAnalyticsConfig(env: Record<string, unknown> | undefined) {
  return {
    enabled: analyticsEnabled(env?.VITE_ANALYTICS_ENABLED),
    preconsentMode: preconsentMode(env?.VITE_ANALYTICS_PRECONSENT_MODE),
    posthogKey: posthogKey(env?.VITE_POSTHOG_KEY),
    posthogHost: posthogHost(env?.VITE_POSTHOG_HOST),
  }
}

function viteValue(read: () => unknown): unknown {
  try {
    return read()
  } catch {
    return undefined
  }
}

function analyticsEnv(): Record<string, unknown> | undefined {
  if (typeof import.meta === 'undefined') return undefined
  return {
    VITE_ANALYTICS_ENABLED: viteValue(() => import.meta.env.VITE_ANALYTICS_ENABLED),
    VITE_ANALYTICS_PRECONSENT_MODE: viteValue(() => import.meta.env.VITE_ANALYTICS_PRECONSENT_MODE),
    VITE_POSTHOG_KEY: viteValue(() => import.meta.env.VITE_POSTHOG_KEY),
    VITE_POSTHOG_HOST: viteValue(() => import.meta.env.VITE_POSTHOG_HOST),
  }
}

export const ANALYTICS_CONFIG = readAnalyticsConfig(analyticsEnv())

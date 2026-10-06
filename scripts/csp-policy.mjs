/**
 * Content-Security-Policy for GitHub Pages.
 *
 * Pages cannot send headers. A meta tag cannot be report-only and cannot
 * carry frame-ancestors, so those two limits are accepted. The CI crawl
 * serves the same policy as a Content-Security-Policy-Report-Only header
 * and requires zero violations before this meta tag is treated as proof.
 *
 * PostHog: the host is added to script-src and connect-src only when the
 * build has analytics enabled (VITE_ANALYTICS_ENABLED === 'true'). The host
 * comes from VITE_POSTHOG_HOST. When that host is https://eu.i.posthog.com,
 * script-src also includes https://eu-assets.i.posthog.com, because that is
 * where the app loads the PostHog script (see posthogScriptUrl in
 * src/lib/tracking/decide.ts). The Pages build sets analytics off, so the
 * shipped policy omits PostHog entirely. Hashes are never written by hand:
 * stamp-csp.mjs hashes every inline script in dist.
 */
import { createHash } from 'node:crypto'

const TURNSTILE = 'https://challenges.cloudflare.com'
const POSTHOG_ASSET_HOST = 'https://eu-assets.i.posthog.com'
const POSTHOG_INGEST_HOST = 'https://eu.i.posthog.com'

export function analyticsEnabled(flag) {
  return flag === 'true'
}

export function supabaseConnectSources(supabaseUrl) {
  let url
  try {
    url = new URL(String(supabaseUrl || ''))
  } catch {
    throw new Error('VITE_SUPABASE_URL is missing or not a URL')
  }
  if (url.protocol !== 'https:') throw new Error('VITE_SUPABASE_URL must be https')
  return { https: `https://${url.host}`, wss: `wss://${url.host}` }
}

/**
 * Origins derived from VITE_POSTHOG_HOST. Empty when analytics is off.
 * script includes the asset host the app actually loads. connect includes
 * the configured host (capture) and the asset host.
 */
export function posthogSources(enabled, host) {
  if (!enabled) return { script: [], connect: [] }
  const trimmed = String(host || '').trim().replace(/\/$/, '') || POSTHOG_INGEST_HOST
  const script = new Set([trimmed])
  const connect = new Set([trimmed])
  if (trimmed === POSTHOG_INGEST_HOST) {
    script.add(POSTHOG_ASSET_HOST)
    connect.add(POSTHOG_ASSET_HOST)
  }
  return { script: [...script], connect: [...connect] }
}

export function scriptHash(source) {
  return createHash('sha256').update(source, 'utf8').digest('base64')
}

/** Classic inline scripts only. JSON-LD and external scripts are skipped. */
export function inlineScriptBodies(html) {
  const bodies = []
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  for (const match of String(html).matchAll(re)) {
    const attrs = match[1] || ''
    const body = match[2]
    if (/\bsrc\s*=/i.test(attrs)) continue
    const type = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() || ''
    if (type && type !== 'text/javascript' && type !== 'application/javascript') continue
    if (!body.trim()) continue
    bodies.push(body)
  }
  return bodies
}

export function contentSecurityPolicy({
  supabaseUrl,
  analyticsFlag,
  posthogHost,
  scriptHashes = [],
}) {
  const supabase = supabaseConnectSources(supabaseUrl)
  const posthog = posthogSources(analyticsEnabled(analyticsFlag), posthogHost)
  const hashes = [...new Set(scriptHashes.filter(Boolean))].sort()
  const scriptSrc = ["'self'", ...hashes.map((hash) => `'sha256-${hash}'`), TURNSTILE, ...posthog.script]
  const connectSrc = ["'self'", supabase.https, supabase.wss, TURNSTILE, ...posthog.connect]
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabase.https}`,
    "font-src 'self'",
    `connect-src ${connectSrc.join(' ')}`,
    `frame-src ${TURNSTILE}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ]
  const policy = directives.join('; ')
  if (policy.includes('unsafe-inline') && /script-src[^;]*unsafe-inline/.test(policy)) {
    throw new Error('script-src must not allow unsafe-inline')
  }
  if (/frame-ancestors|report-only/i.test(policy)) {
    throw new Error('meta CSP cannot carry frame-ancestors or report-only')
  }
  return policy
}

const CSP_META = /<meta http-equiv="Content-Security-Policy" content="[^"]*"\s*\/?>/i
const REFERRER_META = /<meta name="referrer" content="strict-origin-when-cross-origin"\s*\/?>/i

export function stampHtml(html, policy) {
  const csp = `<meta http-equiv="Content-Security-Policy" content="${policy}" />`
  const referrer = `<meta name="referrer" content="strict-origin-when-cross-origin" />`
  let next = String(html)
  if (CSP_META.test(next)) next = next.replace(CSP_META, csp)
  else if (next.includes('<head>')) next = next.replace('<head>', `<head>\n    ${csp}`)
  else throw new Error('HTML has no head for the CSP meta tag')
  if (!REFERRER_META.test(next)) {
    next = next.replace('<head>', `<head>\n    ${referrer}`)
  }
  return next
}

export function readCspMeta(html) {
  const match = String(html).match(/http-equiv="Content-Security-Policy" content="([^"]*)"/i)
  return match?.[1] || ''
}

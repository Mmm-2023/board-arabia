/** Re-export shared Workspace mail helpers. Booking link stays in this function only. */

export {
  adminNotifyEmail,
  corsHeaders,
  jsonResponse,
  logEmailEvent,
  publicSite,
  sendEmail,
} from '../_shared/mail.ts'

type EnvSource = {
  get?: (key: string) => string | undefined
}

function readEnv(name: string): string | undefined {
  const runtime = globalThis as { Deno?: { env?: EnvSource } }
  const fromDeno = runtime.Deno?.env?.get?.(name)
  if (fromDeno) return fromDeno
  const fromNode = typeof process !== 'undefined' ? process.env?.[name] : undefined
  return fromNode || undefined
}

/** Private booking link from PRIVATE_BOOKING_LINK. Emailed on Accept only. No source fallback. */
export function privateBookingLink(): string {
  return readEnv('PRIVATE_BOOKING_LINK')?.trim() || ''
}

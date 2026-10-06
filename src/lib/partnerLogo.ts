export const PARTNER_LOGO_BUCKET = 'partner-logos'
export const PARTNER_LOGO_MAX_BYTES = 512 * 1024

const LOGO_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/logo$/

export type PartnerLogoType = 'image/png' | 'image/jpeg' | 'image/webp'

export function isPartnerLogoPath(value: string | null | undefined): value is string {
  return typeof value === 'string' && LOGO_PATH.test(value)
}

export function partnerLogoPublicUrl(logoPath: string | null | undefined, supabaseUrl: string): string | null {
  if (!isPartnerLogoPath(logoPath)) return null
  let url: URL
  try {
    url = new URL(supabaseUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  return `${url.origin}/storage/v1/object/public/${PARTNER_LOGO_BUCKET}/${logoPath}`
}

export function monogramFromName(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, '')[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 3)
  return letters || 'P'
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false
  return signature.every((value, index) => bytes[index] === value)
}

function asciiHead(bytes: Uint8Array, length: number): string {
  const slice = bytes.subarray(0, Math.min(bytes.length, length))
  let text = ''
  for (const value of slice) text += String.fromCharCode(value)
  return text.toLowerCase()
}

export function inspectPartnerLogo(
  bytes: Uint8Array,
): { ok: true; contentType: PartnerLogoType } | { ok: false; reason: 'svg' | 'oversize' | 'type' } {
  if (bytes.byteLength <= 0 || bytes.byteLength > PARTNER_LOGO_MAX_BYTES) {
    return { ok: false, reason: bytes.byteLength > PARTNER_LOGO_MAX_BYTES ? 'oversize' : 'type' }
  }
  const head = asciiHead(bytes, 256)
  if (head.includes('<svg') || head.includes('<!doctype svg') || head.includes('<?xml')) {
    return { ok: false, reason: 'svg' }
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { ok: true, contentType: 'image/png' }
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { ok: true, contentType: 'image/jpeg' }
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { ok: true, contentType: 'image/webp' }
  }
  return { ok: false, reason: 'type' }
}

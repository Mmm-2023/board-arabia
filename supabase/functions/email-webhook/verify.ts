const PREFIX = 'whsec_'
const TOLERANCE_MS = 5 * 60 * 1000

export type SvixHeaders = {
  id: string | null
  timestamp: string | null
  signature: string | null
}

function bytesFromBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i]
  return diff === 0
}

export async function verifySvix(input: {
  secret: string
  headers: SvixHeaders
  body: string
  nowMs: number
}): Promise<boolean> {
  const secret = input.secret.trim()
  const id = input.headers.id?.trim() || ''
  const timestamp = input.headers.timestamp?.trim() || ''
  const signature = input.headers.signature?.trim() || ''
  if (!secret || !secret.startsWith(PREFIX) || !id || !timestamp || !signature) return false
  const secretBytes = bytesFromBase64(secret.slice(PREFIX.length))
  if (!secretBytes || secretBytes.length < 8) return false
  if (!/^[0-9]+$/.test(timestamp)) return false
  const seconds = Number(timestamp)
  if (!Number.isSafeInteger(seconds)) return false
  const skew = Math.abs(input.nowMs - seconds * 1000)
  if (skew > TOLERANCE_MS) return false

  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = new TextEncoder().encode(`${id}.${timestamp}.${input.body}`)
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, signed))
  let matched = false
  for (const part of signature.split(' ')) {
    const [version, value] = part.split(',')
    if (version !== 'v1' || !value) continue
    const given = bytesFromBase64(value)
    if (given && sameBytes(mac, given)) matched = true
  }
  return matched
}

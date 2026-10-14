export type MemberNoticeInput = {
  typeKey: string
  userId: string
  refId: string
  payload?: Record<string, string>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function readEnv(name: string): string {
  const runtime = globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } }
  const fromDeno = runtime.Deno?.env?.get?.(name)
  if (fromDeno && fromDeno.trim()) return fromDeno.trim()
  const fromNode = typeof process !== 'undefined' ? process.env?.[name] : undefined
  return fromNode?.trim() || ''
}

/** Queue one notice. A second call with the same type, ref, and member does not add a row. */
export async function enqueueMemberNotice(notice: MemberNoticeInput): Promise<void> {
  const url = readEnv('SUPABASE_URL').replace(/\/$/, '')
  const key = readEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return
  if (!UUID.test(notice.userId) || !UUID.test(notice.refId)) return
  const payload: Record<string, string> = {}
  for (const [name, value] of Object.entries(notice.payload ?? {})) {
    if (UUID.test(value)) payload[name] = value.toLowerCase()
  }
  try {
    await fetch(`${url}/rest/v1/rpc/service_enqueue_member_notice`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_type: notice.typeKey,
        p_user: notice.userId,
        p_ref: notice.refId,
        p_payload: payload,
      }),
      signal: AbortSignal.timeout(3000),
    })
  } catch {
    // Fail open. The existing letter still goes out. The same ref can be queued again.
  }
}

/** Stable id for one event so a retry does not queue a second notice. */
export async function stableNoticeRef(rowId: string, kind: string): Promise<string> {
  if (!kind) return rowId
  const data = new TextEncoder().encode(`${rowId}|${kind}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(buf).slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

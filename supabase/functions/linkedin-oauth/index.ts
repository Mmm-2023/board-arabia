// Deploy later. Not deployed by this change.
// Token exchange stays on this Edge function.
// LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET are read from Deno.env only.
// Do not commit values for those names.
// The login email is never replaced. A LinkedIn password is never collected or stored.

import { requireUser } from '../_shared/require_user.ts'

const AVATAR_BYTES = 5 * 1024 * 1024

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get('Origin') || '*'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

function allowedProfileRedirect(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 300) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.pathname !== '/dashboard/profile' || url.search || url.hash) return null
  const host = url.hostname.toLowerCase()
  const local = host === 'localhost' || host === '127.0.0.1'
  if (local) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return `${url.origin}/dashboard/profile`
  }
  if (url.protocol !== 'https:') return null
  if (host !== 'boardarabia.com' && host !== 'www.boardarabia.com') return null
  return `${url.origin}/dashboard/profile`
}

function cleanState(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!/^[A-Za-z0-9-]{16,128}$/.test(value)) return null
  return value
}

function cleanCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim()
  if (code.length < 8 || code.length > 2048) return null
  if (!/^[A-Za-z0-9._~-]+$/.test(code)) return null
  return code
}

function clip(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) return null
  return trimmed
}

function linkedinProfileUrl(value: unknown): string | null {
  const trimmed = clip(value, 500)
  if (!trimmed || !trimmed.startsWith('https://')) return null
  try {
    const url = new URL(trimmed)
    const host = url.hostname.toLowerCase()
    if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) return null
    return trimmed
  } catch {
    return null
  }
}

function linkedInSecrets(): { clientId: string; clientSecret: string } | null {
  const clientId = Deno.env.get('LINKEDIN_CLIENT_ID')?.trim() || ''
  const clientSecret = Deno.env.get('LINKEDIN_CLIENT_SECRET')?.trim() || ''
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

function safePhotoUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    const host = url.hostname.toLowerCase()
    const allowed =
      host === 'linkedin.com' ||
      host.endsWith('.linkedin.com') ||
      host === 'licdn.com' ||
      host.endsWith('.licdn.com')
    if (!allowed) return null
    return url.toString()
  } catch {
    return null
  }
}

function imageType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png'
  }
  return null
}

async function readLimited(response: Response): Promise<Uint8Array | null> {
  const reader = response.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const step = await reader.read()
    if (step.done) break
    total += step.value.byteLength
    if (total > AVATAR_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(step.value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405)

  const session = await requireUser(req)
  if ('error' in session) return json(req, { error: 'unauthorized' }, session.status)
  const { user, admin } = session

  const { data: member, error: memberError } = await admin
    .from('members')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle()
  if (memberError || !member || (member.status !== 'invited' && member.status !== 'active')) {
    return json(req, { error: 'forbidden' }, 403)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'invalid_json' }, 400)
  }

  const action = body.action === 'start' || body.action === 'exchange' ? body.action : null
  const redirectUri = allowedProfileRedirect(body.redirect_uri)
  const state = cleanState(body.state)
  if (!action || !redirectUri || !state) return json(req, { error: 'invalid_request' }, 400)

  const secrets = linkedInSecrets()
  if (!secrets) return json(req, { error: 'not_configured' }, 503)

  if (action === 'start') {
    const authorize = new URL('https://www.linkedin.com/oauth/v2/authorization')
    authorize.searchParams.set('response_type', 'code')
    authorize.searchParams.set('client_id', secrets.clientId)
    authorize.searchParams.set('redirect_uri', redirectUri)
    authorize.searchParams.set('state', state)
    authorize.searchParams.set('scope', 'openid profile')
    return json(req, { ok: true, authorize_url: authorize.toString() })
  }

  const code = cleanCode(body.code)
  if (!code) return json(req, { error: 'invalid_request' }, 400)

  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: secrets.clientId,
    client_secret: secrets.clientSecret,
  })
  let accessToken = ''
  try {
    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
      signal: AbortSignal.timeout(8000),
    })
    if (!tokenResponse.ok) return json(req, { error: 'linkedin_unavailable' }, 502)
    const tokenJson = (await tokenResponse.json()) as Record<string, unknown>
    accessToken = typeof tokenJson.access_token === 'string' ? tokenJson.access_token : ''
  } catch {
    return json(req, { error: 'linkedin_unavailable' }, 502)
  }
  if (!accessToken) return json(req, { error: 'linkedin_unavailable' }, 502)

  let fullName: string | null = null
  let headline: string | null = null
  let company: string | null = null
  let linkedinUrl: string | null = null
  let picture = ''
  try {
    const infoResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!infoResponse.ok) return json(req, { error: 'linkedin_unavailable' }, 502)
    const info = (await infoResponse.json()) as Record<string, unknown>
    fullName = clip(info.name, 200)
    picture = typeof info.picture === 'string' ? info.picture : ''
    headline = clip(info.headline, 160)
    company = clip(info.company, 200)
    linkedinUrl = linkedinProfileUrl(info.profile)
  } catch {
    return json(req, { error: 'linkedin_unavailable' }, 502)
  }

  try {
    const meResponse = await fetch(
      'https://api.linkedin.com/v2/me?projection=(localizedHeadline,vanityName)',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8000),
      },
    )
    if (meResponse.ok) {
      const me = (await meResponse.json()) as Record<string, unknown>
      headline = headline || clip(me.localizedHeadline, 160)
      const vanity = clip(me.vanityName, 120)
      if (!linkedinUrl && vanity && /^[A-Za-z0-9_-]+$/.test(vanity)) {
        linkedinUrl = linkedinProfileUrl(`https://www.linkedin.com/in/${vanity}`)
      }
    }
  } catch {
    // Headline and vanity are optional. Name and photo can still be saved.
  }

  const patch: Record<string, string> = {}
  if (fullName) patch.full_name = fullName
  if (headline) patch.headline = headline
  if (company) patch.company = company
  if (linkedinUrl) patch.linkedin_url = linkedinUrl

  let photoSaved = false
  const photoUrl = safePhotoUrl(picture)
  if (photoUrl) {
    try {
      const photoResponse = await fetch(photoUrl, { redirect: 'manual', signal: AbortSignal.timeout(8000) })
      if (photoResponse.ok) {
        const bytes = await readLimited(photoResponse)
        const contentType = bytes ? imageType(bytes) : null
        if (bytes && contentType) {
          const objectPath = `${user.id}/avatar`
          const { error: uploadError } = await admin.storage.from('member-avatars').upload(objectPath, bytes, {
            upsert: true,
            contentType,
          })
          if (!uploadError) {
            patch.avatar_path = objectPath
            photoSaved = true
          }
        }
      }
    } catch {
      photoSaved = false
    }
  }

  if (Object.keys(patch).length > 0) {
    const { error: saveError } = await admin.from('profiles').update(patch).eq('user_id', user.id)
    if (saveError) photoSaved = false
  }

  return json(req, {
    ok: true,
    profile: {
      full_name: fullName,
      headline,
      company,
      linkedin_url: linkedinUrl,
      photo_saved: photoSaved,
    },
  })
})

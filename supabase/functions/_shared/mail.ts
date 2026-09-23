/** Board Arabia outbound mail via Google Workspace Gmail API.
 * From and Reply-To come from GMAIL_FROM. Staff notify uses ADMIN_NOTIFY_EMAIL.
 * The parked noreply address on the product domain is ignored.
 * Secrets live only in Supabase Edge Function secrets. No address defaults in source.
 * Dry-run when Gmail credentials are missing. Live send fails closed when GMAIL_FROM is missing.
 * No Resend.
 * Board Arabia footer only. No external marketing banner or signature.
 */

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'

export type SendResult = {
  dryRun: boolean
  provider: string
  providerId: string | null
  status: 'sent' | 'dry_run' | 'error'
  detail?: string
}

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

export function publicSite(): string {
  const raw = readEnv('PUBLIC_SITE_URL') || 'https://boardarabia.com'
  return raw.replace(/\/$/, '')
}

/** Parked product address is ignored. There is no baked-in From mailbox. */
function isParkedFrom(value: string): boolean {
  return /noreply@boardarabia\.com/i.test(value)
}

/** Staff notify mailbox. Empty when ADMIN_NOTIFY_EMAIL is unset. */
export function adminNotifyEmail(): string {
  return readEnv('ADMIN_NOTIFY_EMAIL')?.trim() || ''
}

/** Visible product mailbox from GMAIL_FROM. Empty when missing or parked. */
export function productFromMailbox(): string {
  const raw = readEnv('GMAIL_FROM')?.trim() || ''
  if (!raw || isParkedFrom(raw)) return ''
  const clean = sanitizeHeader(raw)
  const wrapped = clean.match(/<([^<>]+)>/)
  const mailbox = (wrapped?.[1] || clean).trim()
  if (!mailbox || !mailbox.includes('@') || isParkedFrom(mailbox)) return ''
  return mailbox
}

export function workspaceFromAddress(): string {
  const mailbox = productFromMailbox()
  if (!mailbox) return ''
  const clean = sanitizeHeader(readEnv('GMAIL_FROM')?.trim() || '')
  if (clean.includes('<')) return clean
  return `"Board Arabia" <${mailbox}>`
}

export function gmailCredentialsPresent(): boolean {
  return refreshCreds() !== null || serviceAccountCreds() !== null
}

/** Plain Board Arabia close. Not a mailbox marketing signature. */
export const BOARD_SIGNOFF = 'Board Arabia'

const BOARD_FOOTER_HTML = /<footer>\s*Board Arabia\s*<\/footer>\s*$/

const MARKETING_SIGNATURE = [
  [/director of partner/i, 'job title'],
  [/kingdom centre/i, 'banner'],
  [/kingdom center/i, 'banner'],
  [/advisory gateway/i, 'tagline'],
  [/partnerships built to last/i, 'tagline'],
  [/lasting partnerships/i, 'tagline'],
  [/nammco\.com/i, 'nammco site'],
  [/linkedin\.com\/(?:company|school|in)\/nammco/i, 'linkedin block'],
  [/<img\b/i, 'image'],
  [/data:image\//i, 'image'],
  [/\bcid:/i, 'inline image'],
] as const

/** Append the only footer applicant mail may use. */
export function boardMail(textBody: string, htmlBody: string): { text: string; html: string } {
  const text = `${textBody.replace(/\s+$/, '')}\n\n${BOARD_SIGNOFF}`
  const html = `${htmlBody.replace(/\s+$/, '')}\n<footer>${BOARD_SIGNOFF}</footer>`
  return { text, html }
}

export function hasBoardFooter(text: string, html: string): boolean {
  return text.trimEnd().endsWith(BOARD_SIGNOFF) && BOARD_FOOTER_HTML.test(html)
}

/** A footer with no letter is not a message. */
export function hasSubstantiveBody(text: string, html: string): boolean {
  const plain = text.replace(/\n*Board Arabia\s*$/i, '').trim()
  const markup = html.replace(/<footer>\s*Board Arabia\s*<\/footer>\s*$/i, '').trim()
  return plain.length >= 40 && markup.length >= 20
}

export function marketingSignatureHit(text: string, html: string): string | null {
  // Mailbox addresses may use the same domain. The site, tagline, and banner must not.
  const body = `${text}\n${html}`.replace(/[\w.+-]+@[\w.-]*nammco\.com/gi, '')
  for (const [pattern, label] of MARKETING_SIGNATURE) {
    if (pattern.test(body)) return label
  }
  return null
}

export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
  text: string
  from?: string
}): Promise<SendResult> {
  const requested = opts.from ? sanitizeHeader(opts.from) : ''
  const from = !requested || isParkedFrom(requested) ? workspaceFromAddress() : requested
  const to = sanitizeHeader(opts.to)
  const subject = sanitizeHeader(opts.subject)
  const signatureHit = marketingSignatureHit(opts.text, opts.html)
  if (signatureHit) {
    return {
      dryRun: false,
      provider: 'gmail',
      providerId: null,
      status: 'error',
      detail: `Blocked marketing signature (${signatureHit}). Board Arabia footer only.`,
    }
  }
  if (!hasBoardFooter(opts.text, opts.html)) {
    return {
      dryRun: false,
      provider: 'gmail',
      providerId: null,
      status: 'error',
      detail: 'Board Arabia footer required.',
    }
  }
  if (!hasSubstantiveBody(opts.text, opts.html)) {
    return {
      dryRun: false,
      provider: 'gmail',
      providerId: null,
      status: 'error',
      detail: 'Email body is empty. Board Arabia footer only.',
    }
  }
  if (!to || !subject) {
    return {
      dryRun: false,
      provider: 'gmail',
      providerId: null,
      status: 'error',
      detail: 'Missing recipient or subject.',
    }
  }

  if (!gmailCredentialsPresent()) {
    return {
      dryRun: true,
      provider: 'gmail',
      providerId: null,
      status: 'dry_run',
      detail: 'Gmail credentials are not set. Email logged only.',
    }
  }

  const replyTo = productFromMailbox()
  if (!from || !replyTo) {
    return {
      dryRun: false,
      provider: 'gmail',
      providerId: null,
      status: 'error',
      detail: 'GMAIL_FROM is not set.',
    }
  }

  const token = await fetchAccessToken()
  if ('error' in token) {
    return {
      dryRun: true,
      provider: 'gmail',
      providerId: null,
      status: 'dry_run',
      detail: 'Gmail authentication failed. Email logged only.',
    }
  }

  const raw = toBase64Url(
    buildRfc822({
      from,
      to,
      replyTo,
      subject,
      text: opts.text,
      html: opts.html,
    }),
  )

  let res: Response
  try {
    res = await fetch(GMAIL_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    })
  } catch (err) {
    return {
      dryRun: false,
      provider: 'gmail',
      providerId: null,
      status: 'error',
      detail: redactDetail(err instanceof Error ? err.message : 'Gmail request failed'),
    }
  }

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      return {
        dryRun: true,
        provider: 'gmail',
        providerId: null,
        status: 'dry_run',
        detail: 'Gmail authentication failed. Email logged only.',
      }
    }
    const message =
      body && typeof body === 'object' && 'error' in body
        ? JSON.stringify((body as { error?: unknown }).error)
        : `Gmail send failed (${res.status})`
    return {
      dryRun: false,
      provider: 'gmail',
      providerId: null,
      status: 'error',
      detail: redactDetail(message) || 'Gmail send failed.',
    }
  }

  const id =
    body && typeof body === 'object' && 'id' in body
      ? String((body as { id?: unknown }).id || '')
      : ''
  return {
    dryRun: false,
    provider: 'gmail',
    providerId: id || null,
    status: 'sent',
  }
}

type EmailAdmin = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => PromiseLike<unknown>
  }
}

export async function logEmailEvent(
  admin: EmailAdmin,
  row: {
    application_id: string | null
    kind: string
    recipient: string
    subject: string
    status: string
    provider?: string | null
    provider_id?: string | null
    detail?: string | null
    payload?: Record<string, unknown> | null
  },
) {
  await admin.from('email_events').insert({
    application_id: row.application_id,
    kind: row.kind,
    recipient: row.recipient,
    subject: row.subject,
    status: row.status,
    provider: row.provider ?? null,
    provider_id: row.provider_id ?? null,
    detail: redactDetail(row.detail),
    payload: redactPayload(row.payload),
  })
}

const SECRET_KEY = /token|password|otp|secret|authorization|private_key|refresh|credential|cookie/i

export function redactPayload(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!value) return null
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY.test(key) && !key.startsWith('has_')) continue
    if (item && typeof item === 'object') continue
    if (typeof item === 'string' && looksSecret(item)) continue
    out[key] = item as string | number | boolean | null
  }
  return out
}

export function redactDetail(detail: string | null | undefined): string | null {
  if (!detail) return null
  return detail
    .replace(/ya29\.[A-Za-z0-9_\-]+/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/-----BEGIN[\s\S]+?-----END [^-]+-----/g, '[redacted]')
    .replace(/token_hash=[^\s&]+/gi, 'token_hash=[redacted]')
    .slice(0, 500)
}

function looksSecret(value: string): boolean {
  return /token_hash=|ya29\.|refresh_token|private_key|BEGIN /i.test(value)
}

export function buildRfc822(opts: {
  from: string
  to: string
  replyTo?: string
  subject: string
  text: string
  html: string
}): string {
  const boundary = `ba_${crypto.randomUUID().replaceAll('-', '')}`
  const replyTo = sanitizeHeader(opts.replyTo || productFromMailbox())
  const lines = [
    `From: ${sanitizeHeader(opts.from)}`,
    `To: ${sanitizeHeader(opts.to)}`,
    `Reply-To: ${replyTo}`,
    `Subject: ${encodeSubject(sanitizeHeader(opts.subject))}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(utf8Bytes(opts.text)),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(utf8Bytes(opts.html)),
    `--${boundary}--`,
    '',
  ]
  return lines.join('\r\n')
}

function refreshCreds(): { clientId: string; clientSecret: string; refreshToken: string } | null {
  const clientId = readEnv('GMAIL_CLIENT_ID')?.trim() || ''
  const clientSecret = readEnv('GMAIL_CLIENT_SECRET')?.trim() || ''
  const refreshToken = readEnv('GMAIL_REFRESH_TOKEN')?.trim() || ''
  if (!clientId || !clientSecret || !refreshToken) return null
  return { clientId, clientSecret, refreshToken }
}

function serviceAccountCreds(): { clientEmail: string; privateKey: string } | null {
  const raw = readEnv('GMAIL_SERVICE_ACCOUNT_JSON')?.trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string }
    const clientEmail = parsed.client_email?.trim() || ''
    const privateKey = parsed.private_key || ''
    if (!clientEmail || !privateKey.includes('PRIVATE KEY')) return null
    return { clientEmail, privateKey }
  } catch {
    return null
  }
}

function impersonatedMailbox(): string {
  const explicit = readEnv('GMAIL_IMPERSONATE')?.trim()
  if (explicit && !isParkedFrom(explicit)) return sanitizeHeader(explicit)
  return productFromMailbox()
}

async function fetchAccessToken(): Promise<{ token: string } | { error: string }> {
  const refresh = refreshCreds()
  if (refresh) return refreshAccessToken(refresh)
  const account = serviceAccountCreds()
  if (account) return serviceAccountToken(account)
  return { error: 'Gmail credentials are not set.' }
}

async function refreshAccessToken(creds: {
  clientId: string
  clientSecret: string
  refreshToken: string
}): Promise<{ token: string } | { error: string }> {
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: creds.refreshToken,
    grant_type: 'refresh_token',
  })
  return postToken(body)
}

async function serviceAccountToken(account: {
  clientEmail: string
  privateKey: string
}): Promise<{ token: string } | { error: string }> {
  const subject = impersonatedMailbox()
  if (!subject) return { error: 'GMAIL_FROM is not set.' }
  let assertion = ''
  try {
    assertion = await signServiceJwt(account.clientEmail, account.privateKey, subject)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not sign the Gmail assertion.' }
  }
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  })
  return postToken(body)
}

async function postToken(body: URLSearchParams): Promise<{ token: string } | { error: string }> {
  let res: Response
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Token request failed.' }
  }
  const parsed = (await res.json().catch(() => ({}))) as { access_token?: string; error?: unknown }
  if (!res.ok || !parsed.access_token) {
    const message =
      typeof parsed.error === 'string'
        ? parsed.error
        : parsed.error
          ? JSON.stringify(parsed.error)
          : `Token request failed (${res.status})`
    return { error: message }
  }
  return { token: parsed.access_token }
}

async function signServiceJwt(
  clientEmail: string,
  privateKeyPem: string,
  subject: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = bytesToBase64Url(utf8Bytes(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const payload = bytesToBase64Url(
    utf8Bytes(
      JSON.stringify({
        iss: clientEmail,
        scope: GMAIL_SEND_SCOPE,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
        sub: subject,
      }),
    ),
  )
  const unsigned = `${header}.${payload}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    utf8Bytes(unsigned),
  )
  return `${unsigned}.${bytesToBase64Url(new Uint8Array(signature))}`
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export function toBase64Url(value: string): string {
  return bytesToBase64Url(utf8Bytes(value))
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function wrapBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const raw = btoa(binary)
  const lines: string[] = []
  for (let i = 0; i < raw.length; i += 76) lines.push(raw.slice(i, i + 76))
  return lines.join('\r\n')
}

function encodeSubject(value: string): string {
  if (/^[\u0000-\u007f]*$/.test(value)) return value
  return `=?UTF-8?B?${btoa(String.fromCharCode(...utf8Bytes(value)))}?=`
}

export function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

export function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get('Origin') || '*'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

export function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

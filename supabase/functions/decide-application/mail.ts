/** Mail helpers for decide-application (Resend + dry-run). No public booking links. */

export const ADMIN_NOTIFY_EMAIL = 'michael@nammco.com'

export type SendResult = {
  dryRun: boolean
  provider: string
  providerId: string | null
  status: 'sent' | 'dry_run' | 'error'
  detail?: string
}

export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
  text: string
  from?: string
}): Promise<SendResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from =
    opts.from ||
    Deno.env.get('RESEND_FROM') ||
    'Board Arabia <onboarding@resend.dev>'

  if (!apiKey) {
    return {
      dryRun: true,
      provider: 'resend',
      providerId: null,
      status: 'dry_run',
      detail: 'RESEND_API_KEY not set — email logged only',
    }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    return {
      dryRun: false,
      provider: 'resend',
      providerId: null,
      status: 'error',
      detail: typeof body === 'object' ? JSON.stringify(body) : String(body),
    }
  }

  return {
    dryRun: false,
    provider: 'resend',
    providerId: (body as { id?: string }).id ?? null,
    status: 'sent',
  }
}

export async function logEmailEvent(
  // deno-lint-ignore no-explicit-any
  admin: any,
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
  await admin.from('email_events').insert(row)
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

export function jsonResponse(
  req: Request,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

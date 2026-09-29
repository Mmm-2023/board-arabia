import { requireStaff } from '../_shared/require_staff.ts'
import {
  admitLiShareDryRunTo,
  admitLiShareSample,
  admitShareBrandBlocked,
} from '../_shared/admit_li_share.ts'
import { jsonResponse, logEmailEvent, sendEmail } from '../_shared/mail.ts'

/** Staff-only preview send. The recipient is an Edge secret. Members are never the target. */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const gate = await requireStaff(req, (body, status) => jsonResponse(req, body, status))
  if (gate instanceof Response) return gate
  const { admin } = gate

  let kind: 'share' | 'reminder' = 'share'
  try {
    const body = (await req.json()) as { kind?: unknown }
    if (body.kind === undefined || body.kind === 'share') kind = 'share'
    else if (body.kind === 'reminder') kind = 'reminder'
    else return jsonResponse(req, { error: 'kind must be share or reminder' }, 400)
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }

  const to = admitLiShareDryRunTo()
  if (!to) return jsonResponse(req, { error: 'Dry-run recipient is not configured.' }, 400)

  const mail = admitLiShareSample(kind)
  if (admitShareBrandBlocked(`${mail.subject}\n${mail.text}\n${mail.html}`)) {
    return jsonResponse(req, { error: 'Invite blocked' }, 500)
  }

  const sent = await sendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text })
  await logEmailEvent(admin, {
    application_id: null,
    kind: 'admit_li_share_dry_run',
    recipient: to,
    subject: mail.subject,
    status: sent.status,
    provider: sent.provider,
    provider_id: sent.providerId,
    detail: sent.detail ?? null,
    payload: { sample: kind },
  })

  if (sent.status === 'error') return jsonResponse(req, { error: 'Email failed' }, 502)
  return jsonResponse(req, { ok: true, status: sent.status, kind })
})

function cors(req: Request): HeadersInit {
  return {
    'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

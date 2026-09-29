import { corsHeaders, jsonResponse } from '../_shared/mail.ts'
import { deliverAdminAlert, type AdminAlertKind } from '../_shared/notify_admin.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type MandateContext = {
  alreadyQueued: boolean
  requesterName: string
  requesterKind: AdminAlertKind
  item: string
}

export type MandateIntroOpen =
  | {
      userId: string
      rpc: (mandateId: string) => Promise<{ data: unknown; error: { message: string } | null }>
      context: (mandateId: string) => Promise<MandateContext>
    }
  | { error: string; status: number }

export async function handleMandateIntro(
  req: Request,
  deps: { open: (req: Request) => Promise<MandateIntroOpen> },
): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const opened = await deps.open(req)
  if ('error' in opened) return jsonResponse(req, { error: opened.error }, opened.status)

  let mandateId = ''
  try {
    const body = await req.json()
    mandateId = String(body.mandate_id || '')
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }
  if (!UUID.test(mandateId)) return jsonResponse(req, { error: 'mandate_id required' }, 400)

  let prior: MandateContext | null = null
  try {
    prior = await opened.context(mandateId)
  } catch {
    prior = null
  }

  const { data, error } = await opened.rpc(mandateId)
  if (error) {
    const mapped = mapIntroError(error.message || '')
    return jsonResponse(req, { error: mapped.error }, mapped.status)
  }

  const status = readStatus(data)
  if (!prior) {
    console.warn('admin_alert warning: mandate context unavailable')
  } else if (!prior.alreadyQueued && status === 'pending') {
    deliverAdminAlert(undefined, {
      requesterName: prior.requesterName,
      requesterKind: prior.requesterKind,
      requested: 'mandate access',
      item: prior.item,
      approvePath: '/admin#mandate-intro-queue',
    })
  }

  return jsonResponse(req, { ok: true, status })
}

function readStatus(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const status = (data as { status?: unknown }).status
  return typeof status === 'string' ? status : ''
}

function mapIntroError(message: string): { status: number; error: string } {
  if (message.includes('not_allowed')) return { status: 403, error: 'Not allowed' }
  if (message.includes('not_found')) return { status: 404, error: 'Mandate not found' }
  return { status: 400, error: 'Could not request the intro' }
}

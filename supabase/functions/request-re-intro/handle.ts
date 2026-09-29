import { corsHeaders, jsonResponse } from '../_shared/mail.ts'
import { deliverAdminAlert, type AdminAlertKind } from '../_shared/notify_admin.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ReIntroContext = {
  alreadyQueued: boolean
  requesterName: string
  requesterKind: AdminAlertKind
  item: string
}

export type ReIntroOpen =
  | {
      userId: string
      rpc: (opportunityId: string) => Promise<{ data: unknown; error: { message: string } | null }>
      context: (opportunityId: string) => Promise<ReIntroContext>
    }
  | { error: string; status: number }

export async function handleReIntro(
  req: Request,
  deps: { open: (req: Request) => Promise<ReIntroOpen> },
): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const opened = await deps.open(req)
  if ('error' in opened) return jsonResponse(req, { error: opened.error }, opened.status)

  let opportunityId = ''
  try {
    const body = await req.json()
    opportunityId = String(body.opportunity_id || '')
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }
  if (!UUID.test(opportunityId)) return jsonResponse(req, { error: 'opportunity_id required' }, 400)

  let prior: ReIntroContext | null = null
  try {
    prior = await opened.context(opportunityId)
  } catch {
    prior = null
  }

  const { data, error } = await opened.rpc(opportunityId)
  if (error) {
    const mapped = mapIntroError(error.message || '')
    return jsonResponse(req, { error: mapped.error }, mapped.status)
  }

  const status = readStatus(data)
  if (!prior) {
    console.warn('admin_alert warning: real estate intro context unavailable')
  } else if (!prior.alreadyQueued && status === 'pending') {
    deliverAdminAlert(undefined, {
      requesterName: prior.requesterName,
      requesterKind: prior.requesterKind,
      requested: 'a real estate opportunity intro',
      item: prior.item,
      approvePath: '/admin',
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
  if (message.includes('not_found')) return { status: 404, error: 'Opportunity not found' }
  return { status: 400, error: 'Could not request the intro' }
}

import { jsonResponse } from '../_shared/mail.ts'
import { deliverAdminAlert, type AdminAlertInput, type AdminAlertKind } from '../_shared/notify_admin.ts'

export type ClubInterestContext = {
  alreadyQueued: boolean
  requesterName: string
  requesterKind: AdminAlertKind
  item: string
}

const CLUB_REQUESTED = 'a real estate club interest'

export async function finishClubInterest(
  req: Request,
  opportunityId: string,
  rpc: (id: string) => Promise<{ data: unknown; error: { message: string } | null }>,
  context: (id: string) => Promise<ClubInterestContext>,
  alert?: (input: AdminAlertInput) => void,
): Promise<Response> {
  let prior: ClubInterestContext | null = null
  try {
    prior = await context(opportunityId)
  } catch {
    prior = null
  }

  const { data, error } = await rpc(opportunityId)
  if (error) {
    const mapped = mapClubError(error.message || '')
    return jsonResponse(req, { error: mapped.error }, mapped.status)
  }

  const status = readStatus(data)
  const fresh = readFresh(data)
  if (!prior) {
    console.warn('admin_alert warning: real estate club interest context unavailable')
  } else if (!prior.alreadyQueued && fresh && status === 'recorded') {
    const input: AdminAlertInput = {
      requesterName: prior.requesterName,
      requesterKind: prior.requesterKind,
      requested: CLUB_REQUESTED,
      item: prior.item,
      approvePath: '/admin',
    }
    if (alert) alert(input)
    else deliverAdminAlert(undefined, input)
  }

  return jsonResponse(req, { ok: true, status: status || 'recorded' })
}

function readStatus(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const status = (data as { status?: unknown }).status
  return typeof status === 'string' ? status : ''
}

function readFresh(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  return (data as { fresh?: unknown }).fresh === true
}

function mapClubError(message: string): { status: number; error: string } {
  if (message.includes('not_allowed')) return { status: 403, error: 'Not allowed' }
  if (message.includes('not_found')) return { status: 404, error: 'Opportunity not found' }
  return { status: 400, error: 'Could not record interest' }
}

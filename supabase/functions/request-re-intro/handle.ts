import { corsHeaders, jsonResponse } from '../_shared/mail.ts'
import { deliverAdminAlert, type AdminAlertInput, type AdminAlertKind } from '../_shared/notify_admin.ts'
import { finishClubInterest } from './club.ts'

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
      partnerRpc?: (partnerId: string) => Promise<{ data: unknown; error: { message: string } | null }>
      partnerContext?: (partnerId: string) => Promise<ReIntroContext>
      roleRpc?: (roleId: string) => Promise<{ data: unknown; error: { message: string } | null }>
      roleContext?: (roleId: string) => Promise<ReIntroContext>
      interestRpc?: (opportunityId: string) => Promise<{ data: unknown; error: { message: string } | null }>
      interestContext?: (opportunityId: string) => Promise<ReIntroContext>
    }
  | { error: string; status: number }

export async function handleReIntro(
  req: Request,
  deps: {
    open: (req: Request) => Promise<ReIntroOpen>
    alert?: (input: AdminAlertInput) => void
  },
): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405)

  const opened = await deps.open(req)
  if ('error' in opened) return jsonResponse(req, { error: opened.error }, opened.status)

  let opportunityId = ''
  let partnerId = ''
  let roleId = ''
  let interestOpportunityId = ''
  try {
    const body = await req.json()
    opportunityId = String(body.opportunity_id || '')
    partnerId = String(body.partner_id || '')
    roleId = String(body.role_id || '')
    interestOpportunityId = String(body.interest_opportunity_id || '')
  } catch {
    return jsonResponse(req, { error: 'Invalid JSON' }, 400)
  }
  const chosen = [opportunityId, partnerId, roleId, interestOpportunityId].filter((id) => id.length > 0)
  if (chosen.length > 1) return jsonResponse(req, { error: 'One intro target' }, 400)
  if (interestOpportunityId) {
    if (!UUID.test(interestOpportunityId)) return jsonResponse(req, { error: 'interest_opportunity_id required' }, 400)
    if (!opened.interestRpc || !opened.interestContext) {
      return jsonResponse(req, { error: 'club interest is not available' }, 400)
    }
    return finishClubInterest(
      req,
      interestOpportunityId,
      opened.interestRpc,
      opened.interestContext,
      deps.alert,
    )
  }
  if (roleId) {
    if (!UUID.test(roleId)) return jsonResponse(req, { error: 'role_id required' }, 400)
    if (!opened.roleRpc || !opened.roleContext) {
      return jsonResponse(req, { error: 'role intro is not available' }, 400)
    }
    return finishIntro(
      req,
      roleId,
      opened.roleRpc,
      opened.roleContext,
      'a real estate board role intro',
      'Role not found',
      deps.alert,
    )
  }
  if (partnerId) {
    if (!UUID.test(partnerId)) return jsonResponse(req, { error: 'partner_id required' }, 400)
    if (!opened.partnerRpc || !opened.partnerContext) {
      return jsonResponse(req, { error: 'partner intro is not available' }, 400)
    }
    return finishIntro(
      req,
      partnerId,
      opened.partnerRpc,
      opened.partnerContext,
      'a real estate partner intro',
      'Partner not found',
      deps.alert,
    )
  }
  if (!UUID.test(opportunityId)) return jsonResponse(req, { error: 'opportunity_id required' }, 400)
  return finishIntro(
    req,
    opportunityId,
    opened.rpc,
    opened.context,
    'a real estate opportunity intro',
    'Opportunity not found',
    deps.alert,
  )
}

async function finishIntro(
  req: Request,
  targetId: string,
  rpc: (id: string) => Promise<{ data: unknown; error: { message: string } | null }>,
  context: (id: string) => Promise<ReIntroContext>,
  requested: string,
  missing: string,
  alert?: (input: AdminAlertInput) => void,
): Promise<Response> {
  let prior: ReIntroContext | null = null
  try {
    prior = await context(targetId)
  } catch {
    prior = null
  }

  const { data, error } = await rpc(targetId)
  if (error) {
    const mapped = mapIntroError(error.message || '', missing)
    return jsonResponse(req, { error: mapped.error }, mapped.status)
  }

  const status = readStatus(data)
  if (!prior) {
    console.warn('admin_alert warning: real estate intro context unavailable')
  } else if (!prior.alreadyQueued && status === 'pending') {
    const input: AdminAlertInput = {
      requesterName: prior.requesterName,
      requesterKind: prior.requesterKind,
      requested,
      item: prior.item,
      approvePath: '/admin',
    }
    if (alert) alert(input)
    else deliverAdminAlert(undefined, input)
  }

  return jsonResponse(req, { ok: true, status })
}

function readStatus(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const status = (data as { status?: unknown }).status
  return typeof status === 'string' ? status : ''
}

function mapIntroError(message: string, missing: string): { status: number; error: string } {
  if (message.includes('not_allowed')) return { status: 403, error: 'Not allowed' }
  if (message.includes('not_found')) return { status: 404, error: missing }
  return { status: 400, error: 'Could not request the intro' }
}

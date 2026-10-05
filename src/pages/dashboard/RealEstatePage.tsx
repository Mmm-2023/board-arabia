import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  fetchMyReAppetite,
  fetchReBoardRoles,
  fetchReOpportunities,
  fetchRePartners,
  requestReBoardRoleIntro,
  requestReOpportunityIntro,
  requestRePartnerIntro,
  saveMyReAppetite,
} from '../../lib/demoFetch'
import type { ReAppetite } from '../../lib/reAppetite'
import type { ReBoardRoleCard } from '../../lib/reBoardRoles'
import type { ReOpportunityCard, RePartnerCard } from '../../lib/reRedaction'
import type { ReAppetiteCardStatus } from './ReAppetiteCard'
import { sampleRow } from '../../lib/sampleAction'
import { useNoIndex } from '../../lib/usePageTitle'
import { RealEstateBoard, type RealEstateStatus, type RealEstateTab } from './RealEstateBoard'

type OpportunityState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'denied' }
  | { status: 'ready'; cards: ReOpportunityCard[] }

type PartnerState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'denied' }
  | { status: 'ready'; cards: RePartnerCard[] }

type RoleState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'denied' }
  | { status: 'ready'; cards: ReBoardRoleCard[] }

type AppetiteState =
  | { status: Exclude<ReAppetiteCardStatus, 'ready'> }
  | { status: 'ready'; value: ReAppetite | null }

export function RealEstatePage() {
  const [list, setList] = useState<OpportunityState>({ status: 'loading' })
  const [partners, setPartners] = useState<PartnerState>({ status: 'loading' })
  const [params, setParams] = useSearchParams()
  const view = params.get('view')
  const tab: RealEstateTab = view === 'partners' ? 'partners' : view === 'roles' ? 'roles' : 'opportunities'
  function selectTab(next: RealEstateTab) {
    const nextParams = new URLSearchParams(params)
    if (next === 'partners') nextParams.set('view', 'partners')
    else if (next === 'roles') nextParams.set('view', 'roles')
    else nextParams.delete('view')
    setParams(nextParams, { replace: true })
  }
  const [attempt, setAttempt] = useState(0)
  const [partnerAttempt, setPartnerAttempt] = useState(0)
  const [appetiteAttempt, setAppetiteAttempt] = useState(0)
  const [appetite, setAppetite] = useState<AppetiteState>({ status: 'loading' })
  const [busyId, setBusyId] = useState<string | null>(null)
  const [partnerBusyId, setPartnerBusyId] = useState<string | null>(null)
  const [requestError, setRequestError] = useState(false)
  const [partnerRequestError, setPartnerRequestError] = useState(false)
  const [roles, setRoles] = useState<RoleState>({ status: 'loading' })
  const [roleAttempt, setRoleAttempt] = useState(0)
  const [roleBusyId, setRoleBusyId] = useState<string | null>(null)
  const [roleRequestError, setRoleRequestError] = useState(false)
  useNoIndex('Real Estate | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void fetchReOpportunities().then((result) => {
      if (cancelled) return
      if (result.status === 'error') {
        setList({ status: 'error' })
        return
      }
      if (result.status === 'denied') {
        setList({ status: 'denied' })
        return
      }
      setList({ status: 'ready', cards: result.status === 'ready' ? result.rows : [] })
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  useEffect(() => {
    let cancelled = false
    void fetchRePartners().then((result) => {
      if (cancelled) return
      if (result.status === 'error' || result.status === 'missing') {
        setPartners({ status: 'error' })
        return
      }
      if (result.status === 'denied') {
        setPartners({ status: 'denied' })
        return
      }
      setPartners({ status: 'ready', cards: result.rows })
    })
    return () => {
      cancelled = true
    }
  }, [partnerAttempt])

  useEffect(() => {
    let cancelled = false
    void fetchReBoardRoles().then((result) => {
      if (cancelled) return
      if (result.status === 'error' || result.status === 'missing') {
        setRoles({ status: 'error' })
        return
      }
      if (result.status === 'denied') {
        setRoles({ status: 'denied' })
        return
      }
      setRoles({ status: 'ready', cards: result.rows })
    })
    return () => {
      cancelled = true
    }
  }, [roleAttempt])

  useEffect(() => {
    let cancelled = false
    void fetchMyReAppetite().then((result) => {
      if (cancelled) return
      if (result.status === 'ready') {
        setAppetite({ status: 'ready', value: result.appetite })
        return
      }
      setAppetite({ status: result.status })
    })
    return () => {
      cancelled = true
    }
  }, [appetiteAttempt])

  async function onSaveAppetite(next: ReAppetite) {
    const result = await saveMyReAppetite(next)
    if (result.status !== 'ready') return 'error' as const
    setAppetite({ status: 'ready', value: result.appetite })
    return 'ok' as const
  }

  async function onRequest(id: string) {
    if (list.status === 'ready' && sampleRow(list.cards, id)) return
    setRequestError(false)
    setBusyId(id)
    const outcome = await requestReOpportunityIntro(id)
    setBusyId(null)
    if (outcome === 'error') {
      setRequestError(true)
      return
    }
    setList({ status: 'loading' })
    setAttempt((value) => value + 1)
  }

  async function onRequestRole(id: string) {
    if (roles.status === 'ready' && sampleRow(roles.cards, id)) return
    setRoleRequestError(false)
    setRoleBusyId(id)
    const outcome = await requestReBoardRoleIntro(id)
    setRoleBusyId(null)
    if (outcome === 'error') {
      setRoleRequestError(true)
      return
    }
    setRoles({ status: 'loading' })
    setRoleAttempt((value) => value + 1)
  }

  async function onRequestPartner(id: string) {
    if (partners.status === 'ready' && sampleRow(partners.cards, id)) return
    setPartnerRequestError(false)
    setPartnerBusyId(id)
    const outcome = await requestRePartnerIntro(id)
    setPartnerBusyId(null)
    if (outcome === 'error') {
      setPartnerRequestError(true)
      return
    }
    setPartners({ status: 'loading' })
    setPartnerAttempt((value) => value + 1)
  }

  const status: RealEstateStatus = list.status === 'ready' ? 'ready' : list.status
  const partnersStatus: RealEstateStatus = partners.status === 'ready' ? 'ready' : partners.status
  return (
    <RealEstateBoard
      status={status}
      cards={list.status === 'ready' ? list.cards : []}
      busyId={busyId}
      requestError={requestError}
      onRetry={() => {
        setList({ status: 'loading' })
        setAttempt((value) => value + 1)
      }}
      onRequest={(id) => void onRequest(id)}
      tab={tab}
      onTab={selectTab}
      partners={partners.status === 'ready' ? partners.cards : []}
      partnersStatus={partnersStatus}
      partnerBusyId={partnerBusyId}
      partnerRequestError={partnerRequestError}
      onRetryPartners={() => {
        setPartners({ status: 'loading' })
        setPartnerAttempt((value) => value + 1)
      }}
      onRequestPartner={(id) => void onRequestPartner(id)}
      roles={roles.status === 'ready' ? roles.cards : []}
      rolesStatus={roles.status === 'ready' ? 'ready' : roles.status}
      roleBusyId={roleBusyId}
      roleRequestError={roleRequestError}
      onRetryRoles={() => {
        setRoles({ status: 'loading' })
        setRoleAttempt((value) => value + 1)
      }}
      onRequestRole={(id) => void onRequestRole(id)}
      appetiteStatus={appetite.status}
      appetite={appetite.status === 'ready' ? appetite.value : null}
      onRetryAppetite={() => {
        setAppetite({ status: 'loading' })
        setAppetiteAttempt((value) => value + 1)
      }}
      onSaveAppetite={onSaveAppetite}
    />
  )
}

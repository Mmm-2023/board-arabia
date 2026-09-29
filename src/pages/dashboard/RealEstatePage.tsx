import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  fetchReOpportunities,
  fetchRePartners,
  requestReOpportunityIntro,
  requestRePartnerIntro,
} from '../../lib/demoFetch'
import type { ReOpportunityCard, RePartnerCard } from '../../lib/reRedaction'
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

export function RealEstatePage() {
  const [list, setList] = useState<OpportunityState>({ status: 'loading' })
  const [partners, setPartners] = useState<PartnerState>({ status: 'loading' })
  const [params, setParams] = useSearchParams()
  const tab: RealEstateTab = params.get('view') === 'partners' ? 'partners' : 'opportunities'
  function selectTab(next: RealEstateTab) {
    const nextParams = new URLSearchParams(params)
    if (next === 'partners') nextParams.set('view', 'partners')
    else nextParams.delete('view')
    setParams(nextParams, { replace: true })
  }
  const [attempt, setAttempt] = useState(0)
  const [partnerAttempt, setPartnerAttempt] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [partnerBusyId, setPartnerBusyId] = useState<string | null>(null)
  const [requestError, setRequestError] = useState(false)
  const [partnerRequestError, setPartnerRequestError] = useState(false)
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
    />
  )
}

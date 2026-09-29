import { useEffect, useState } from 'react'
import { fetchReOpportunities, requestReOpportunityIntro } from '../../lib/demoFetch'
import type { ReOpportunityCard } from '../../lib/reRedaction'
import { useNoIndex } from '../../lib/usePageTitle'
import { RealEstateBoard, type RealEstateStatus } from './RealEstateBoard'

type ListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'denied' }
  | { status: 'ready'; cards: ReOpportunityCard[] }

export function RealEstatePage() {
  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [requestError, setRequestError] = useState(false)
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

  async function onRequest(id: string) {
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

  const status: RealEstateStatus = list.status === 'ready' ? 'ready' : list.status
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
    />
  )
}

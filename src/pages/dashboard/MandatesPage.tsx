import { useEffect, useState } from 'react'
import { fetchMandates, requestMandateIntro } from '../../lib/demoFetch'
import { sampleRow } from '../../lib/sampleAction'
import type { MandateCardModel } from '../../lib/mandateRedaction'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, EmptyState, ErrorBanner } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { MandatesBoard } from './MandatesBoard'

type ListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; mandates: MandateCardModel[] }

export function MandatesPage() {
  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [requestError, setRequestError] = useState(false)
  useNoIndex('Mandates | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void fetchMandates().then((result) => {
      if (cancelled) return
      if (result.status === 'error') {
        setList({ status: 'error' })
        return
      }
      setList({ status: 'ready', mandates: result.status === 'ready' ? result.rows : [] })
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  async function onRequest(id: string) {
    if (list.status === 'ready' && sampleRow(list.mandates, id)) return
    setRequestError(false)
    setBusyId(id)
    const outcome = await requestMandateIntro(id)
    setBusyId(null)
    if (outcome === 'error') {
      setRequestError(true)
      return
    }
    setList({ status: 'loading' })
    setAttempt((value) => value + 1)
  }

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em]">Mandates</h1>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/60">
        Sector, deal type, size band, geography, and stage stay visible. Company, exact price, contacts, and the confidential note stay locked until you request an intro and the desk approves it for you.
      </p>
      <div className="mt-8">
        {list.status === 'loading' ? <CardSkeleton tone="member" label="Loading mandates" /> : null}
        {list.status === 'error' ? (
          <ErrorBanner
            tone="member"
            message={MEMBER_VIEWS.mandates.error}
            retryLabel={MEMBER_VIEWS.mandates.retry}
            onRetry={() => {
              setList({ status: 'loading' })
              setAttempt((value) => value + 1)
            }}
          />
        ) : null}
        {list.status === 'ready' && list.mandates.length === 0 ? (
          <EmptyState tone="member" message={MEMBER_VIEWS.mandates.empty} />
        ) : null}
        {list.status === 'ready' && list.mandates.length > 0 ? (
          <MandatesBoard
            mandates={list.mandates}
            busyId={busyId}
            onRequest={(id) => void onRequest(id)}
          />
        ) : null}
        {requestError ? (
          <p className="mt-4 text-[0.95rem] text-[var(--ba-error)]" role="alert">
            Could not send the request. Retry.
          </p>
        ) : null}
      </div>
    </div>
  )
}

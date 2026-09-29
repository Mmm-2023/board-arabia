import { useEffect, useState } from 'react'
import { fetchStaffMandates } from '../../lib/mandateMatchApi'
import type { StaffMandateBrief } from '../../lib/mandateMatch'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, EmptyState, ErrorBanner, PermissionState } from '../../shell/ViewState'
import { STAFF_VIEWS } from '../../shell/viewCopy'
import { MandateDeskCard } from './MandateShortlist'

const copy = STAFF_VIEWS.mandates

type ListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'missing' }
  | { status: 'denied' }
  | { status: 'ready'; mandates: StaffMandateBrief[] }

export function AdminMandatesPage() {
  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useNoIndex('Mandates | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void fetchStaffMandates().then((result) => {
      if (cancelled) return
      if (result.status === 'ready') setList({ status: 'ready', mandates: result.row })
      else if (result.status === 'denied') setList({ status: 'denied' })
      else if (result.status === 'missing') setList({ status: 'missing' })
      else setList({ status: 'error' })
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (list.status === 'loading') {
    return (
      <div className="max-w-3xl">
        <h1 className="font-display text-[2.1rem] font-bold tracking-[-0.03em]">Mandates</h1>
        <div className="mt-8">
          <CardSkeleton tone="staff" label="Loading mandates" />
        </div>
      </div>
    )
  }

  if (list.status === 'denied') return <PermissionState tone="staff" message={copy.denied} />

  if (list.status === 'missing' || list.status === 'error') {
    return (
      <div className="max-w-3xl">
        <h1 className="font-display text-[2.1rem] font-bold tracking-[-0.03em]">Mandates</h1>
        <div className="mt-6">
          <ErrorBanner
            tone="staff"
            message={list.status === 'missing' ? copy.missing : copy.error}
            retryLabel={copy.retry}
            onRetry={() => {
              setList({ status: 'loading' })
              setAttempt((value) => value + 1)
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-lavender)] uppercase">Desk</p>
      <h1 className="mt-3 font-display text-[2.1rem] font-bold tracking-[-0.03em]">Mandates</h1>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-pearl/70">{copy.intro}</p>
      {list.mandates.length === 0 ? (
        <div className="mt-8">
          <EmptyState tone="staff" message={copy.empty} />
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {list.mandates.map((mandate) => (
            <MandateDeskCard key={mandate.id} mandate={mandate} />
          ))}
        </ul>
      )}
    </div>
  )
}

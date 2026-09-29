import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchStaffMandateMatches } from '../../lib/mandateMatchApi'
import { isMandateId, shortlistText, type StaffMandateMatch } from '../../lib/mandateMatch'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, EmptyState, ErrorBanner, PermissionState } from '../../shell/ViewState'
import { STAFF_VIEWS } from '../../shell/viewCopy'
import { MandateShortlist } from './MandateShortlist'

const copy = STAFF_VIEWS.mandates

type MatchState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'missing' }
  | { status: 'denied' }
  | { status: 'absent' }
  | { status: 'ready'; mandate: StaffMandateMatch }

export function AdminMandateMatchPage() {
  const { mandateId = '' } = useParams()
  const [state, setState] = useState<MatchState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')
  useNoIndex('Mandate shortlist | Board Arabia')

  useEffect(() => {
    if (!isMandateId(mandateId)) {
      setState({ status: 'absent' })
      return
    }
    let cancelled = false
    void fetchStaffMandateMatches(mandateId).then((result) => {
      if (cancelled) return
      if (result.status === 'ready') setState({ status: 'ready', mandate: result.row })
      else if (result.status === 'denied') setState({ status: 'denied' })
      else if (result.status === 'missing') setState({ status: 'missing' })
      else if (result.status === 'absent') setState({ status: 'absent' })
      else setState({ status: 'error' })
    })
    return () => {
      cancelled = true
    }
  }, [attempt, mandateId])

  async function copyShortlist(mandate: StaffMandateMatch) {
    setCopyError('')
    const text = shortlistText(mandate, mandate.matches)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
      setCopyError(copy.copyFailed)
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="max-w-3xl">
        <h1 className="font-display text-[2.1rem] font-bold tracking-[-0.03em]">Mandate</h1>
        <div className="mt-8">
          <CardSkeleton tone="staff" label="Loading shortlist" />
        </div>
      </div>
    )
  }

  if (state.status === 'denied') return <PermissionState tone="staff" message={copy.denied} />

  if (state.status === 'absent') {
    return (
      <div className="max-w-3xl">
        <h1 className="font-display text-[2.1rem] font-bold tracking-[-0.03em]">Mandate</h1>
        <div className="mt-6">
          <EmptyState tone="staff" message={copy.notFound} action={{ label: 'All mandates', to: '/admin/mandates' }} />
        </div>
      </div>
    )
  }

  if (state.status === 'missing' || state.status === 'error') {
    return (
      <div className="max-w-3xl">
        <h1 className="font-display text-[2.1rem] font-bold tracking-[-0.03em]">Mandate</h1>
        <div className="mt-6">
          <ErrorBanner
            tone="staff"
            message={state.status === 'missing' ? copy.missing : copy.error}
            retryLabel={copy.retry}
            onRetry={() => {
              setState({ status: 'loading' })
              setAttempt((value) => value + 1)
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <MandateShortlist
      mandate={state.mandate}
      matches={state.mandate.matches}
      copied={copied}
      copyError={copyError}
      onCopy={() => void copyShortlist(state.mandate)}
    />
  )
}

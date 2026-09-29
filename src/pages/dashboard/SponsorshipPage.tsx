import { useEffect, useState } from 'react'
import { fetchSponsorDesk } from '../../lib/supabase'
import { sponsorDeskDenied, type SponsorDesk } from '../../lib/sponsorDesk'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, ErrorBanner, PermissionState } from '../../shell/ViewState'
import { useMember } from './context'
import { SponsorshipView } from './SponsorshipView'

export function SponsorshipPage() {
  const { member } = useMember()
  const sponsor = member.seat === 'sponsor'
  const [desk, setDesk] = useState<SponsorDesk | null>(null)
  const [error, setError] = useState('')
  const [denied, setDenied] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useNoIndex('Sponsorship | Board Arabia')

  useEffect(() => {
    if (!sponsor) return
    let cancelled = false
    void fetchSponsorDesk().then((result) => {
      if (cancelled) return
      if ('error' in result) {
        setDesk(null)
        if (sponsorDeskDenied(result.error)) {
          setDenied(true)
          return
        }
        setError(result.error || 'Could not load sponsorship.')
        return
      }
      setDenied(false)
      setError('')
      setDesk(result.desk)
    })
    return () => {
      cancelled = true
    }
  }, [attempt, sponsor])

  if (!sponsor || denied) {
    return <PermissionState tone="member" message="This page is for sponsor seats." />
  }
  if (error) {
    return (
      <div className="max-w-xl">
        <ErrorBanner tone="member" message={error} retryLabel="Retry" onRetry={() => setAttempt((value) => value + 1)} />
      </div>
    )
  }
  if (!desk) return <CardSkeleton tone="member" label="Loading sponsorship" />
  return <SponsorshipView desk={desk} />
}

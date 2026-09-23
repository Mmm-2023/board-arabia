import { useEffect, useState } from 'react'
import { isProfileReady, loadFoundingAdmitted } from '../../lib/directoryGate'
import { supabase } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { useMember } from './context'
import { DirectoryEmpty, type SeatCountState } from './DirectoryEmpty'

export function DirectoryPage() {
  const { profile, member } = useMember()
  const [seat, setSeat] = useState<SeatCountState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useNoIndex('Directory | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void loadFoundingAdmitted(async () => {
      const { data, error } = await supabase
        .from('platform_stats')
        .select('founding_admitted_count')
        .eq('id', 1)
        .maybeSingle()
      return {
        count: data?.founding_admitted_count,
        failed: Boolean(error) || data == null,
      }
    }).then((result) => {
      if (!cancelled) setSeat(result)
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  return (
    <DirectoryEmpty
      seat={seat}
      profileReady={isProfileReady(profile)}
      invitesRemaining={member.invites_remaining}
      onRetry={() => {
        setSeat({ status: 'loading' })
        setAttempt((value) => value + 1)
      }}
    />
  )
}

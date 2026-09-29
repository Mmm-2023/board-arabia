import { useEffect, useState } from 'react'
import { fetchDirectory } from '../../lib/demoFetch'
import type { DirectoryCard } from '../../lib/demoRows'
import { isProfileReady, loadFoundingAdmitted } from '../../lib/directoryGate'
import { supabase } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, ErrorBanner } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { useMember } from './context'
import { DirectoryBoard } from './DirectoryBoard'
import { DirectoryEmpty, type SeatCountState } from './DirectoryEmpty'

type ListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; cards: DirectoryCard[] }

export function DirectoryPage() {
  const { profile, member } = useMember()
  const [seat, setSeat] = useState<SeatCountState>({ status: 'loading' })
  const [list, setList] = useState<ListState>({ status: 'loading' })
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
    void fetchDirectory().then((result) => {
      if (cancelled) return
      if (result.status === 'error') {
        setList({ status: 'error' })
        return
      }
      setList({ status: 'ready', cards: result.status === 'ready' ? result.rows : [] })
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (list.status === 'loading') {
    return (
      <div className="max-w-3xl">
        <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Directory</p>
        <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.03em]">Directory</h1>
        <div className="mt-8">
          <CardSkeleton tone="member" label="Loading directory" />
        </div>
      </div>
    )
  }

  if (list.status === 'error') {
    return (
      <div className="max-w-3xl">
        <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">Directory</p>
        <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.03em]">Directory</h1>
        <div className="mt-8">
          <ErrorBanner
            tone="member"
            message={MEMBER_VIEWS.directory.error}
            retryLabel={MEMBER_VIEWS.directory.retry}
            onRetry={() => {
              setList({ status: 'loading' })
              setSeat({ status: 'loading' })
              setAttempt((value) => value + 1)
            }}
          />
        </div>
      </div>
    )
  }

  if (list.cards.length === 0) {
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

  return <DirectoryBoard cards={list.cards} seat={seat} />
}

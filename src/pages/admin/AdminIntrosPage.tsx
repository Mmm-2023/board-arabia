import { useEffect, useState } from 'react'
import { SignedAvatar } from '../../components/SignedAvatar'
import { schemaMissing } from '../../lib/demoRows'
import { presentIntroList, type IntroKind, type IntroRow } from '../../lib/memberIntros'
import { supabase } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, ErrorBanner } from '../../shell/ViewState'
import { STAFF_VIEWS } from '../../shell/viewCopy'
import { IntroBoard } from '../dashboard/IntroBoard'
import { DeskIntrosQueue } from './DeskIntrosQueue'

type ListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: IntroRow[] }

export function AdminIntrosPage() {
  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  useNoIndex('Intros | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('staff_list_all_intros').then(({ data, error: rpcError }) => {
      if (cancelled) return
      if (rpcError) {
        if (schemaMissing(rpcError.message)) {
          setList({ status: 'ready', rows: [] })
          return
        }
        setList({ status: 'error' })
        return
      }
      setList({ status: 'ready', rows: presentIntroList(data) })
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  async function onDecide(
    id: string,
    kind: 'mandate' | 'real_estate' | 'partner',
    decision: 'approved' | 'declined',
  ) {
    const row = list.status === 'ready' ? list.rows.find((item) => item.id === id && item.kind === kind) : null
    if (row?.is_demo) return
    setError('')
    setBusyId(id)
    const { error: rpcError } = await supabase.rpc(decideRpc(kind), {
      p_intro_id: id,
      p_decision: decision,
    })
    setBusyId(null)
    if (rpcError) {
      setError(/sample_blocked/i.test(rpcError.message) ? 'Sample requests stay as they are.' : 'Could not save that decision. Retry.')
      return
    }
    setList({ status: 'loading' })
    setAttempt((value) => value + 1)
  }

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Intros</h1>
      <p className="mt-2 max-w-2xl text-[0.95rem] text-stone/65">
        Every intro request and its status. Members accept or decline a warm introduction. Mandate and real estate unlocks are still approved here.
      </p>
      <div className="mt-8">
        <DeskIntrosQueue />
      </div>
      <div className="mt-8">
        {list.status === 'loading' ? <CardSkeleton tone="staff" label="Loading intros" /> : null}
        {list.status === 'error' ? (
          <ErrorBanner
            tone="staff"
            message={STAFF_VIEWS.home.error}
            retryLabel={STAFF_VIEWS.home.retry}
            onRetry={() => {
              setList({ status: 'loading' })
              setAttempt((value) => value + 1)
            }}
          />
        ) : null}
        {list.status === 'ready' ? (
          <IntroBoard
            tone="staff"
            rows={list.rows}
            busyId={busyId}
            error={error}
            onDecide={(id, kind, decision) => void onDecide(id, kind, decision)}
            portrait={(row) => (
              <SignedAvatar path={row.avatar_path ?? null} avatarStyle={row.avatar_style} size={48} alt="" />
            )}
          />
        ) : null}
      </div>
    </div>
  )
}

function decideRpc(kind: Exclude<IntroKind, 'member'>) {
  if (kind === 'mandate') return 'staff_decide_mandate_intro' as const
  if (kind === 'real_estate') return 'staff_decide_re_opportunity_intro' as const
  return 'staff_decide_re_partner_intro' as const
}

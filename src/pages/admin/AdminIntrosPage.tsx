import { useEffect, useState } from 'react'
import { SignedAvatar } from '../../components/SignedAvatar'
import { schemaMissing } from '../../lib/demoRows'
import { introDealError, presentIntroDeals } from '../../lib/introFunnel'
import { presentIntroList, type IntroKind, type IntroRow } from '../../lib/memberIntros'
import { supabase } from '../../lib/supabase'
import { useNoIndex } from '../../lib/usePageTitle'
import { CardSkeleton, ErrorBanner } from '../../shell/ViewState'
import { STAFF_VIEWS } from '../../shell/viewCopy'
import { IntroBoard } from '../dashboard/IntroBoard'
import { DeskIntrosQueue } from './DeskIntrosQueue'
import { IntroFunnel } from './IntroFunnel'

type ListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: IntroRow[] }

export function AdminIntrosPage() {
  const [list, setList] = useState<ListState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [deals, setDeals] = useState<Record<string, string>>({})
  const [funnelAttempt, setFunnelAttempt] = useState(0)
  useNoIndex('Intros | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void Promise.all([supabase.rpc('staff_list_all_intros'), supabase.rpc('staff_list_intro_deals')]).then(
      ([listResult, dealResult]) => {
        if (cancelled) return
        if (listResult.error) {
          if (schemaMissing(listResult.error.message)) {
            setList({ status: 'ready', rows: [] })
          } else {
            setList({ status: 'error' })
          }
        } else {
          setList({ status: 'ready', rows: presentIntroList(listResult.data) })
        }
        if (!dealResult.error) setDeals(presentIntroDeals(dealResult.data))
        else if (schemaMissing(dealResult.error.message)) setDeals({})
      },
    )
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

  async function onDeal(id: string, started: boolean) {
    const row = list.status === 'ready' ? list.rows.find((item) => item.id === id && item.kind === 'member') : null
    if (row?.is_demo) return
    setError('')
    setBusyId(id)
    const { error: rpcError } = await supabase.rpc('staff_set_intro_deal', {
      p_intro_id: id,
      p_started: started,
    })
    setBusyId(null)
    if (rpcError) {
      setError(introDealError(rpcError.message))
      return
    }
    setList({ status: 'loading' })
    setAttempt((value) => value + 1)
    setFunnelAttempt((value) => value + 1)
  }

  return (
    <div className="max-w-3xl min-w-0 overflow-x-hidden">
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Intros</h1>
      <p className="mt-2 max-w-2xl text-[0.95rem] text-stone/65">
        Every intro request and its status. Members accept or decline a warm introduction. Mandate and real estate unlocks are still approved here.
      </p>
      <div className="mt-8">
        <IntroFunnel attempt={funnelAttempt} />
      </div>
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
            onDeal={(id, started) => void onDeal(id, started)}
            dealStartedAt={deals}
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

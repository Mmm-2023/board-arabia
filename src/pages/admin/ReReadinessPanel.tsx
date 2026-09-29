import { useEffect, useState } from 'react'
import { fetchReOpportunities } from '../../lib/demoFetch'
import {
  readinessSaveArgs,
  RE_READINESS_STAFF,
  type ReReadinessDraft,
} from '../../lib/reOpportunityView'
import { type ReOpportunityCard, type ReOpportunityInventory } from '../../lib/reRedaction'
import { supabase } from '../../lib/supabase'
import { ReReadinessEditor, type ReReadinessEditorStatus } from './ReReadinessEditor'

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'denied' }
  | { status: 'unavailable' }
  | { status: 'ready'; cards: ReOpportunityCard[] }

export function ReReadinessPanel() {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [alert, setAlert] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchReOpportunities().then((result) => {
      if (cancelled) return
      if (result.status === 'error' || result.status === 'missing') {
        setLoad(result.status === 'missing' ? { status: 'unavailable' } : { status: 'error' })
        return
      }
      if (result.status === 'denied') {
        setLoad({ status: 'denied' })
        return
      }
      setLoad({ status: 'ready', cards: result.rows })
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  async function onSave(card: ReOpportunityInventory, draft: ReReadinessDraft) {
    const args = readinessSaveArgs(card.id, draft)
    if (!args || card.is_demo) return
    setBusyId(card.id)
    setNotice(null)
    setAlert(null)
    const { error } = await supabase.rpc('staff_set_re_opportunity_readiness', args)
    setBusyId(null)
    if (error) {
      setAlert(/demo_locked/i.test(error.message) ? RE_READINESS_STAFF.demo : RE_READINESS_STAFF.error)
      return
    }
    setNotice(RE_READINESS_STAFF.saved)
    setAttempt((value) => value + 1)
  }

  const status: ReReadinessEditorStatus = load.status
  return (
    <ReReadinessEditor
      status={status}
      cards={load.status === 'ready' ? load.cards : []}
      busyId={busyId}
      notice={notice}
      alert={alert}
      onRetry={() => {
        setAlert(null)
        setLoad({ status: 'loading' })
        setAttempt((value) => value + 1)
      }}
      onSave={(card, draft) => void onSave(card, draft)}
    />
  )
}

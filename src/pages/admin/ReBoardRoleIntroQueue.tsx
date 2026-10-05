import { useEffect, useState } from 'react'
import { schemaMissing } from '../../lib/demoRows'
import { parseReBoardRoleIntros, type ReBoardRoleIntroRow } from '../../lib/reBoardRoles'
import { supabase } from '../../lib/supabase'
import { ReBoardRoleIntroList } from './ReBoardRoleIntroList'

export function ReBoardRoleIntroQueue() {
  const [rows, setRows] = useState<ReBoardRoleIntroRow[] | null>(null)
  const [error, setError] = useState(false)
  const [declineId, setDeclineId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('staff_list_re_board_role_intros').then(({ data, error: rpcError }) => {
      if (cancelled) return
      if (rpcError) {
        if (schemaMissing(rpcError.message)) {
          setRows([])
          return
        }
        setError(true)
        setRows([])
        return
      }
      setError(false)
      setRows(parseReBoardRoleIntros(data))
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  async function decide(id: string, decision: 'approved' | 'declined') {
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('staff_decide_re_board_role_intro', {
      p_intro_id: id,
      p_decision: decision,
    })
    setBusy(false)
    setDeclineId(null)
    if (rpcError) {
      setError(true)
      return
    }
    setAttempt((value) => value + 1)
  }

  return (
    <ReBoardRoleIntroList
      rows={rows}
      error={error}
      busy={busy}
      declineId={declineId}
      onApprove={(id) => void decide(id, 'approved')}
      onDecline={setDeclineId}
      onCancelDecline={() => setDeclineId(null)}
      onConfirmDecline={() => {
        if (declineId) void decide(declineId, 'declined')
      }}
    />
  )
}

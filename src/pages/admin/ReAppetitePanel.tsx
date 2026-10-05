import { useEffect, useState } from 'react'
import { schemaMissing } from '../../lib/demoRows'
import { parseReAppetiteStaffList, type ReAppetiteStaffRow } from '../../lib/reAppetite'
import { supabase } from '../../lib/supabase'
import { ReAppetiteStaffView, type ReAppetiteStaffStatus } from './ReAppetiteStaffView'

type LoadState =
  | { status: Exclude<ReAppetiteStaffStatus, 'ready'> }
  | { status: 'ready'; rows: ReAppetiteStaffRow[] }

export function ReAppetitePanel() {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('staff_list_re_appetites').then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        if (schemaMissing(error.message)) {
          setLoad({ status: 'unavailable' })
          return
        }
        const code = 'code' in error ? String(error.code) : ''
        if (code === '42501' || /not_allowed/i.test(error.message)) {
          setLoad({ status: 'denied' })
          return
        }
        setLoad({ status: 'error' })
        return
      }
      setLoad({ status: 'ready', rows: parseReAppetiteStaffList(data) })
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  return (
    <ReAppetiteStaffView
      status={load.status}
      rows={load.status === 'ready' ? load.rows : []}
      onRetry={() => {
        setLoad({ status: 'loading' })
        setAttempt((value) => value + 1)
      }}
    />
  )
}

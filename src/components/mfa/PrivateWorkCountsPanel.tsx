import { useEffect, useState } from 'react'
import { parsePrivateWorkCounts, type PrivateWorkCounts } from '../../lib/mfaFlow'
import { schemaMissing } from '../../lib/demoRows'
import { supabase } from '../../lib/supabase'
import { PrivateWorkCountsView } from './PrivateWorkCountsView'

export function PrivateWorkCountsPanel() {
  const [counts, setCounts] = useState<PrivateWorkCounts | null>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('staff_private_work_counts').then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        if (schemaMissing(error.message)) setHidden(true)
        return
      }
      setCounts(parsePrivateWorkCounts(data))
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (hidden || !counts) return null
  return <PrivateWorkCountsView counts={counts} />
}

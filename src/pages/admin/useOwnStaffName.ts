import { useEffect, useState } from 'react'
import { cleanStaffDisplayName } from '../../lib/staffDisplayName'
import { staffGetOwnDisplayName, staffSetOwnDisplayName } from '../../lib/supabase'

export function useOwnStaffName() {
  const [name, setName] = useState('')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void staffGetOwnDisplayName().then((value) => {
      if (cancelled) return
      setName(value)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function save(draft: string) {
    setError('')
    const cleaned = cleanStaffDisplayName(draft)
    if (!cleaned.ok) {
      setError(cleaned.error)
      return
    }
    setBusy(true)
    const result = await staffSetOwnDisplayName(cleaned.name)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setName(result.name)
  }

  return { name, ready, error, busy, save }
}

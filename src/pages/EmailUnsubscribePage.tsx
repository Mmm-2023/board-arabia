import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useNoIndex } from '../lib/usePageTitle'
import { UnsubscribeConfirm } from './EmailUnsubscribeView'

export function EmailUnsubscribePage() {
  const [params] = useSearchParams()
  const token = params.get('t') ?? ''
  const [done, setDone] = useState(false)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  useNoIndex('Unsubscribe | Board Arabia')

  async function confirm() {
    if (!token || busy || done) return
    setBusy(true)
    setError(false)
    const { error: failed } = await supabase.rpc('email_unsubscribe', {
      p_token: token,
      p_source: 'unsubscribe_link',
    })
    setBusy(false)
    if (failed) {
      setError(true)
      return
    }
    setDone(true)
  }

  return (
    <UnsubscribeConfirm
      tokenPresent={token.length > 0}
      done={done}
      error={error}
      busy={busy}
      onConfirm={() => void confirm()}
    />
  )
}

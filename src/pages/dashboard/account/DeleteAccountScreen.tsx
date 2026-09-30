import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { endAuthSession } from '../../../lib/endSession'
import { deleteCandidateAccount, supabase } from '../../../lib/supabase'
import { DeleteAccountView } from './DeleteAccountView'

export function DeleteAccountScreen() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onConfirm() {
    setBusy(true)
    setError('')
    const result = await deleteCandidateAccount()
    if (result.error) {
      setBusy(false)
      setError(result.error)
      return
    }
    await endAuthSession(supabase)
    navigate('/', { replace: true })
  }

  return <DeleteAccountView busy={busy} error={error} onConfirm={() => void onConfirm()} />
}

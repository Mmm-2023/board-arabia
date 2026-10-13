import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { endAuthSession } from '../../../lib/endSession'
import { deleteCandidateAccount, sendAccountDeleteCode, supabase } from '../../../lib/supabase'
import { useNoIndex } from '../../../lib/usePageTitle'
import { DeleteAccountView } from './DeleteAccountView'

export function DeleteAccountScreen({ heading = 'Delete account' }: { heading?: string }) {
  const navigate = useNavigate()
  const [step, setStep] = useState<'explain' | 'code'>('explain')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  useNoIndex(`${heading} | Board Arabia`)

  async function onSendCode() {
    setBusy(true)
    setError('')
    const result = await sendAccountDeleteCode()
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setSent(true)
  }

  async function onConfirm() {
    setBusy(true)
    setError('')
    const result = await deleteCandidateAccount(code)
    if (result.error) {
      setBusy(false)
      setError(result.error)
      return
    }
    await endAuthSession(supabase)
    navigate('/', { replace: true })
  }

  return (
    <DeleteAccountView
      heading={heading}
      step={step}
      busy={busy}
      error={error}
      code={code}
      sent={sent}
      onCode={setCode}
      onContinue={() => {
        setError('')
        setStep('code')
      }}
      onSendCode={() => void onSendCode()}
      onConfirm={() => void onConfirm()}
    />
  )
}

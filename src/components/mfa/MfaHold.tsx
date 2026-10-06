import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { endAuthSession } from '../../lib/endSession'
import { enrollTotp, listTotpFactors, removeTotpFactor, verifyTotp } from '../../lib/mfa'
import { signOutToLogin } from '../../lib/mfaFlow'
import { supabase } from '../../lib/supabase'
import { Frame, TwoStepChallengeScreen, TwoStepEnrolScreen } from './TwoStepScreens'

export function MfaHold({
  mode,
  tone,
  signOutTo,
  onPassed,
}: {
  mode: 'challenge' | 'enrol'
  tone: 'dark' | 'light'
  signOutTo: '/login' | '/login/staff'
  onPassed: () => void
}) {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [qr, setQr] = useState('')
  const [manualKey, setManualKey] = useState('')
  const [factorId, setFactorId] = useState('')
  const [factors, setFactors] = useState<Array<{ id: string; status: string }>>([])

  useEffect(() => {
    if (mode !== 'enrol') return
    let cancelled = false
    void listTotpFactors().then((rows) => {
      if (!cancelled) setFactors(rows)
    })
    return () => {
      cancelled = true
    }
  }, [mode])

  async function startEnrol() {
    setError('')
    setBusy(true)
    const started = await enrollTotp()
    setBusy(false)
    if (!started.ok) {
      setError(started.error)
      return
    }
    setFactorId(started.factorId)
    setQr(started.qr)
    setManualKey(started.secret)
  }

  async function onVerify(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    const factor = mode === 'challenge' ? (await listTotpFactors()).find((row) => row.status === 'verified') : null
    const id = mode === 'challenge' ? factor?.id || '' : factorId
    if (!id) {
      setBusy(false)
      setError('Add an authenticator app first.')
      return
    }
    const result = await verifyTotp(id, code)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setQr('')
    setManualKey('')
    setCode('')
    onPassed()
  }

  async function onRemove(id: string) {
    setBusy(true)
    setError('')
    const result = await removeTotpFactor(id)
    const rows = await listTotpFactors()
    setFactors(rows)
    setBusy(false)
    if (!result.ok) setError(result.error)
  }

  async function onSignOut() {
    await signOutToLogin({
      endSession: () => endAuthSession(supabase),
      go: (path) => navigate(path, { replace: true }),
      path: signOutTo,
    })
  }

  const screen =
    mode === 'challenge' ? (
      <TwoStepChallengeScreen
        tone={tone}
        code={code}
        error={error}
        busy={busy}
        onCode={setCode}
        onSubmit={(event) => void onVerify(event)}
        onSignOut={() => void onSignOut()}
      />
    ) : (
      <TwoStepEnrolScreen
        tone={tone}
        forced={tone === 'dark'}
        qr={qr}
        manualKey={manualKey}
        code={code}
        error={error}
        factors={factors}
        busy={busy}
        onCode={setCode}
        onVerify={(event) => void onVerify(event)}
        onStart={() => void startEnrol()}
        onRemove={(id) => void onRemove(id)}
      />
    )

  if (tone === 'dark') return <Frame tone="dark">{screen}</Frame>
  return screen
}

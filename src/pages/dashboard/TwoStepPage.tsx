import { useEffect, useState, type FormEvent } from 'react'
import { enrollTotp, listTotpFactors, readAssurance, removeTotpFactor, verifyTotp } from '../../lib/mfa'
import { useNoIndex } from '../../lib/usePageTitle'
import { TwoStepEnrolScreen } from '../../components/mfa/TwoStepScreens'

export function TwoStepPage() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [qr, setQr] = useState('')
  const [manualKey, setManualKey] = useState('')
  const [factorId, setFactorId] = useState('')
  const [factors, setFactors] = useState<Array<{ id: string; status: string }>>([])
  const [ready, setReady] = useState(false)
  useNoIndex('Two-step sign-in | Board Arabia')

  useEffect(() => {
    let cancelled = false
    void listTotpFactors().then((rows) => {
      if (cancelled) return
      setFactors(rows)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

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
    setBusy(true)
    setError('')
    const result = await verifyTotp(factorId, code)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setQr('')
    setManualKey('')
    setCode('')
    setFactors(await listTotpFactors())
    await readAssurance()
  }

  async function onRemove(id: string) {
    setBusy(true)
    const result = await removeTotpFactor(id)
    setFactors(await listTotpFactors())
    setBusy(false)
    if (!result.ok) setError(result.error)
  }

  if (!ready) return <p className="text-ink/60">Loading…</p>

  return (
    <TwoStepEnrolScreen
      tone="light"
      forced={false}
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
}

import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { toneClasses } from '../../shell/ViewState'

const fieldClass =
  'mt-2 block w-full min-h-11 max-w-[8rem] border border-pearl/20 bg-ink px-3 text-[1rem] text-pearl'

export function IntroAllowancePanel() {
  const styles = toneClasses('staff')
  const [limit, setLimit] = useState('5')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void supabase.rpc('staff_get_intro_monthly_limit').then(({ data, error: rpcError }) => {
      if (cancelled) return
      setLoaded(true)
      if (rpcError || !data || typeof data !== 'object' || Array.isArray(data)) return
      const value = (data as { monthly_limit?: unknown }).monthly_limit
      if (typeof value === 'number' && Number.isFinite(value)) setLimit(String(value))
    })
    return () => {
      cancelled = true
    }
  }, [attempt])

  async function onSave(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNote('')
    const next = Number(limit)
    if (!Number.isInteger(next) || next < 1 || next > 100) {
      setError('Use a whole number from 1 to 100.')
      return
    }
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('staff_set_intro_monthly_limit', { p_limit: next })
    setBusy(false)
    if (rpcError) {
      setError('Could not save the allowance. Retry.')
      return
    }
    setNote('Saved.')
    setAttempt((value) => value + 1)
  }

  return (
    <section className={`${styles.panel} mt-8 px-5 py-5`} aria-label="Introduction allowance">
      <h2 className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>
        Introduction allowance
      </h2>
      <p className="mt-3 text-[1rem] leading-relaxed text-pearl/80">
        Members can request this many introductions each calendar month, Riyadh time. Partners also receive the introduction credits on their package.
      </p>
      <form className="mt-4" onSubmit={(event) => void onSave(event)}>
        <label className="block text-[0.95rem] text-pearl/80" htmlFor="intro-monthly-limit">
          Monthly limit
          <input
            id="intro-monthly-limit"
            inputMode="numeric"
            value={limit}
            disabled={!loaded || busy}
            onChange={(event) => setLimit(event.target.value.replace(/[^\d]/g, '').slice(0, 3))}
            className={fieldClass}
          />
        </label>
        {error ? (
          <p className="mt-3 text-[0.95rem] text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        {note ? <p className="mt-3 text-[0.95rem] text-pearl/80">{note}</p> : null}
        <button
          type="submit"
          disabled={!loaded || busy}
          className="ba-primary mt-4 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save allowance'}
        </button>
      </form>
    </section>
  )
}

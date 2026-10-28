import { useEffect, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useMember } from './context'

const fieldClass =
  'mt-2 w-full min-h-12 border border-ink/15 bg-white/70 px-4 py-3 text-[1rem] text-ink outline-none placeholder:text-ink/30 focus:border-brass'

/** Password lives with sign-in. /dashboard/profile#password opens this form. */
export function SetPasswordForm() {
  const { userId, member, reload } = useMember()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [passwordNote, setPasswordNote] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const { hash } = useLocation()

  useEffect(() => {
    if (hash !== '#password') return
    let frame = 0
    const jump = () => {
      const form = document.getElementById('password')
      if (!(form instanceof HTMLElement)) return
      const header = document.querySelector('header')
      const headerHeight = header instanceof HTMLElement ? header.getBoundingClientRect().height : 0
      const top = form.getBoundingClientRect().top + window.scrollY - headerHeight - 12
      window.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
      const input = form.querySelector('input')
      if (input instanceof HTMLInputElement) input.focus({ preventScroll: true })
    }
    jump()
    frame = requestAnimationFrame(jump)
    return () => cancelAnimationFrame(frame)
  }, [hash])

  async function onSetPassword(event: FormEvent) {
    event.preventDefault()
    setPasswordError('')
    setPasswordNote('')
    if (password.length < 12) {
      setPasswordError('Use at least 12 characters.')
      return
    }
    if (password !== confirm) {
      setPasswordError('Those passwords do not match.')
      return
    }
    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setSavingPassword(false)
      setPasswordError(error.message)
      return
    }
    const { data: cleared, error: flagError } = await supabase
      .from('members')
      .update({ must_set_password: false })
      .eq('user_id', userId)
      .select('must_set_password')
      .maybeSingle()
    setSavingPassword(false)
    if (flagError || !cleared || cleared.must_set_password) {
      setPasswordNote('Password saved. Refresh if the reminder stays.')
      return
    }
    setPassword('')
    setConfirm('')
    setPasswordNote('Password saved.')
    await reload()
  }

  return (
    <form id="password" onSubmit={onSetPassword} className="scroll-mt-24">
      <h2 className="font-display text-[1.6rem] font-semibold tracking-[-0.03em]">Password</h2>
      <p className="mt-3 text-[0.98rem] leading-relaxed text-ink/60">
        {member.must_set_password
          ? 'Replace the invitation with a password only you know.'
          : 'Choose a new password for this dashboard.'}
      </p>
      <div className="mt-6 space-y-5">
        <label className="block" htmlFor="new-password">
          <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">New password</span>
          <input
            id="new-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            className={fieldClass}
          />
        </label>
        <label className="block" htmlFor="confirm-password">
          <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">Confirm</span>
          <input
            id="confirm-password"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            className={fieldClass}
          />
        </label>
      </div>
      {passwordError ? (
        <p className="mt-4 text-[0.92rem] text-[var(--ba-error)]" role="alert">
          {passwordError}
        </p>
      ) : null}
      {passwordNote ? <p className="mt-4 text-[0.92rem] text-ink/70">{passwordNote}</p> : null}
      <button
        type="submit"
        disabled={savingPassword}
        className="ba-primary mt-6 inline-flex min-h-12 items-center px-5 py-3 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-50"
      >
        {savingPassword ? 'Saving…' : 'Set password'}
      </button>
    </form>
  )
}

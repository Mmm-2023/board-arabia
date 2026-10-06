import { useEffect, useRef, useState, type ReactNode } from 'react'
import { fetchSponsorDesk, supabase } from '../../lib/supabase'
import { useMember } from './context'
import { SponsorWelcome, type SponsorWelcomeAllowances } from './SponsorWelcome'

export const DISMISS_SAVE_ERROR = 'We could not save that. Please try again.'

type DismissRpc = (name: 'dismiss_sponsor_welcome') => PromiseLike<{ error: { message?: string } | null }>

export function welcomeAfterDismiss(
  result: { hidden: true } | { hidden: false; message: string },
): { open: boolean; error: string } {
  if (result.hidden) return { open: false, error: '' }
  return { open: true, error: result.message }
}

/** Awaits the dismissal. A throw becomes the same plain message as a returned error. */
export async function dismissSponsorWelcome(
  rpc: DismissRpc,
): Promise<{ hidden: true } | { hidden: false; message: string }> {
  try {
    const { error } = await rpc('dismiss_sponsor_welcome')
    if (error) return { hidden: false, message: DISMISS_SAVE_ERROR }
    return { hidden: true }
  } catch {
    return { hidden: false, message: DISMISS_SAVE_ERROR }
  }
}

/** Takes the lock, awaits the dismissal, and always releases the lock. */
export async function runDismiss(
  rpc: DismissRpc,
  lock: { current: boolean },
  setSaving: (saving: boolean) => void,
): Promise<{ open: boolean; error: string } | null> {
  if (lock.current) return null
  lock.current = true
  setSaving(true)
  try {
    const result = await dismissSponsorWelcome(rpc)
    return welcomeAfterDismiss(result)
  } catch {
    return { open: true, error: DISMISS_SAVE_ERROR }
  } finally {
    lock.current = false
    setSaving(false)
  }
}

export function SponsorWelcomeDismissFrame({
  saving,
  error,
  children,
}: {
  saving: boolean
  error: string
  children: ReactNode
}) {
  return (
    <div data-sponsor-welcome-gate="" aria-busy={saving}>
      <fieldset disabled={saving} className="m-0 min-w-0 border-0 p-0">
        {children}
      </fieldset>
      {error ? (
        <p role="alert" className="mt-3 max-w-3xl text-[0.95rem] leading-relaxed text-ink/70">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function SponsorWelcomeGate() {
  const { member } = useMember()
  const [open, setOpen] = useState(false)
  const [allowances, setAllowances] = useState<SponsorWelcomeAllowances | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const savingRef = useRef(false)

  useEffect(() => {
    if (member.seat !== 'sponsor') return
    let cancel = false
    void (async () => {
      const { data, error } = await supabase.rpc('own_sponsor_welcome')
      if (cancel || error || !data || typeof data !== 'object' || Array.isArray(data)) return
      if ((data as { dismissed?: boolean }).dismissed) return
      const desk = await fetchSponsorDesk()
      if (cancel || 'error' in desk) return
      const pack = desk.desk.package
      setAllowances(
        pack
          ? {
              majlis_slots: pack.majlis_slots,
              intro_credits: pack.intro_credits,
              room_credits: pack.room_credits,
              monthly_base: desk.desk.credits?.intro_base ?? null,
            }
          : null,
      )
      setOpen(true)
    })()
    return () => {
      cancel = true
    }
  }, [member.seat])

  async function dismiss() {
    const next = await runDismiss((name) => supabase.rpc(name), savingRef, setSaving)
    if (!next) return
    setSaveError(next.error)
    setOpen(next.open)
  }

  if (member.seat !== 'sponsor' || !open) return null

  return (
    <SponsorWelcomeDismissFrame saving={saving} error={saveError}>
      <SponsorWelcome allowances={allowances} onDismiss={() => void dismiss()} />
    </SponsorWelcomeDismissFrame>
  )
}

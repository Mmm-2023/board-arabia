import { useEffect, useState } from 'react'
import { fetchSponsorDesk, supabase } from '../../lib/supabase'
import { useMember } from './context'
import { SponsorWelcome, type SponsorWelcomeAllowances } from './SponsorWelcome'

export function SponsorWelcomeGate() {
  const { member } = useMember()
  const [open, setOpen] = useState(false)
  const [allowances, setAllowances] = useState<SponsorWelcomeAllowances | null>(null)

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

  if (member.seat !== 'sponsor' || !open) return null

  return (
    <SponsorWelcome
      allowances={allowances}
      onDismiss={() => {
        setOpen(false)
        void supabase.rpc('dismiss_sponsor_welcome')
      }}
    />
  )
}

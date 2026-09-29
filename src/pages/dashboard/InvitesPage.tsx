import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { sendMemberInvite, supabase } from '../../lib/supabase'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { useMember } from './context'
import { InvitesPanel, SENT_NOTE, type SentInvite } from './InvitesPanel'

export function InvitesPage({ embedded = false }: { embedded?: boolean }) {
  const { member, profile, reload, userId } = useMember()
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState<'email' | 'whatsapp' | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState<SentInvite[]>([])
  const [listError, setListError] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const inviterName = oneLine(profile?.full_name || '') || 'A Board Arabia member'

  const loadSent = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from('member_invites')
      .select('id, token, channel, status, recipient_email, recipient_phone, created_at, expires_at')
      .eq('inviter_member_id', userId)
      .order('created_at', { ascending: false })
    setLoadingList(false)
    if (queryError) {
      setListError(MEMBER_VIEWS.network.error)
      return
    }
    setListError('')
    setSent((data ?? []) as SentInvite[])
  }, [userId])

  useEffect(() => {
    let cancelled = false
    void supabase
      .from('member_invites')
      .select('id, token, channel, status, recipient_email, recipient_phone, created_at, expires_at')
      .eq('inviter_member_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data, error: queryError }) => {
        if (cancelled) return
        setLoadingList(false)
        if (queryError) {
          setListError(MEMBER_VIEWS.network.error)
          return
        }
        setListError('')
        setSent((data ?? []) as SentInvite[])
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const remaining = member.invites_remaining

  async function onEmail(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNote('')
    if (remaining <= 0) {
      setError('No invites remaining.')
      return
    }
    setBusy('email')
    const result = await sendMemberInvite({ channel: 'email', email })
    setBusy(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setEmail('')
    setNote(result.dryRun ? result.message || '' : SENT_NOTE)
    await reload()
    await loadSent()
  }

  async function onWhatsApp(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNote('')
    if (remaining <= 0) {
      setError('No invites remaining.')
      return
    }
    const digits = phone.replace(/\D/g, '')
    if (digits && !/^[0-9]{8,15}$/.test(digits)) {
      setError('Enter a phone number with country code, or leave it blank.')
      return
    }
    setBusy('whatsapp')
    const result = await sendMemberInvite({ channel: 'whatsapp', phone: digits })
    setBusy(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setPhone('')
    if (result.whatsappUrl) window.open(result.whatsappUrl, '_blank', 'noopener,noreferrer')
    setNote(SENT_NOTE)
    await reload()
    await loadSent()
  }

  return (
    <InvitesPanel
      embedded={embedded}
      remaining={remaining}
      inviterName={inviterName}
      email={email}
      phone={phone}
      busy={busy}
      note={note}
      error={error}
      sent={sent}
      listError={listError}
      loadingList={loadingList}
      onEmailChange={setEmail}
      onPhoneChange={setPhone}
      onEmail={(event) => void onEmail(event)}
      onWhatsApp={(event) => void onWhatsApp(event)}
      onRetry={() => void loadSent()}
    />
  )
}

function oneLine(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim().slice(0, 200)
}

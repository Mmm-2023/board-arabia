import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { cleanInviteeName } from '../../../supabase/functions/_shared/invitee_name.ts'
import { missingRecipientNameColumn } from '../../lib/sentInvites'
import { sendMemberInvite, supabase } from '../../lib/supabase'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { useMember } from './context'
import { InvitesPanel, SENT_NOTE, type SentInvite } from './InvitesPanel'

const INVITE_COLUMNS =
  'id, token, channel, status, recipient_email, recipient_phone, recipient_name, created_at, expires_at'
const INVITE_COLUMNS_WITHOUT_NAME =
  'id, token, channel, status, recipient_email, recipient_phone, created_at, expires_at'

export function InvitesPage({ embedded = false }: { embedded?: boolean }) {
  const { member, profile, reload, userId } = useMember()
  const [emailName, setEmailName] = useState('')
  const [whatsAppName, setWhatsAppName] = useState('')
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
    const loaded = await fetchSentInvites(userId)
    setLoadingList(false)
    if (loaded.error) {
      setListError(MEMBER_VIEWS.network.error)
      return
    }
    setListError('')
    setSent(loaded.rows)
  }, [userId])

  useEffect(() => {
    let cancelled = false
    void fetchSentInvites(userId).then((loaded) => {
      if (cancelled) return
      setLoadingList(false)
      if (loaded.error) {
        setListError(MEMBER_VIEWS.network.error)
        return
      }
      setListError('')
      setSent(loaded.rows)
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
    if (!cleanInviteeName(emailName)) {
      setError('Enter their name.')
      return
    }
    setBusy('email')
    const result = await sendMemberInvite({ channel: 'email', email, name: emailName })
    setBusy(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setEmailName('')
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
    if (!cleanInviteeName(whatsAppName)) {
      setError('Enter their name.')
      return
    }
    const digits = phone.replace(/\D/g, '')
    if (digits && !/^[0-9]{8,15}$/.test(digits)) {
      setError('Enter a phone number with country code, or leave it blank.')
      return
    }
    setBusy('whatsapp')
    const result = await sendMemberInvite({ channel: 'whatsapp', phone: digits, name: whatsAppName })
    setBusy(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setWhatsAppName('')
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
      emailName={emailName}
      whatsAppName={whatsAppName}
      email={email}
      phone={phone}
      busy={busy}
      note={note}
      error={error}
      sent={sent}
      listError={listError}
      loadingList={loadingList}
      onEmailNameChange={setEmailName}
      onWhatsAppNameChange={setWhatsAppName}
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

async function fetchSentInvites(userId: string): Promise<{ rows: SentInvite[]; error: boolean }> {
  const first = await supabase
    .from('member_invites')
    .select(INVITE_COLUMNS)
    .eq('inviter_member_id', userId)
    .order('created_at', { ascending: false })
  if (!first.error) return { rows: (first.data ?? []) as SentInvite[], error: false }
  if (!missingRecipientNameColumn(first.error)) return { rows: [], error: true }
  const second = await supabase
    .from('member_invites')
    .select(INVITE_COLUMNS_WITHOUT_NAME)
    .eq('inviter_member_id', userId)
    .order('created_at', { ascending: false })
  if (second.error) return { rows: [], error: true }
  return { rows: (second.data ?? []) as SentInvite[], error: false }
}

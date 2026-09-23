import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { applyInviteUrl, whatsAppInviteUrl } from '../../lib/inviteLink'
import { sendMemberInvite, supabase } from '../../lib/supabase'
import { CardSkeleton } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { useMember } from './context'

type SentInvite = {
  id: string
  token: string
  channel: 'email' | 'whatsapp'
  status: string
  recipient_email: string | null
  recipient_phone: string | null
  created_at: string
  expires_at: string
}

export function InvitesPage({ embedded = false }: { embedded?: boolean }) {
  const { member, reload, userId } = useMember()
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState<'email' | 'whatsapp' | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState<SentInvite[]>([])
  const [listError, setListError] = useState('')
  const [loadingList, setLoadingList] = useState(true)

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
  const blocked = remaining <= 0

  async function onEmail(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNote('')
    if (blocked) {
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
    setNote(result.message || 'Invite emailed.')
    await reload()
    await loadSent()
  }

  async function onWhatsApp(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNote('')
    if (blocked) {
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
    setNote('One invite was used. If WhatsApp did not open, use Open WhatsApp again below.')
    await reload()
    await loadSent()
  }

  return (
    <div className="max-w-3xl">
      {!embedded && (
        <>
          <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">
            Network
          </p>
          <h1 className="mt-3 font-display text-[2.4rem] font-bold tracking-[-0.04em] text-balance md:text-[3rem]">
            Network
          </h1>
        </>
      )}
      <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">
        Invites
      </h2>
      <p className="mt-3 max-w-xl text-[1.02rem] leading-relaxed text-ink/70">
        {MEMBER_VIEWS.network.invites} {remaining} of {member.invites_granted} remaining. Each send
        uses one. Unused invites do not refill. The person you invite still goes through review.
      </p>
      {blocked && (
        <p className="mt-4 border border-ink/10 bg-white/60 px-4 py-3 text-[0.95rem] text-ink/70">
          Both invites are used. A third send is blocked.
        </p>
      )}

      <form onSubmit={(event) => void onEmail(event)} className="mt-10 border border-ink/10 px-5 py-5">
        <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">
          Email
        </h2>
        <label className="mt-4 block text-[0.95rem] text-ink" htmlFor="invite_email">
          Their email
        </label>
        <input
          id="invite_email"
          type="email"
          required
          value={email}
          disabled={blocked || busy !== null}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@company.com"
          className="mt-2 w-full border border-ink/15 bg-white/70 px-4 py-3 text-[1rem] outline-none focus:border-brass"
        />
        <button
          type="submit"
          disabled={blocked || busy !== null}
          className="mt-4 bg-ink px-5 py-3 text-[0.75rem] font-semibold tracking-[0.08em] text-pearl uppercase disabled:opacity-40"
        >
          {busy === 'email' ? 'Sending…' : 'Send email invite'}
        </button>
      </form>

      <form onSubmit={(event) => void onWhatsApp(event)} className="mt-4 border border-ink/10 px-5 py-5">
        <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">
          WhatsApp
        </h2>
        <label className="mt-4 block text-[0.95rem] text-ink" htmlFor="invite_phone">
          Their number (optional)
        </label>
        <input
          id="invite_phone"
          type="tel"
          value={phone}
          disabled={blocked || busy !== null}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="9665…"
          className="mt-2 w-full border border-ink/15 bg-white/70 px-4 py-3 text-[1rem] outline-none focus:border-brass"
        />
        <p className="mt-2 text-[0.85rem] text-ink/45">
          Country code, no spaces. Leave blank to open WhatsApp with the text ready to share.
        </p>
        <button
          type="submit"
          disabled={blocked || busy !== null}
          className="mt-4 border border-ink px-5 py-3 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
        >
          {busy === 'whatsapp' ? 'Opening…' : 'Open WhatsApp'}
        </button>
      </form>

      {error && (
        <p className="mt-4 text-[0.95rem] text-red-800" role="alert">
          {error}
        </p>
      )}
      {note && <p className="mt-4 text-[0.95rem] text-ink/70">{note}</p>}

      <section className="mt-10">
        <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">
          Sent
        </h2>
        {loadingList && <div className="mt-4"><CardSkeleton tone="member" label="Loading invites" /></div>}
        {listError && (
          <p className="mt-3 text-[0.95rem] text-red-800" role="alert">
            {listError}{' '}
            <button type="button" className="underline" onClick={() => void loadSent()}>
              {MEMBER_VIEWS.network.retry}
            </button>
          </p>
        )}
        {sent.length === 0 && !listError && !loadingList && (
          <p className="mt-3 text-[0.95rem] text-ink/50">No invites sent yet.</p>
        )}
        <ul className="mt-4 space-y-3">
          {sent.map((invite) => {
            const applyUrl = applyInviteUrl(window.location.origin, invite.token)
            const whatsappUrl =
              invite.channel === 'whatsapp'
                ? whatsAppInviteUrl(invite.recipient_phone, applyUrl)
                : null
            return (
              <li key={invite.id} className="border border-ink/10 px-4 py-4">
                <p className="text-[0.95rem] text-ink">
                  {invite.channel === 'email' ? 'Email' : 'WhatsApp'}
                  {invite.recipient_email ? ` · ${invite.recipient_email}` : ''}
                  {invite.recipient_phone ? ` · ${invite.recipient_phone}` : ''}
                </p>
                <p className="mt-1 text-[0.85rem] text-ink/50">
                  {invite.status} · {new Date(invite.created_at).toLocaleString()}
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
                    onClick={() => void navigator.clipboard.writeText(applyUrl)}
                  >
                    Copy link
                  </button>
                  {whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
                    >
                      Open WhatsApp again
                    </a>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

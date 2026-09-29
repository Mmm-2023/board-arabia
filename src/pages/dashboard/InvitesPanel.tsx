import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { applyInviteUrl, whatsAppInviteUrl } from '../../lib/inviteLink'
import { CardSkeleton } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'

export type SentInvite = {
  id: string
  token: string
  channel: 'email' | 'whatsapp'
  status: string
  recipient_email: string | null
  recipient_phone: string | null
  created_at: string
  expires_at: string
}

const SENT_NOTE = 'Invite sent. They\u2019ll apply with your name attached.'

export function InvitesPanel({
  embedded = false,
  remaining,
  inviterName,
  email,
  phone,
  busy,
  note,
  error,
  sent,
  listError,
  loadingList,
  onEmailChange,
  onPhoneChange,
  onEmail,
  onWhatsApp,
  onRetry,
}: {
  embedded?: boolean
  remaining: number
  inviterName: string
  email: string
  phone: string
  busy: 'email' | 'whatsapp' | null
  note: string
  error: string
  sent: SentInvite[]
  listError: string
  loadingList: boolean
  onEmailChange: (value: string) => void
  onPhoneChange: (value: string) => void
  onEmail: (event: FormEvent) => void
  onWhatsApp: (event: FormEvent) => void
  onRetry: () => void
}) {
  const blocked = remaining <= 0
  const origin = typeof window === 'undefined' ? 'https://boardarabia.com' : window.location.origin

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
        Two invites
      </h2>
      <p className="mt-3 text-[1.02rem] leading-relaxed text-ink">{remaining} of 2 remaining</p>
      <p className="mt-2 max-w-xl text-[1.02rem] leading-relaxed text-ink/70">
        Unused invites do not refill. People you invite are still reviewed.
      </p>
      {blocked ? (
        <div
          className="mt-4 border border-ink/10 bg-white/60 px-4 py-3 text-[0.95rem] leading-relaxed text-ink/70"
          role="status"
        >
          <p>Both peer invites are used. Unused invites do not refill.</p>
          <p className="mt-2 flex flex-wrap gap-x-4">
            <Link to="/dashboard/help" className="inline-flex min-h-11 items-center underline">
              Help
            </Link>
            <Link to="/dashboard/profile" className="inline-flex min-h-11 items-center underline">
              Profile
            </Link>
          </p>
        </div>
      ) : (
        <>
      <form onSubmit={onEmail} className="mt-10 border border-ink/10 px-5 py-5">
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
          onChange={(event) => onEmailChange(event.target.value)}
          placeholder="name@example.com"
          autoComplete="email"
          className="mt-2 w-full border border-ink/15 bg-white/70 px-4 py-3 text-[1rem] outline-none focus:border-brass"
        />
        <button
          type="submit"
          disabled={blocked || busy !== null}
          className="ba-primary mt-4 inline-flex min-h-11 items-center px-5 py-3 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
        >
          {busy === 'email' ? 'Sending…' : 'Send email invite'}
        </button>
      </form>

      <form onSubmit={onWhatsApp} className="mt-4 border border-ink/10 px-5 py-5">
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
          onChange={(event) => onPhoneChange(event.target.value)}
          placeholder="9665…"
          autoComplete="tel"
          className="mt-2 w-full border border-ink/15 bg-white/70 px-4 py-3 text-[1rem] outline-none focus:border-brass"
        />
        <p className="mt-2 text-[0.85rem] text-ink/45">
          Country code, no spaces. Leave blank to open WhatsApp with the text ready to share.
        </p>
        <button
          type="submit"
          disabled={blocked || busy !== null}
          className="mt-4 inline-flex min-h-11 items-center border border-ink px-5 py-3 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
        >
          {busy === 'whatsapp' ? 'Opening…' : 'Open WhatsApp'}
        </button>
      </form>
        </>
      )}

      {error && (
        <p className="mt-4 text-[0.95rem] text-[var(--ba-error)]" role="alert">
          {error}
        </p>
      )}
      {note && <p className="mt-4 text-[0.95rem] text-ink/70">{note}</p>}

      <section className="mt-10" aria-label="Sent invites">
        <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">
          Sent
        </h2>
        {loadingList && <div className="mt-4"><CardSkeleton tone="member" label="Loading invites" /></div>}
        {listError && (
          <p className="mt-3 text-[0.95rem] text-[var(--ba-error)]" role="alert">
            {listError}{' '}
            <button type="button" className="inline-flex min-h-11 items-center underline" onClick={onRetry}>
              {MEMBER_VIEWS.network.retry}
            </button>
          </p>
        )}
        {sent.length === 0 && !listError && !loadingList && (
          <p className="mt-3 text-[0.95rem] text-ink/50">No invites sent yet.</p>
        )}
        <ul className="mt-4 space-y-3">
          {sent.map((invite) => {
            const applyUrl = applyInviteUrl(origin, invite.token)
            const whatsappUrl =
              invite.channel === 'whatsapp'
                ? whatsAppInviteUrl(invite.recipient_phone, applyUrl, inviterName)
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
                    className="inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
                    onClick={() => void navigator.clipboard.writeText(applyUrl)}
                  >
                    Copy link
                  </button>
                  {whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
                    >
                      Open WhatsApp
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

export { SENT_NOTE }

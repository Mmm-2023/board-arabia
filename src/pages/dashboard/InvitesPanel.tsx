import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { sentInviteLabel } from '../../../supabase/functions/_shared/invitee_name.ts'
import { formatInviteSent } from '../../lib/riyadhStamp'
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
  recipient_name?: string | null
  created_at: string
  expires_at: string
}

const SENT_NOTE = 'Invite sent. They\u2019ll apply with your name attached.'
const fieldClass =
  'mt-2 w-full min-h-11 border border-ink/15 bg-white/70 px-4 py-3 text-[1rem] text-ink outline-none placeholder:text-ink/30 focus:border-brass'
const labelClass = 'text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase'

export function InvitesPanel({
  embedded = false,
  remaining,
  inviterName,
  emailName,
  whatsAppName,
  email,
  phone,
  busy,
  note,
  error,
  sent,
  listError,
  loadingList,
  onEmailNameChange,
  onWhatsAppNameChange,
  onEmailChange,
  onPhoneChange,
  onEmail,
  onWhatsApp,
  onRetry,
}: {
  embedded?: boolean
  remaining: number
  inviterName: string
  emailName: string
  whatsAppName: string
  email: string
  phone: string
  busy: 'email' | 'whatsapp' | null
  note: string
  error: string
  sent: SentInvite[]
  listError: string
  loadingList: boolean
  onEmailNameChange: (value: string) => void
  onWhatsAppNameChange: (value: string) => void
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
          <h1 className="font-display text-[2.2rem] font-bold tracking-[-0.03em] text-balance">
            Invites
          </h1>
        </>
      )}
      <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-muted)] uppercase">
        Two invites
      </h2>
      <p className="mt-3 text-[1.02rem] leading-relaxed text-ink">{remaining} of 2 remaining</p>
      <p className="mt-2 max-w-xl text-[1.02rem] leading-relaxed text-ink">
        2 unique invites each week. Unused invites do not stack above 2. People you invite are still reviewed.
      </p>
      {blocked ? (
        <div
          className="mt-4 border border-ink/10 bg-white/60 px-4 py-3 text-[0.95rem] leading-relaxed text-ink/70"
          role="status"
        >
          <p>Both peer invites are used this week. They return to 2 next week and do not stack above 2.</p>
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
      <p className="mt-8 max-w-xl text-[0.95rem] leading-relaxed text-ink/60">
        Add their name so you can tell the invites apart. Only you and our admin team see it.
      </p>
      <form onSubmit={onEmail} className="mt-8 max-w-xl space-y-5">
        <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">
          Email
        </h2>
        <label className="block" htmlFor="invite_email_name">
          <span className={labelClass}>Their name</span>
          <input
            id="invite_email_name"
            type="text"
            required
            maxLength={80}
            value={emailName}
            disabled={blocked || busy !== null}
            onChange={(event) => onEmailNameChange(event.target.value)}
            autoComplete="name"
            className={fieldClass}
          />
        </label>
        <label className="block" htmlFor="invite_email">
          <span className={labelClass}>Their email</span>
          <input
            id="invite_email"
            type="email"
            required
            value={email}
            disabled={blocked || busy !== null}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="name@example.com"
            autoComplete="email"
            className={fieldClass}
          />
        </label>
        <button
          type="submit"
          disabled={blocked || busy !== null}
          className="ba-primary inline-flex min-h-11 items-center px-5 py-3 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
        >
          {busy === 'email' ? 'Sending…' : 'Send email invite'}
        </button>
      </form>

      <form onSubmit={onWhatsApp} className="mt-10 max-w-xl space-y-5">
        <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">
          WhatsApp
        </h2>
        <label className="block" htmlFor="invite_whatsapp_name">
          <span className={labelClass}>Their name</span>
          <input
            id="invite_whatsapp_name"
            type="text"
            required
            maxLength={80}
            value={whatsAppName}
            disabled={blocked || busy !== null}
            onChange={(event) => onWhatsAppNameChange(event.target.value)}
            autoComplete="name"
            className={fieldClass}
          />
        </label>
        <label className="block" htmlFor="invite_phone">
          <span className={labelClass}>Their number (optional)</span>
          <input
            id="invite_phone"
            type="tel"
            value={phone}
            disabled={blocked || busy !== null}
            onChange={(event) => onPhoneChange(event.target.value)}
            placeholder="9665…"
            autoComplete="tel"
            className={fieldClass}
          />
        </label>
        <p className="text-[0.85rem] text-ink/45">
          Country code, no spaces. Leave blank to open WhatsApp with the text ready to share.
        </p>
        <button
          type="submit"
          disabled={blocked || busy !== null}
          className="inline-flex min-h-11 items-center border border-ink px-5 py-3 text-[0.75rem] font-semibold tracking-[0.08em] uppercase disabled:opacity-40"
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
            const label = sentInviteLabel(invite)
            return (
              <li key={invite.id} className="border border-ink/10 px-4 py-4">
                <p className="text-[0.95rem] text-ink">{label.title}</p>
                {label.detail ? <p className="mt-1 text-[0.85rem] text-ink/55">{label.detail}</p> : null}
                <p className="mt-1 text-[0.85rem] text-ink/50">
                  {formatInviteSent(invite.created_at, invite.status)}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center px-1 text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
                    onClick={() => void navigator.clipboard.writeText(applyUrl)}
                  >
                    Copy link
                  </button>
                  {whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center px-1 text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
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

import { Link } from 'react-router-dom'
import {
  DIRECTORY_COPY,
  DIRECTORY_GHOST_COUNT,
  directoryCtas,
  progressLine,
  type DirectoryCtas,
} from '../../lib/directoryGate'

export type SeatCountState =
  | { status: 'loading' }
  | { status: 'ready'; admitted: number }
  | { status: 'error' }

const primaryClass =
  'inline-flex w-full items-center justify-center bg-ink px-5 py-3 text-center text-[0.75rem] font-semibold tracking-[0.08em] text-pearl uppercase lg:w-auto'
const secondaryClass =
  'inline-flex w-full items-center justify-center border border-ink/20 bg-white/40 px-5 py-3 text-center text-[0.75rem] font-semibold tracking-[0.08em] text-ink uppercase lg:w-auto'

export function DirectoryEmpty({
  seat,
  profileReady,
  invitesRemaining,
  onRetry,
}: {
  seat: SeatCountState
  profileReady: boolean
  invitesRemaining: number
  onRetry: () => void
}) {
  const ctas = directoryCtas(profileReady, invitesRemaining)
  const inviteFirst = ctas.primary === 'invite'

  return (
    <div className="max-w-3xl pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">
        {DIRECTORY_COPY.kicker}
      </p>
      <h1 className="mt-3 font-display text-[2.3rem] font-bold tracking-[-0.03em] text-balance md:text-[2.8rem]">
        {DIRECTORY_COPY.heading}
      </h1>
      <p className="mt-4 max-w-xl text-[1.05rem] leading-relaxed text-ink/65">{DIRECTORY_COPY.body}</p>

      <div className="mt-8" aria-live="polite">
        {seat.status === 'loading' ? (
          <p className="flex max-w-xl flex-wrap items-center gap-3 font-display text-[1.55rem] font-semibold leading-normal tracking-[-0.03em] md:text-[1.65rem]">
            <span className="sr-only">Loading the seat count. </span>
            <span className="inline-block h-8 w-12 animate-pulse bg-ink/10" aria-hidden="true" />
            <span>{DIRECTORY_COPY.progressLoading}</span>
          </p>
        ) : null}
        {seat.status === 'ready' ? (
          <p className="max-w-xl font-display text-[1.55rem] font-semibold leading-normal tracking-[-0.03em] md:text-[1.65rem]">
            {progressLine(seat.admitted)}
          </p>
        ) : null}
        {seat.status === 'error' ? (
          <p className="text-[1.05rem] leading-relaxed text-ink/70">
            {DIRECTORY_COPY.progressError}{' '}
            <button
              type="button"
              onClick={onRetry}
              className="border-b border-brass font-semibold text-ink"
            >
              {DIRECTORY_COPY.retry}
            </button>
          </p>
        ) : null}
      </div>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-start">
        {inviteFirst ? <InviteControl ctas={ctas} prominent /> : <CompleteControl prominent />}
        {inviteFirst ? (
          ctas.showComplete ? <CompleteControl prominent={false} /> : null
        ) : (
          <InviteControl ctas={ctas} prominent={false} />
        )}
      </div>

      <p className="mt-12 text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">
        {DIRECTORY_COPY.ghostLabel}
      </p>
      <ul className="mt-4 grid gap-3 lg:grid-cols-2" aria-hidden="true">
        {Array.from({ length: DIRECTORY_GHOST_COUNT }, (_, index) => (
          <li
            key={index}
            className={`border border-ink/10 bg-white/45 px-5 py-5 ${index === 3 ? 'hidden lg:block' : ''}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="h-12 w-12 rounded-full bg-ink/10" />
              <div className="text-right">
                <p className="text-[0.68rem] font-semibold tracking-[0.12em] text-ink/30 uppercase">
                  {DIRECTORY_COPY.seat}
                </p>
                <p className="mt-1 text-[0.85rem] text-ink/25">{DIRECTORY_COPY.seatPlaceholder}</p>
              </div>
            </div>
            <div className="mt-4 h-3 w-2/3 bg-ink/10" />
            <dl className="mt-5 space-y-3">
              <GhostField label={DIRECTORY_COPY.sector} value={DIRECTORY_COPY.sector} />
              <GhostField label={DIRECTORY_COPY.city} value={DIRECTORY_COPY.city} />
              <GhostField label={DIRECTORY_COPY.role} value={DIRECTORY_COPY.role} />
            </dl>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CompleteControl({ prominent }: { prominent: boolean }) {
  return (
    <Link
      to="/dashboard/profile"
      className={prominent ? primaryClass : secondaryClass}
    >
      {DIRECTORY_COPY.complete}
    </Link>
  )
}

function InviteControl({ ctas, prominent }: { ctas: DirectoryCtas; prominent: boolean }) {
  const className = `${prominent ? primaryClass : secondaryClass} disabled:opacity-40`
  return (
    <div className="w-full lg:w-auto">
      {ctas.invite.type === 'link' ? (
        <Link
          to="/dashboard/invites"
          className={className}
          aria-describedby="directory-invite-help"
        >
          {DIRECTORY_COPY.invite}
        </Link>
      ) : (
        <button
          type="button"
          disabled
          className={className}
          aria-describedby="directory-invite-help"
        >
          {DIRECTORY_COPY.invite}
        </button>
      )}
      <p id="directory-invite-help" className="mt-2 text-[0.85rem] text-ink/50">
        {ctas.invite.helper}
      </p>
    </div>
  )
}

function GhostField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.68rem] font-semibold tracking-[0.12em] text-ink/30 uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-[0.95rem] text-ink/25">{value}</dd>
    </div>
  )
}

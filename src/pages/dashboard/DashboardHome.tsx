import { Link } from 'react-router-dom'
import { initials, seatLabel } from '../../lib/member'
import { useNoIndex } from '../../lib/usePageTitle'
import { ErrorBanner, HomeSkeleton, toneClasses } from '../../shell/ViewState'
import { MEMBER_VIEWS } from '../../shell/viewCopy'
import { useDashboardStatus, useMember } from './context'

export function DashboardHome() {
  const { member, profile, email } = useMember()
  const status = useDashboardStatus()
  const name = profile?.full_name?.trim() || ''
  const incomplete = name.length === 0
  const styles = toneClasses('member')
  useNoIndex('Home | Board Arabia')

  if (status.refreshing && !status.updatedAt) {
    return <HomeSkeleton tone="member" />
  }

  const attention = attentionItems(member.must_set_password, member.invites_remaining)
  const primary = primaryAction(incomplete, member.must_set_password, member.invites_remaining)
  const included =
    Boolean(profile?.include_in_public_aggregates) && Boolean(profile?.capacity_verified)

  return (
    <div className="max-w-3xl">
      {status.refreshError && (
        <div className="mb-6">
          <ErrorBanner
            tone="member"
            message={status.refreshError}
            onRetry={status.retry}
            retryLabel={MEMBER_VIEWS.home.retry}
          />
        </div>
      )}

      {incomplete ? (
        <section aria-label="Needs attention">
          <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">
            Home
          </p>
          <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.04em] text-balance md:text-[2.8rem]">
            {MEMBER_VIEWS.home.empty}
          </h1>
          <Link
            to="/dashboard/profile"
            className={`mt-6 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase ${styles.primary}`}
          >
            {MEMBER_VIEWS.home.emptyCta}
          </Link>
          <div className="mt-8" aria-hidden="true">
            <HomeSkeleton tone="member" pulse={false} />
          </div>
        </section>
      ) : (
        <>
          <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-brass uppercase">
            Home
          </p>
          <h1 className="mt-3 font-display text-[2.2rem] font-bold tracking-[-0.04em] text-balance md:text-[2.8rem]">
            {name}
          </h1>

          {attention.length > 0 && (
            <section aria-label="Needs attention" className="mt-8 space-y-3">
              <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">
                Needs attention
              </h2>
              <ul className="space-y-3">
                {attention.map((item) => (
                  <li key={item.title} className={`${styles.panel} px-4 py-4`}>
                    <p className="text-[1rem] text-ink">{item.title}</p>
                    <p className={`mt-1 text-[0.95rem] ${styles.muted}`}>{item.body}</p>
                    <Link
                      to={item.to}
                      className="mt-3 inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass uppercase"
                    >
                      {item.cta}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-label="Status" className="mt-8">
            <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">
              Status
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <article className={`${styles.panel} px-4 py-4`}>
                <p className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>
                  Founding seat
                </p>
                <p className="mt-2 font-display text-[1.35rem] font-semibold tracking-[-0.03em]">
                  {seatLabel(member.seat)}
                </p>
                <p
                  className="mt-3 inline-flex min-h-11 min-w-11 items-center justify-center border border-brass/50 bg-ink px-3 font-display text-[1rem] font-bold text-pearl"
                  aria-label="Badge mark placeholder"
                >
                  {initials(profile?.full_name ?? null, email)}
                </p>
              </article>
              <article className={`${styles.panel} px-4 py-4`}>
                <p className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>
                  Availability
                </p>
                <p className="mt-2 font-display text-[1.35rem] font-semibold tracking-[-0.03em]">
                  Not set
                </p>
                <p className={`mt-2 text-[0.92rem] ${styles.muted}`}>
                  Open, Selective, or At capacity will show here once you can set it.
                </p>
              </article>
              <article className={`${styles.panel} px-4 py-4`}>
                <p className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>
                  Invites remaining
                </p>
                <p className="mt-2 font-display text-[1.35rem] font-semibold tracking-[-0.03em]">
                  {member.invites_remaining} / {member.invites_granted}
                </p>
              </article>
              <article className={`${styles.panel} px-4 py-4`}>
                <p className={`text-[0.72rem] font-semibold tracking-[0.12em] uppercase ${styles.quiet}`}>
                  Your capacity included in platform totals
                </p>
                <p className="mt-2 font-display text-[1.35rem] font-semibold tracking-[-0.03em]">
                  {included ? 'Yes' : 'No'}
                </p>
              </article>
            </div>
          </section>

          <section aria-label="Next actions" className="mt-8">
            <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">
              Next actions
            </h2>
            <Link
              to={primary.to}
              className={`mt-4 inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase ${styles.primary}`}
            >
              {primary.label}
            </Link>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
              <li>
                <Link to="/dashboard/directory" className="inline-flex min-h-11 items-center text-[0.95rem] text-ink/70">
                  Directory
                </Link>
              </li>
              <li>
                <Link to="/dashboard/network" className="inline-flex min-h-11 items-center text-[0.95rem] text-ink/70">
                  Network
                </Link>
              </li>
              <li>
                <Link to="/dashboard/profile" className="inline-flex min-h-11 items-center text-[0.95rem] text-ink/70">
                  Profile
                </Link>
              </li>
            </ul>
          </section>

          <section aria-label="Context" className="mt-10 border-t border-ink/10 pt-8">
            <h2 className="text-[0.72rem] font-semibold tracking-[0.14em] text-ink/40 uppercase">
              Context
            </h2>
            <p className={`mt-3 max-w-xl text-[1rem] leading-relaxed ${styles.muted}`}>
              Directory, mandates, and introductions stay inside this membership. Nothing on this
              page lists another member.
            </p>
            <p className={`mt-3 max-w-xl text-[1rem] leading-relaxed ${styles.muted}`}>
              A LinkedIn announce will live with your profile. This page does not post one.
            </p>
          </section>
        </>
      )}
    </div>
  )
}

function attentionItems(mustSetPassword: boolean, invitesRemaining: number) {
  const items: { title: string; body: string; to: string; cta: string }[] = []
  if (mustSetPassword) {
    items.push({
      title: 'Set your password',
      body: 'Replace the invitation before you leave this session.',
      to: '/dashboard/profile#password',
      cta: 'Complete profile',
    })
  }
  if (invitesRemaining > 0) {
    items.push({
      title: 'Invite wallet',
      body: `${invitesRemaining} peer invite${invitesRemaining === 1 ? '' : 's'} remaining.`,
      to: '/dashboard/network',
      cta: 'Send invite',
    })
  }
  return items
}

function primaryAction(incomplete: boolean, mustSetPassword: boolean, invitesRemaining: number) {
  if (incomplete || mustSetPassword) {
    return { label: 'Complete profile', to: '/dashboard/profile' }
  }
  if (invitesRemaining > 0) {
    return { label: 'Send invite', to: '/dashboard/network' }
  }
  return { label: 'Open mandates', to: '/dashboard/mandates' }
}

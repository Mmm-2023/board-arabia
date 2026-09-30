import { Link } from 'react-router-dom'
import { ExampleMark } from '../../../components/ExampleMark'
import { landingTotalsItems } from '../../../lib/landingTotals'
import type { DisplayTotals } from '../../../lib/platformFloors'
import {
  ACCOUNT_REAL_ESTATE,
  DIRECTORY_ACCOUNT_COPY,
  HOME_TILES,
  LOCK_COPY,
  MAJLIS_ACCOUNT_COPY,
  type AccountDeal,
} from '../../../lib/accountPreview'
import { DueDiligenceMemo } from '../DueDiligenceMemo'
import { fullDraftAnalysis } from '../../../lib/dueDiligenceMemoFixture'

const card = 'border border-[var(--ba-line)] bg-white px-5 py-5'
const primary =
  'ba-primary inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase'

export function LockPanel({ body }: { body: string }) {
  return (
    <section className={`${card} mt-8 border-s-2 border-s-[var(--ba-indigo)]`} aria-label={LOCK_COPY.title}>
      <h2 className="font-display text-[1.45rem] font-semibold tracking-[-0.02em]">{LOCK_COPY.title}</h2>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/75">{body}</p>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Link to="/dashboard/membership" className={primary}>
          {LOCK_COPY.button}
        </Link>
        <Link to="/for-members" className="inline-flex min-h-11 items-center text-[0.95rem] text-ink underline">
          {LOCK_COPY.secondary}
        </Link>
      </div>
      <p className="mt-4 text-[0.92rem] text-ink/55">{LOCK_COPY.footnote}</p>
    </section>
  )
}

function LockMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0">
      <rect x="3.2" y="7" width="9.6" height="6.2" rx="1" fill="currentColor" />
      <path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function LockedLine({ children }: { children: string }) {
  return (
    <p className="mt-4 flex min-h-11 items-center gap-3 text-[1rem] leading-relaxed text-ink/70">
      <LockMark />
      <span>{children}</span>
    </p>
  )
}

export function AccountHomeView({
  totals,
  totalsState,
  onRetryTotals,
  showWelcome,
  onDismissWelcome,
}: {
  totals: DisplayTotals | null
  totalsState: 'loading' | 'ready' | 'error'
  onRetryTotals: () => void
  showWelcome: boolean
  onDismissWelcome: () => void
}) {
  return (
    <div className="account-main max-w-5xl lg:pe-8" data-screen="account-home">
      {showWelcome ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-4 sm:items-center" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-welcome-title"
            className="w-full max-w-lg border border-[var(--ba-line)] bg-[var(--ba-porcelain)] px-5 py-6"
          >
            <h2 id="account-welcome-title" className="font-display text-[1.8rem] font-semibold tracking-[-0.03em]">
              Your account is open
            </h2>
            <ul className="mt-4 space-y-3 text-[1rem] leading-relaxed text-ink/80">
              <li>Look around: every section is here, with member-only content locked.</li>
              <li>Complete your credentials: seven short steps, saved as you go.</li>
              <li>Request full membership: the desk reviews every request personally.</li>
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/dashboard/membership" className={primary} onClick={onDismissWelcome}>
                Start with your credentials
              </Link>
              <button
                type="button"
                className="inline-flex min-h-11 items-center px-3 text-[0.95rem] text-ink underline"
                onClick={onDismissWelcome}
              >
                Look around first
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-indigo)] uppercase">Needs attention</p>
      <section className={`${card} mt-3 bg-[var(--ba-porcelain)]`}>
        <h2 className="font-display text-[1.7rem] font-semibold tracking-[-0.03em]">Your path to full membership</h2>
        <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/75">
          Your account is open. Member-only sections stay locked until the desk approves full membership.
        </p>
        <Link to="/dashboard/membership" className={`${primary} mt-5`}>
          Request full membership
        </Link>
      </section>

      <h2 className="mt-10 font-display text-[1.35rem] font-semibold tracking-[-0.02em]">What full members use</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {HOME_TILES.map((tile) => (
          <li key={tile.id}>
            <Link to={tile.to} className={`${card} block min-h-11`} aria-label={`${tile.label}, locked`}>
              <span className="font-display text-[1.15rem] font-semibold">{tile.label}</span>
              <span className="mt-2 block text-[0.95rem] leading-relaxed text-ink/65">{tile.line}</span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-10" aria-label="Your pulse">
        <h2 className="font-display text-[1.35rem] font-semibold tracking-[-0.02em]">Your pulse</h2>
        <LockedLine>Activity stays locked until full membership.</LockedLine>
      </section>

      <TotalsSection totals={totals} totalsState={totalsState} onRetry={onRetryTotals} />
    </div>
  )
}

function TotalsSection({
  totals,
  totalsState,
  onRetry,
}: {
  totals: DisplayTotals | null
  totalsState: 'loading' | 'ready' | 'error'
  onRetry: () => void
}) {
  if (totalsState === 'loading') return null
  if (totalsState === 'error') {
    return (
      <section className="mt-10" aria-label="Public platform totals">
        <h2 className="font-display text-[1.35rem] font-semibold tracking-[-0.02em]">Public platform totals</h2>
        <p className="mt-3 text-[1rem] text-ink/70">Public totals could not be loaded.</p>
        <button type="button" className={`${primary} mt-3`} onClick={onRetry}>
          Retry
        </button>
      </section>
    )
  }
  const items = landingTotalsItems(totals)
  if (items.length === 0) return null
  return (
    <section className="mt-10" aria-label="Public platform totals">
      <h2 className="font-display text-[1.35rem] font-semibold tracking-[-0.02em]">Public platform totals</h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.label} className={card}>
            <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-ink/45 uppercase">{item.label}</p>
            <p className="mt-3 font-display text-[1.6rem] font-semibold tracking-[-0.03em]">{item.value}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function AccountDealList({ deals }: { deals: AccountDeal[] }) {
  return (
    <div data-screen="account-locked" data-hub="mandates">
      <p className="max-w-xl text-[1rem] leading-relaxed text-ink/70">
        Example mandates show the public fields only. Names, amounts and contacts are not loaded.
      </p>
      <ul className="mt-6 space-y-4">
        {deals.map((deal) => (
          <li key={deal.id} className={card}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-[var(--ba-indigo)] uppercase">{deal.sector}</p>
              <ExampleMark />
            </div>
            <p className="mt-3 text-[1rem] leading-relaxed text-ink/80">{deal.ask}</p>
            <p className="mt-2 text-[0.92rem] text-ink/55">{deal.status}</p>
            <div className="mandate-locked-copy mt-4 space-y-2 text-[0.95rem] text-ink/40" aria-hidden="true">
              <p>Company name</p>
              <p>Exact amount and terms</p>
              <p>Contact</p>
            </div>
          </li>
        ))}
      </ul>
      <LockPanel body={LOCK_COPY.deals} />
    </div>
  )
}

export function AccountRealEstate() {
  return (
    <div data-screen="account-locked" data-hub="real-estate">
      <article className={card}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-[var(--ba-indigo)] uppercase">
            {ACCOUNT_REAL_ESTATE.sector}
          </p>
          <ExampleMark />
        </div>
        <p className="mt-3 text-[1rem] leading-relaxed text-ink/80">{ACCOUNT_REAL_ESTATE.line}</p>
      </article>
      <h2 className="mt-8 font-display text-[1.2rem] font-semibold">Partners</h2>
      <LockedLine>Partner names stay locked.</LockedLine>
      <LockPanel body={LOCK_COPY.deals} />
    </div>
  )
}

export function AccountRooms() {
  return (
    <div data-screen="account-locked" data-hub="rooms">
      <p className="max-w-xl text-[1rem] leading-relaxed text-ink/75">{LOCK_COPY.rooms}</p>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/75">
        Full members open a room, invite peers, and keep the papers in one place.
      </p>
      <LockedLine>Rooms stay locked.</LockedLine>
      <LockPanel body={LOCK_COPY.rooms} />
    </div>
  )
}

export function AccountDirectory() {
  return (
    <div data-screen="account-locked" data-hub="directory">
      <h2 className="font-display text-[1.7rem] font-semibold tracking-[-0.03em]">{DIRECTORY_ACCOUNT_COPY.title}</h2>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/75">{DIRECTORY_ACCOUNT_COPY.body}</p>
      <p className="mt-2 max-w-xl text-[1rem] leading-relaxed text-ink/75">{DIRECTORY_ACCOUNT_COPY.privacy}</p>
      <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Directory placeholders">
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index} className={`${card} flex items-center gap-3`} aria-hidden="true">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--ba-lavender-mist)] text-[var(--ba-indigo)]">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="12" cy="8" r="3" />
                <path d="M6 19c1.2-3 3.2-4.5 6-4.5S16.8 16 18 19" />
              </svg>
            </span>
            <span className="sr-only">Locked</span>
          </li>
        ))}
      </ul>
      <LockPanel body={LOCK_COPY.people} />
    </div>
  )
}

export function AccountIntros() {
  return (
    <div data-screen="account-locked" data-hub="intros">
      <p className="max-w-xl text-[1rem] leading-relaxed text-ink/75">{LOCK_COPY.intros}</p>
      <LockedLine>Introductions stay locked.</LockedLine>
      <LockPanel body={LOCK_COPY.people} />
    </div>
  )
}

export function AccountInvites() {
  return (
    <div data-screen="account-locked" data-hub="invites">
      <p className="max-w-xl text-[1rem] leading-relaxed text-ink/75">{LOCK_COPY.invites}</p>
      <LockPanel body={LOCK_COPY.people} />
    </div>
  )
}

export function AccountMajlis() {
  return (
    <div data-screen="account-locked" data-hub="majlis">
      <h2 className="font-display text-[1.7rem] font-semibold tracking-[-0.03em]">{MAJLIS_ACCOUNT_COPY.title}</h2>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/75">{MAJLIS_ACCOUNT_COPY.body}</p>
      <LockedLine>Upcoming gatherings stay locked.</LockedLine>
      <LockPanel body={LOCK_COPY.majlis} />
    </div>
  )
}

export function AccountAi() {
  const analysis = fullDraftAnalysis()
  return (
    <div data-screen="account-locked" data-hub="ai">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-indigo)] uppercase">AI</p>
      <h2 className="mt-2 font-display text-[1.7rem] font-semibold tracking-[-0.03em]">AI Due Diligence</h2>
      <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-ink/75">
        Public source review of a pitch deck. Not legal advice.
      </p>
      <div className="mt-4">
        <ExampleMark />
      </div>
      <div className="mt-4">
        <DueDiligenceMemo analysis={analysis} companyLabel="Northwind Freight" preparedAt="2026-09-01T00:00:00.000Z" />
      </div>
      <LockPanel body={LOCK_COPY.ai} />
    </div>
  )
}

export function AccountMembership() {
  return (
    <div className="account-main max-w-xl lg:pe-8" data-screen="account-membership">
      <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-indigo)] uppercase">Membership</p>
      <h1 className="mt-3 font-display text-[2rem] font-semibold tracking-[-0.03em]">Your account</h1>
      <p className="mt-4 text-[1rem] leading-relaxed text-ink/75">
        Your account is open. Full membership is by review. The desk reviews every request personally. There is no fixed
        response time.
      </p>
      <button type="button" className={`${primary} mt-6`} disabled>
        Request full membership
      </button>
      <p className="mt-3 text-[0.95rem] text-ink/55">Credentials are collected before a request can be sent.</p>
    </div>
  )
}

const ROLES = [
  { id: 'chairperson', label: 'Chairperson' },
  { id: 'board_member', label: 'Board member' },
  { id: 'c_suite', label: 'C-suite executive' },
  { id: 'other', label: 'Other' },
] as const

const REGIONS = [
  { id: 'ksa_gcc', label: 'Saudi Arabia and the GCC' },
  { id: 'intl', label: 'International' },
] as const

export function AccountProfileView({
  email,
  fullName,
  role,
  region,
  busy,
  error,
  saved,
  onName,
  onRole,
  onRegion,
  onSave,
}: {
  email: string
  fullName: string
  role: string
  region: string
  busy: boolean
  error: string
  saved: boolean
  onName: (value: string) => void
  onRole: (value: string) => void
  onRegion: (value: string) => void
  onSave: () => void
}) {
  return (
    <form
      className="account-main max-w-xl space-y-5 lg:pe-8"
      data-screen="account-profile"
      onSubmit={(event) => {
        event.preventDefault()
        onSave()
      }}
    >
      <h1 className="font-display text-[2rem] font-semibold tracking-[-0.03em]">Profile</h1>
      <p className="text-[1rem] leading-relaxed text-ink/70">
        Only you and the desk can see this until you are a full member.
      </p>
      <label className="block">
        <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">Full name</span>
        <input
          value={fullName}
          onChange={(event) => onName(event.target.value)}
          className="mt-2 w-full min-h-11 border border-[var(--ba-line)] bg-white px-3 text-[1rem]"
        />
      </label>
      <label className="block">
        <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">Work email</span>
        <input value={email} readOnly className="mt-2 w-full min-h-11 border border-[var(--ba-line)] bg-[var(--ba-porcelain)] px-3 text-[1rem]" />
      </label>
      <label className="block">
        <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">Role</span>
        <select
          value={role}
          onChange={(event) => onRole(event.target.value)}
          className="mt-2 w-full min-h-11 border border-[var(--ba-line)] bg-white px-3 text-[1rem]"
        >
          {ROLES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-ink/45 uppercase">Region</span>
        <select
          value={region}
          onChange={(event) => onRegion(event.target.value)}
          className="mt-2 w-full min-h-11 border border-[var(--ba-line)] bg-white px-3 text-[1rem]"
        >
          {REGIONS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p className="text-[0.95rem] text-[var(--ba-error)]" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="text-[0.95rem] text-ink/70" role="status">
          Saved.
        </p>
      ) : null}
      <button type="submit" className={primary} disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}

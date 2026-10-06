import { Link } from 'react-router-dom'
import { seatLabel } from '../../lib/member'
import {
  mandateHasTags,
  matchReason,
  memberAdminHref,
  shortlistText,
  type MandateMatchRow,
  type StaffMandateBrief,
  type StaffMandateMatch,
} from '../../lib/mandateMatch'
import { availabilityLabel } from '../../lib/profileTags'
import { EmptyState, toneClasses } from '../../shell/ViewState'
import { STAFF_VIEWS } from '../../shell/viewCopy'

const copy = STAFF_VIEWS.mandates

export function MandateShortlist({
  mandate,
  matches,
  copied,
  copyError,
  onCopy,
}: {
  mandate: StaffMandateMatch
  matches: MandateMatchRow[]
  copied: boolean
  copyError: string
  onCopy: () => void
}) {
  const styles = toneClasses('staff')
  const tagged = mandateHasTags(mandate)
  const state = !tagged ? 'no-tags' : matches.length === 0 ? 'empty' : 'matches'
  const text = shortlistText(mandate, matches)

  return (
    <div data-mandate-shortlist={state} className="max-w-3xl">
      <Link
        to="/admin/mandates"
        className="inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass-bright uppercase"
      >
        All mandates
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-[0.72rem] font-semibold tracking-[0.14em] text-[var(--ba-lavender)] uppercase">
          {mandate.published ? 'Published' : 'Not published'}
        </p>
        {mandate.isDemo ? <ExampleLabel /> : null}
      </div>
      <h1 className="mt-3 font-display text-[2.1rem] font-bold tracking-[-0.03em]">
        {mandate.companyName || mandate.sector || 'Mandate'}
      </h1>
      <p className="mt-2 text-[1rem] text-pearl/75">
        {[mandate.sector, mandate.dealType, mandate.ticketBand, mandate.geography].filter(Boolean).join(' · ')}
      </p>
      {mandate.oneLiner ? <p className="mt-3 max-w-xl text-[1rem] leading-relaxed text-pearl/80">{mandate.oneLiner}</p> : null}
      <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-pearl/60">{copy.deskNote}</p>
      <TagLine sectorTags={mandate.sectorTags} visionThemes={mandate.visionThemes} />

      {state === 'no-tags' ? (
        <div className="mt-8">
          <EmptyState tone="staff" message={copy.noTags} />
        </div>
      ) : null}

      {state === 'empty' ? (
        <div className="mt-8">
          <EmptyState tone="staff" message={copy.noMatches} />
        </div>
      ) : null}

      {state === 'matches' ? (
        <section aria-label="Matching members" className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-display text-[1.45rem] font-semibold tracking-[-0.02em]">Matching members</h2>
            <button
              type="button"
              onClick={onCopy}
              className={`inline-flex min-h-11 items-center px-4 text-[0.75rem] font-semibold tracking-[0.08em] uppercase ${styles.primary}`}
            >
              {copied ? 'Copied' : 'Copy shortlist'}
            </button>
          </div>
          {copyError ? (
            <div className="mt-3" role="alert">
              <p className="text-[0.95rem] text-red-300">{copyError}</p>
              <pre className="mt-3 overflow-x-auto border border-white/15 bg-white/[0.04] px-4 py-3 text-[0.9rem] leading-relaxed whitespace-pre-wrap text-pearl/85">
                {text}
              </pre>
            </div>
          ) : null}
          <ol className="mt-5 space-y-3">
            {matches.map((row, index) => (
              <MatchCard key={row.userId} row={row} rank={index + 1} />
            ))}
          </ol>
          <p className={`mt-4 max-w-xl text-[0.95rem] leading-relaxed ${styles.muted}`}>{copy.scoreNote}</p>
        </section>
      ) : null}
    </div>
  )
}

function MatchCard({ row, rank }: { row: MandateMatchRow; rank: number }) {
  const styles = toneClasses('staff')
  const href = memberAdminHref(row.userId)
  const who = [row.headline, row.company].filter(Boolean).join(', ')
  return (
    <li className={`${styles.panel} px-4 py-4`} data-match-score={row.score}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-[1.25rem] font-semibold tracking-[-0.02em]">
          <span className="mr-2 text-pearl/45">{rank}</span>
          {row.fullName}
        </p>
        <p className="text-[0.85rem] font-semibold text-brass-bright">Score {row.score}</p>
      </div>
      {who ? <p className={`mt-2 ${styles.muted}`}>{who}</p> : null}
      <p className={`mt-1 text-[0.95rem] ${styles.muted}`}>
        {seatLabel(row.seat)} · {availabilityLabel(row.availability)}
      </p>
      <p className="mt-3 text-[0.98rem] leading-relaxed text-pearl/85">{matchReason(row)}.</p>
      {href ? (
        <Link
          to={href}
          className="mt-3 inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass-bright uppercase"
        >
          Open in People
        </Link>
      ) : null}
    </li>
  )
}

function TagLine({ sectorTags, visionThemes }: { sectorTags: readonly string[]; visionThemes: readonly string[] }) {
  if (sectorTags.length + visionThemes.length === 0) return null
  return (
    <div className="mt-5 space-y-2">
      {sectorTags.length > 0 ? (
        <p className="text-[0.95rem] text-pearl/80">
          <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase">Sector </span>
          {sectorTags.join(', ')}
        </p>
      ) : null}
      {visionThemes.length > 0 ? (
        <p className="text-[0.95rem] text-pearl/80">
          <span className="text-[0.72rem] font-semibold tracking-[0.08em] text-pearl/45 uppercase">Vision 2030 </span>
          {visionThemes.join(', ')}
        </p>
      ) : null}
    </div>
  )
}

export function MandateDeskCard({ mandate }: { mandate: StaffMandateBrief }) {
  const styles = toneClasses('staff')
  const tagged = mandateHasTags(mandate)
  const fit = !tagged ? 'No tags' : mandate.matchCount === 1 ? '1 match' : `${mandate.matchCount} matches`
  return (
    <li data-example={mandate.isDemo ? 'true' : 'false'}>
      <Link
        to={`/admin/mandates/${mandate.id}`}
        className={`${styles.panel} block px-4 py-4 hover:border-white/30`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.72rem] font-semibold tracking-[0.12em] text-[var(--ba-lavender)] uppercase">
            {mandate.published ? 'Published' : 'Not published'}
          </p>
          <span className="flex items-center gap-3">
            {mandate.isDemo ? <ExampleLabel /> : null}
            <span className="text-[0.85rem] text-pearl/70">{fit}</span>
          </span>
        </div>
        <h2 className="mt-3 font-display text-[1.35rem] font-semibold tracking-[-0.02em]">
          {mandate.companyName || mandate.sector || 'Mandate'}
        </h2>
        <p className={`mt-2 ${styles.muted}`}>
          {[mandate.sector, mandate.dealType, mandate.geography].filter(Boolean).join(' · ')}
        </p>
        {mandate.oneLiner ? <p className="mt-3 text-[0.98rem] leading-relaxed text-pearl/80">{mandate.oneLiner}</p> : null}
        <p className="mt-4 inline-flex min-h-11 items-center text-[0.75rem] font-semibold tracking-[0.08em] text-brass-bright uppercase">
          Open shortlist
        </p>
      </Link>
    </li>
  )
}

function ExampleLabel() {
  return (
    <span className="text-[12px] font-semibold tracking-[0.04em] text-brass-bright uppercase">Example</span>
  )
}

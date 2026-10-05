import { useEffect, useRef, useState } from 'react'
import {
  degradedBannerText,
  DEGRADED_NOTE_SEARCH,
  isDegradedCompact,
  parsePublicHttpsUrl,
  publicChecksNotRun,
  PUBLIC_CHECKS_NOT_RUN,
  showsAnalysisReport,
  VERDICT_SHORT,
  type BuiltReport,
  type ClaimVerdict,
  type FindingRow,
  type FindingSection,
  type PresentedReport,
  type SourceLink,
} from '../../../supabase/functions/_shared/due_diligence.ts'
import { REPORT_COPY } from '../../lib/dueDiligenceCopy.ts'
import { presentNextSteps, visibleNextSteps, type NextStepItem } from '../../lib/dueDiligenceNextSteps.ts'
import { MEMBER_VIEWS } from '../../shell/viewCopy.ts'
import { DraftMemoMissing, DueDiligenceMemo } from './DueDiligenceMemo.tsx'

const PILL_CLASS: Record<ClaimVerdict, string> = {
  publicly_consistent: 'dd-pill dd-pill-consistent',
  not_publicly_verifiable: 'dd-pill dd-pill-neutral',
  insufficient_public_data: 'dd-pill dd-pill-insufficient',
  conflict_with_public_sources: 'dd-pill dd-pill-conflict',
}

export function DueDiligenceReport({
  presented,
  preparedAt,
  report,
  reportId,
}: {
  presented: PresentedReport
  preparedAt: string
  report: BuiltReport
  reportId: string
}) {
  const checklist = presentNextSteps(report.next_steps, presented.areas)
  const degraded = report.degraded_notes ?? []
  const compact = isDegradedCompact(report)
  const banner = degradedBannerText(degraded)
  const analysis = report.analysis ?? null
  const searchSkipped = degraded.includes(DEGRADED_NOTE_SEARCH)
  const analysisBanner = degradedBannerText(degraded.filter((note) => note !== DEGRADED_NOTE_SEARCH))

  if (showsAnalysisReport(report) && analysis) {
    return (
      <article className="mt-6" data-dd-view="analysis">
        {analysisBanner ? (
          <div
            role="status"
            data-dd-degraded="true"
            data-dd-compact="false"
            className="max-w-3xl rounded-xl border border-[var(--ba-line)] border-s-2 border-s-[var(--ba-copper)] bg-[var(--ba-porcelain)] px-4 py-3"
          >
            <p className="text-[0.82rem] font-semibold text-[var(--ba-copper-deep)]">{REPORT_COPY.degradedLabel}</p>
            <p className="mt-2 text-[1rem] leading-relaxed text-ink">{analysisBanner}</p>
          </div>
        ) : null}
        {publicChecksNotRun(report) ? (
          <p className="mt-3 max-w-3xl text-[1rem] leading-relaxed text-ink" data-dd-public-checks="not-run">
            {PUBLIC_CHECKS_NOT_RUN}
          </p>
        ) : null}
        {searchSkipped ? (
          <p className="mt-3 max-w-3xl text-[0.92rem] leading-relaxed text-[var(--ba-muted)]" data-dd-search-note="true">
            {DEGRADED_NOTE_SEARCH}
          </p>
        ) : null}
        <DueDiligenceMemo analysis={analysis} companyLabel={report.company_label} preparedAt={preparedAt} />
        <p className="mt-4 max-w-3xl text-[0.95rem] leading-relaxed text-ink/80">{report.disclaimer}</p>
        <section className="mt-8" aria-labelledby="dd-public">
          <h2 id="dd-public" className="font-display text-[1.35rem] font-semibold">
            {REPORT_COPY.sectionPublic}
          </h2>
          {report.sources.length === 0 ? (
            <p className="mt-4 text-[1rem] leading-relaxed text-ink/70">{REPORT_COPY.sourcesEmpty}</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {report.sources.map((source) => (
                <li key={source.url}>
                  <PublicLink source={source} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </article>
    )
  }

  return (
    <article className="mt-6" data-dd-view="claims">
      {banner ? (
        <div
          role="status"
          data-dd-degraded="true"
          data-dd-compact={compact ? 'true' : 'false'}
          className="max-w-3xl rounded-xl border border-[var(--ba-line)] border-s-2 border-s-[var(--ba-copper)] bg-[var(--ba-porcelain)] px-4 py-3"
        >
          <p className="text-[0.82rem] font-semibold text-[var(--ba-copper-deep)]">{REPORT_COPY.degradedLabel}</p>
          <p className="mt-2 text-[1rem] leading-relaxed text-ink">{banner}</p>
        </div>
      ) : null}
      <p className="mt-4 max-w-3xl text-[1.05rem] leading-relaxed text-ink">{presented.assessed_line}</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <OverviewItem label={REPORT_COPY.preparedLabel} value={formatDate(preparedAt)} />
        <OverviewItem label={REPORT_COPY.documentsLabel} value={presented.documents_reviewed} />
      </dl>
      <p className="mt-4 max-w-3xl border-y border-r border-[var(--ba-line)] border-l-2 border-l-[var(--ba-copper)] bg-[var(--ba-porcelain)] px-4 py-3 text-[0.98rem] leading-relaxed text-ink/80">
        {report.disclaimer}
      </p>

      <section className="mt-8 max-w-3xl" aria-labelledby="dd-overview">
        <h2 id="dd-overview" className="font-display text-[1.35rem] font-semibold">
          {REPORT_COPY.sectionOverview}
        </h2>
        <p className="mt-4 text-[1rem] leading-relaxed text-ink/80">
          {compact ? REPORT_COPY.compactOverview : presented.overview}
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <OverviewItem label={REPORT_COPY.metaCompany} value={report.company_label} />
          <OverviewItem label={REPORT_COPY.metaSector} value={report.sector_label} />
          <OverviewItem label={REPORT_COPY.metaAim} value={report.ask_label} />
        </dl>
      </section>

      {compact ? (
        <>
          <DraftMemoMissing />
          <DeckSummary claims={report.claims} />
          <NextSteps reportId={reportId} items={checklist.items} closingNote={checklist.closingNote} />
        </>
      ) : (
      <>
      <section className="mt-8" aria-labelledby="dd-percent">
        <h2 id="dd-percent" className="font-display text-[1.35rem] font-semibold">
          {REPORT_COPY.sectionSummary}
        </h2>
        {publicChecksNotRun(report) ? (
          <p className="mt-4 text-[1rem] leading-relaxed text-ink" data-dd-public-checks="not-run">
            {PUBLIC_CHECKS_NOT_RUN}
          </p>
        ) : report.publicly_consistent_pct === null ? (
          <p className="mt-4 text-[1rem] leading-relaxed text-ink/70">{MEMBER_VIEWS.dueDiligence.noScore}</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <SummaryCard
              tone="consistent"
              value={report.publicly_consistent_pct}
              verdict="publicly_consistent"
              helper={REPORT_COPY.summaryConsistentHelper}
            />
            <SummaryCard
              tone="neutral"
              value={report.not_publicly_verifiable_pct ?? 0}
              verdict="not_publicly_verifiable"
              helper={REPORT_COPY.summaryNotVerifiableHelper}
            />
          </div>
        )}
      </section>

      <NextSteps reportId={reportId} items={checklist.items} closingNote={checklist.closingNote} />

      <section className="mt-8" aria-labelledby="dd-scorecard">
        <h2 id="dd-scorecard" className="font-display text-[1.35rem] font-semibold">
          {REPORT_COPY.sectionScorecard}
        </h2>
        <ul className="mt-4 space-y-3 md:hidden" data-scorecard="cards">
          {presented.areas.map((area) => (
            <li key={area.area} className="rounded-xl border border-[var(--ba-line)] bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 text-[1rem] font-medium break-words text-ink">{area.area}</p>
                <StatusPill verdict={area.label} />
              </div>
              <ClampText text={area.reason} className="mt-2 text-[0.95rem] leading-relaxed text-[var(--ba-muted)]" />
            </li>
          ))}
        </ul>
        <div className="mt-4 hidden overflow-x-auto rounded-xl border border-[var(--ba-line)] bg-white md:block" data-scorecard="table">
          <table className="w-full min-w-[40rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--ba-line)] text-[0.82rem] text-[var(--ba-muted)]">
                <th scope="col" className="sticky left-0 z-10 bg-white px-3 py-3 font-semibold">
                  {REPORT_COPY.colArea}
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  {REPORT_COPY.colStatus}
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  {REPORT_COPY.colReason}
                </th>
              </tr>
            </thead>
            <tbody>
              {presented.areas.map((area) => (
                <tr key={area.area} className="group border-b border-[var(--ba-line)] align-top hover:bg-[var(--ba-porcelain)]">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-white px-3 py-3 text-[1rem] font-medium text-ink group-hover:bg-[var(--ba-porcelain)]"
                  >
                    {area.area}
                  </th>
                  <td className="px-3 py-3">
                    <StatusPill verdict={area.label} />
                  </td>
                  <td className="px-3 py-3">
                    <ClampText text={area.reason} className="text-[0.95rem] leading-relaxed text-[var(--ba-muted)]" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {presented.findings.map((section) => (
        <FindingBlock key={section.number} section={section} claims={report.claims} />
      ))}

      <section className="mt-8" aria-labelledby="dd-sources">
        <h2 id="dd-sources" className="font-display text-[1.35rem] font-semibold">
          {REPORT_COPY.sectionSources}
        </h2>
        {report.sources.length === 0 ? (
          <p className="mt-4 text-[1rem] leading-relaxed text-ink/70">{REPORT_COPY.sourcesEmpty}</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {report.sources.map((source) => (
              <li key={source.url}>
                <PublicLink source={source} />
              </li>
            ))}
          </ul>
        )}
      </section>
      </>
      )}

    </article>
  )
}

function DeckSummary({ claims }: { claims: BuiltReport['claims'] }) {
  return (
    <section className="mt-8 max-w-3xl" aria-labelledby="dd-deck-summary" data-dd-deck-summary="true">
      <h2 id="dd-deck-summary" className="font-display text-[1.35rem] font-semibold">
        {REPORT_COPY.sectionDeck}
      </h2>
      {claims.length === 0 ? (
        <p className="mt-4 text-[1rem] leading-relaxed text-ink/70">{REPORT_COPY.claimsEmpty}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {claims.map((claim) => (
            <li key={claim.text} className="rounded-xl border border-[var(--ba-line)] bg-white px-4 py-3">
              <p className="text-[1rem] leading-relaxed font-semibold break-words text-ink">{claim.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function SummaryCard({
  tone,
  value,
  verdict,
  helper,
}: {
  tone: 'consistent' | 'neutral'
  value: number
  verdict: ClaimVerdict
  helper: string
}) {
  const toneClass = tone === 'consistent' ? 'dd-summary-consistent' : 'dd-summary-neutral'
  return (
    <div className={`dd-summary-card ${toneClass}`}>
      <p className="dd-summary-value font-display text-[2rem] font-semibold tracking-[-0.03em]">{value}%</p>
      <div className="mt-2">
        <StatusPill verdict={verdict} />
      </div>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-[var(--ba-muted)]">{helper}</p>
    </div>
  )
}

function StatusPill({ verdict }: { verdict: ClaimVerdict }) {
  return (
    <span className={PILL_CLASS[verdict]} data-dd-pill={verdict}>
      <span className="dd-pill-dot" aria-hidden="true" />
      {VERDICT_SHORT[verdict]}
    </span>
  )
}

function FindingBlock({
  section,
  claims,
}: {
  section: FindingSection
  claims: BuiltReport['claims']
}) {
  return (
    <section className="dd-finding mt-8" aria-labelledby={`dd-finding-${section.number}`}>
      <h2
        id={`dd-finding-${section.number}`}
        className="border-b border-[var(--ba-copper)] pb-2 font-display text-[1.35rem] font-semibold"
      >
        Finding {section.number}. {section.title}
      </h2>
      <div className="dd-finding-body">
        <p className="mt-3 max-w-3xl text-[1rem] leading-relaxed text-ink/80">{section.narrative}</p>
        <ul className="mt-4 space-y-3 md:hidden">
          {section.rows.map((row, index) => (
            <li
              key={`${section.number}-${index}`}
              className="rounded-xl border border-[var(--ba-line)] bg-white px-4 py-3"
            >
              <p className="text-[1rem] leading-relaxed font-semibold break-words text-ink">{row.claim}</p>
              <div className="mt-2">
                <StatusPill verdict={row.status} />
              </div>
              <p className="mt-2 text-[0.82rem] font-semibold text-[var(--ba-muted)]">{REPORT_COPY.colReason}</p>
              <ClampText text={row.finding} className="text-[0.95rem] leading-relaxed text-ink/80" />
              <div className="mt-2 text-[0.95rem] text-ink">
                <FindingSource row={row} claims={claims} />
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 hidden overflow-x-auto rounded-xl border border-[var(--ba-line)] bg-white md:block">
          <table className="w-full min-w-[44rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--ba-line)] text-[0.82rem] text-[var(--ba-muted)]">
                <th scope="col" className="px-3 py-3 font-semibold">
                  {REPORT_COPY.colClaim}
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  {REPORT_COPY.colSource}
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  {REPORT_COPY.colFinding}
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  {REPORT_COPY.colStatus}
                </th>
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row, index) => (
                <tr
                  key={`${section.number}-${index}`}
                  className="border-b border-[var(--ba-line)] align-top hover:bg-[var(--ba-porcelain)]"
                >
                  <td className="px-3 py-3 text-[0.95rem] leading-relaxed text-ink">{row.claim}</td>
                  <td className="px-3 py-3 text-[0.95rem] text-ink">
                    <FindingSource row={row} claims={claims} />
                  </td>
                  <td className="px-3 py-3">
                    <ClampText text={row.finding} className="text-[0.95rem] leading-relaxed text-ink/80" />
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill verdict={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function FindingSource({ row, claims }: { row: FindingRow; claims: BuiltReport['claims'] }) {
  const match = claims.find((claim) => claim.text === row.claim)
  const links = match?.sources ?? []
  if (links.length === 0) return <span>{row.source}</span>
  return (
    <span className="flex flex-col items-start gap-2">
      {links.map((source) => (
        <span key={`${source.url}-${source.quote ?? ''}`} className="flex flex-col items-start" data-dd-evidence="true">
          {source.quote ? (
            <>
              <span className="text-[0.82rem] font-semibold text-[var(--ba-muted)]">{REPORT_COPY.evidenceLabel}</span>
              <q className="mt-1 block border-s-2 border-s-[var(--ba-indigo)] ps-3 text-[0.95rem] leading-relaxed break-words text-ink">
                {source.quote}
              </q>
            </>
          ) : null}
          <PublicLink source={source} />
        </span>
      ))}
    </span>
  )
}

function NextSteps({
  reportId,
  items,
  closingNote,
}: {
  reportId: string
  items: NextStepItem[]
  closingNote: string
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = visibleNextSteps(items, expanded)
  const hiddenCount = items.length - visible.length
  const groups: { id: NextStepItem['group']; label: string }[] = [
    { id: 'p1_public', label: REPORT_COPY.groupP1 },
    { id: 'p2_evidence', label: REPORT_COPY.groupP2 },
  ]
  const firstP1 = items.find((item) => item.group === 'p1_public')?.id

  return (
    <section className="mt-8 max-w-3xl" aria-labelledby="dd-next">
      <h2 id="dd-next" className="font-display text-[1.35rem] font-semibold">
        {REPORT_COPY.sectionNext}
      </h2>
      {items.length === 0 ? (
        <p className="mt-4 text-[1rem] leading-relaxed text-ink/70">{REPORT_COPY.nextEmpty}</p>
      ) : (
        <div className="mt-4 space-y-6">
          {groups.map((group) => {
            const rows = visible.filter((item) => item.group === group.id)
            if (rows.length === 0) return null
            return (
              <div key={group.id}>
                <GroupLabel text={group.label} />
                <ul className="mt-3 space-y-3">
                  {rows.map((item) => (
                    <StepRow
                      key={item.id}
                      item={item}
                      reportId={reportId}
                      primary={item.id === firstP1}
                    />
                  ))}
                </ul>
              </div>
            )
          })}
          {hiddenCount > 0 ? (
            <button
              type="button"
              className="dd-focus inline-flex min-h-11 items-center px-1 text-[1rem] font-semibold text-[var(--ba-indigo)]"
              onClick={() => setExpanded(true)}
            >
              {REPORT_COPY.more}
            </button>
          ) : null}
        </div>
      )}
      <div className="mt-6 border-t border-[var(--ba-line)] pt-4" data-next-note="true">
        <p className="text-[0.92rem] font-semibold text-[var(--ba-copper-deep)]">{REPORT_COPY.groupNote}</p>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-[var(--ba-muted)]">{closingNote}</p>
      </div>
    </section>
  )
}

function GroupLabel({ text }: { text: string }) {
  const [lead, rest] = text.split('\u00b7')
  return (
    <p className="text-[0.95rem] leading-snug">
      <span className="text-[0.92rem] font-semibold text-[var(--ba-copper-deep)]">{lead?.trim()}</span>
      {rest ? <span className="text-[var(--ba-muted)]"> {'\u00b7'} {rest.trim()}</span> : null}
    </p>
  )
}

function StepRow({
  item,
  reportId,
  primary,
}: {
  item: NextStepItem
  reportId: string
  primary: boolean
}) {
  const storageKey = `ba-dd-ask:${reportId}:${item.id}`
  const boxRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    try {
      box.checked = window.localStorage.getItem(storageKey) === '1'
    } catch {
      box.checked = false
    }
  }, [storageKey])

  function onToggle(next: boolean) {
    try {
      window.localStorage.setItem(storageKey, next ? '1' : '0')
    } catch {
      /* Preference stays on this view if storage is blocked. */
    }
  }

  return (
    <li
      className={`rounded-xl border border-[var(--ba-line)] ${
        primary ? 'bg-[var(--ba-lavender-mist)]' : 'bg-white'
      }`}
    >
      <label className="flex min-h-11 cursor-pointer items-start gap-1 py-2 pr-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center">
          <input
            ref={boxRef}
            type="checkbox"
            className="dd-focus h-5 w-5 accent-[var(--ba-indigo)]"
            defaultChecked={false}
            onChange={(event) => onToggle(event.target.checked)}
          />
        </span>
        <span className="min-w-0 pt-2">
          <span className="block text-[1rem] font-semibold break-words text-ink">{item.title}</span>
          <span className="mt-1 block text-[0.95rem] leading-relaxed text-[var(--ba-muted)]">{item.ask}</span>
        </span>
      </label>
      <div className="pr-3 pb-2 pl-12">
        <CopyAsk ask={item.ask} />
      </div>
    </li>
  )
}

function CopyAsk({ ask }: { ask: string }) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(ask)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      className="dd-focus inline-flex min-h-11 items-center text-[0.95rem] font-semibold text-[var(--ba-indigo)]"
      onClick={() => void onCopy()}
      aria-live="polite"
    >
      {copied ? REPORT_COPY.copied : REPORT_COPY.copyAsk}
    </button>
  )
}

function ClampText({ text, className }: { text: string; className: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 180
  return (
    <div>
      <p className={`${className} ${long && !open ? 'line-clamp-2' : ''}`}>{text}</p>
      {long ? (
        <button
          type="button"
          className="dd-focus inline-flex min-h-11 items-center text-[0.95rem] font-semibold text-[var(--ba-indigo)]"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? REPORT_COPY.showLess : REPORT_COPY.showMore}
        </button>
      ) : null}
    </div>
  )
}

function OverviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--ba-line)] bg-white px-4 py-3">
      <dt className="text-[0.82rem] font-semibold text-[var(--ba-muted)]">{label}</dt>
      <dd className="mt-1 text-[1rem] break-words text-ink">{value}</dd>
    </div>
  )
}

function PublicLink({ source }: { source: SourceLink }) {
  const parsed = parsePublicHttpsUrl(source.url)
  if (!parsed.ok) return <span className="text-[0.95rem] break-words text-ink">{source.title}</span>
  const href = `${parsed.url.origin}${parsed.url.pathname}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="dd-focus inline-flex min-h-11 items-center text-[0.95rem] break-words text-[var(--ba-indigo)] underline underline-offset-2"
    >
      {source.title}
    </a>
  )
}

function formatDate(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', { dateStyle: 'long' })
}

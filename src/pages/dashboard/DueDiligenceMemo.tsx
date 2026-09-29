import {
  ANALYSIS_DISCLAIMER,
  NOT_A_RECOMMENDATION,
  missingBannerLabels,
  POSTURE_LABEL,
  SCORE_KEYS,
  SCORE_LABEL,
  type DeckAnalysis,
  type MathResult,
  type Posture,
  type ScoreKey,
  type Severity,
} from '../../../supabase/functions/_shared/deck_analysis.ts'
import { REPORT_COPY } from '../../lib/dueDiligenceCopy.ts'

const RESULT_LABEL: Record<MathResult, string> = {
  ties: REPORT_COPY.resultTies,
  breaks: REPORT_COPY.resultBreaks,
  cannot_test: REPORT_COPY.resultCannot,
}

const SEVERITY_LABEL: Record<Severity, string> = {
  high: REPORT_COPY.severityHigh,
  medium: REPORT_COPY.severityMedium,
  low: REPORT_COPY.severityLow,
}

const BAR_KEYS = SCORE_KEYS.filter((key) => key !== 'overall')

export function DueDiligenceMemo({
  analysis,
  companyLabel,
  preparedAt,
}: {
  analysis: DeckAnalysis
  companyLabel: string
  preparedAt: string
}) {
  const posture = analysis.hero?.posture || analysis.snapshot.posture
  const overall = analysis.hero?.overall ?? analysis.scores.overall
  const currency = analysis.hero?.currency || analysis.snapshot.round.currency
  const preMoney = analysis.hero?.pre_money ?? analysis.snapshot.round.pre_money
  const postMoney = analysis.hero?.post_money ?? analysis.snapshot.round.post_money
  const risks = [...analysis.risks].sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
  const gaps = missingBannerLabels(analysis)

  return (
    <div data-dd-memo="true" data-dd-ai="draft">
      <p className="text-[0.82rem] font-semibold text-[var(--ba-indigo)]">{REPORT_COPY.aiDraft}</p>
      <p className="mt-1 max-w-3xl text-[0.95rem] leading-relaxed text-[var(--ba-muted)]">{REPORT_COPY.aiScope}</p>

      <header className="mt-4 rounded-xl border border-[var(--ba-line)] border-s-2 border-s-[var(--ba-indigo)] bg-white px-4 py-4">
        <p className="font-display text-[1.55rem] font-semibold leading-tight break-words text-ink">
          {companyLabel}
        </p>
        {analysis.snapshot.one_liner ? (
          <p className="mt-2 max-w-3xl text-[1rem] leading-relaxed text-ink/80">{analysis.snapshot.one_liner}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <PostureChip posture={posture} />
          <p className="text-[1rem] text-ink" data-dd-overall={overall ?? 'missing'}>
            <span className="text-[0.82rem] font-semibold text-[var(--ba-muted)]">{REPORT_COPY.overallLabel} </span>
            {overall == null ? (
              <span className="font-semibold">{REPORT_COPY.scoreMissing}</span>
            ) : (
              <span className="font-display text-[1.75rem] font-semibold tracking-[-0.03em]">{overall}</span>
            )}
            {overall == null ? null : <span className="text-[var(--ba-muted)]"> {REPORT_COPY.ofFive}</span>}
          </p>
        </div>
        {analysis.snapshot.posture_reason ? (
          <p className="mt-3 max-w-3xl text-[0.98rem] leading-relaxed text-ink/80">{analysis.snapshot.posture_reason}</p>
        ) : null}
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <HeroFact label={REPORT_COPY.preMoney} value={moneyLabel(preMoney, currency)} />
          <HeroFact label={REPORT_COPY.postMoney} value={moneyLabel(postMoney, currency)} />
          <HeroFact label={REPORT_COPY.preparedLabel} value={formatDate(preparedAt)} />
        </dl>
      </header>

      {gaps.length > 0 ? (
        <p className="mt-4 max-w-3xl text-[0.95rem] leading-relaxed text-ink" data-dd-partial="true" data-dd-missing={gaps.join('|')}>
          <span className="font-semibold">{REPORT_COPY.missingSections}: </span>
          {gaps.join(', ')}
        </p>
      ) : null}

      <section className="mt-8" aria-labelledby="dd-score-bars">
        <h2 id="dd-score-bars" className="font-display text-[1.35rem] font-semibold">
          {REPORT_COPY.sectionScores}
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {BAR_KEYS.map((key) => (
            <li key={key}>
              <ScoreBar scoreKey={key} value={analysis.scores[key]} />
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8" aria-labelledby="dd-math">
        <h2 id="dd-math" className="font-display text-[1.35rem] font-semibold">
          {REPORT_COPY.sectionMath}
        </h2>
        {analysis.math_checks.length === 0 ? (
          <p className="mt-4 text-[1rem] leading-relaxed text-ink/70">{REPORT_COPY.mathEmpty}</p>
        ) : (
          <>
            <ul className="mt-4 space-y-3 md:hidden" data-dd-math="cards">
              {analysis.math_checks.map((row) => (
                <li key={`${row.name}-${row.formula}`} className="rounded-xl border border-[var(--ba-line)] bg-white px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 text-[1rem] font-medium break-words text-ink">{row.name}</p>
                    <MathPill result={row.result} />
                  </div>
                  <p className="mt-2 text-[0.95rem] leading-relaxed break-words text-ink/80">{row.formula}</p>
                  <p className="mt-2 text-[0.95rem] text-ink">
                    {REPORT_COPY.colDeck}: {row.deck_value || REPORT_COPY.notInDeck}
                  </p>
                  <p className="mt-1 text-[0.95rem] text-ink">
                    {REPORT_COPY.colRecomputed}: {row.recomputed || REPORT_COPY.notInDeck}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-4 hidden overflow-x-auto rounded-xl border border-[var(--ba-line)] bg-white md:block" data-dd-math="table">
              <table className="w-full min-w-[44rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[var(--ba-line)] text-[0.82rem] text-[var(--ba-muted)]">
                    <th scope="col" className="px-3 py-3 font-semibold">{REPORT_COPY.colCheck}</th>
                    <th scope="col" className="px-3 py-3 font-semibold">{REPORT_COPY.colFormula}</th>
                    <th scope="col" className="px-3 py-3 font-semibold">{REPORT_COPY.colDeck}</th>
                    <th scope="col" className="px-3 py-3 font-semibold">{REPORT_COPY.colRecomputed}</th>
                    <th scope="col" className="px-3 py-3 font-semibold">{REPORT_COPY.colResult}</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.math_checks.map((row) => (
                    <tr key={`${row.name}-${row.formula}`} className="border-b border-[var(--ba-line)] align-top">
                      <th scope="row" className="px-3 py-3 text-[0.95rem] font-medium text-ink">{row.name}</th>
                      <td className="px-3 py-3 text-[0.95rem] leading-relaxed text-ink/80">{row.formula}</td>
                      <td className="px-3 py-3 text-[0.95rem] text-ink">{row.deck_value || REPORT_COPY.notInDeck}</td>
                      <td className="px-3 py-3 text-[0.95rem] text-ink">{row.recomputed || REPORT_COPY.notInDeck}</td>
                      <td className="px-3 py-3"><MathPill result={row.result} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="mt-8" aria-labelledby="dd-risks">
        <h2 id="dd-risks" className="font-display text-[1.35rem] font-semibold">
          {REPORT_COPY.sectionRisks}
        </h2>
        {risks.length === 0 ? (
          <p className="mt-4 text-[1rem] leading-relaxed text-ink/70">{REPORT_COPY.risksEmpty}</p>
        ) : (
          <>
            <ul className="mt-4 space-y-3 md:hidden" data-dd-risks="cards">
              {risks.map((risk) => (
                <li key={`${risk.severity}-${risk.title}`} className="rounded-xl border border-[var(--ba-line)] bg-white px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 text-[1rem] font-medium break-words text-ink">{risk.title}</p>
                    <SeverityPill severity={risk.severity} />
                  </div>
                  <p className="mt-2 text-[0.95rem] leading-relaxed text-ink/80">{risk.why}</p>
                </li>
              ))}
            </ul>
            <div className="mt-4 hidden overflow-x-auto rounded-xl border border-[var(--ba-line)] bg-white md:block" data-dd-risks="table">
              <table className="w-full min-w-[40rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[var(--ba-line)] text-[0.82rem] text-[var(--ba-muted)]">
                    <th scope="col" className="px-3 py-3 font-semibold">{REPORT_COPY.colSeverity}</th>
                    <th scope="col" className="px-3 py-3 font-semibold">{REPORT_COPY.colCheck}</th>
                    <th scope="col" className="px-3 py-3 font-semibold">{REPORT_COPY.colReason}</th>
                  </tr>
                </thead>
                <tbody>
                  {risks.map((risk) => (
                    <tr key={`${risk.severity}-${risk.title}`} className="border-b border-[var(--ba-line)] align-top">
                      <td className="px-3 py-3"><SeverityPill severity={risk.severity} /></td>
                      <th scope="row" className="px-3 py-3 text-[0.95rem] font-medium text-ink">{risk.title}</th>
                      <td className="px-3 py-3 text-[0.95rem] leading-relaxed text-ink/80">{risk.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <details open className="mt-8 rounded-xl border border-[var(--ba-line)] bg-white" data-dd-accordion="memo">
        <summary className="dd-focus cursor-pointer list-none px-4 py-3 font-display text-[1.35rem] font-semibold [&::-webkit-details-marker]:hidden">
          <span className="inline-flex min-h-11 items-center">{REPORT_COPY.sectionMemo}</span>
        </summary>
        <div className="border-t border-[var(--ba-line)] px-4 py-4">
          {analysis.memo_markdown ? (
            <div className="max-w-3xl space-y-3">
              {analysis.memo_markdown.split(/\n{2,}/).map((paragraph) => (
                <p key={paragraph.slice(0, 48)} className="text-[1rem] leading-relaxed whitespace-pre-wrap break-words text-ink">
                  {paragraph}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-[1rem] leading-relaxed text-ink/70" data-dd-memo-text="missing">
              {REPORT_COPY.memoTextMissing}
            </p>
          )}
          {analysis.questions_for_management.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-[1rem] font-semibold text-ink">{REPORT_COPY.questionsLabel}</h3>
              <ol className="mt-3 list-decimal space-y-2 ps-5 text-[1rem] leading-relaxed text-ink/80">
                {analysis.questions_for_management.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ol>
            </div>
          ) : null}
          {analysis.suggested_structure ? (
            <div className="mt-6">
              <h3 className="text-[1rem] font-semibold text-ink">{REPORT_COPY.structureLabel}</h3>
              {analysis.suggested_structure.comment ? (
                <p className="mt-2 text-[1rem] leading-relaxed text-ink/80">{analysis.suggested_structure.comment}</p>
              ) : null}
              {analysis.suggested_structure.tranches.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {analysis.suggested_structure.tranches.map((tranche) => (
                    <li key={`${tranche.name}-${tranche.release_when}`} className="text-[0.98rem] leading-relaxed text-ink">
                      <span className="font-semibold">{tranche.name}</span>
                      {tranche.release_when ? ` ${tranche.release_when}` : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </details>

      <footer className="mt-8 max-w-3xl border-t border-[var(--ba-line)] pt-4" data-dd-disclaimer="true">
        <p className="text-[0.95rem] leading-relaxed text-ink/80">{ANALYSIS_DISCLAIMER}</p>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-ink/80">{NOT_A_RECOMMENDATION}</p>
      </footer>
    </div>
  )
}

export function DraftMemoMissing() {
  return (
    <section className="mt-8 max-w-3xl" aria-labelledby="dd-memo-missing" data-dd-memo-missing="true" data-dd-ai="draft">
      <h2 id="dd-memo-missing" className="font-display text-[1.35rem] font-semibold">
        {REPORT_COPY.sectionMemo}
      </h2>
      <p className="mt-3 text-[1rem] leading-relaxed text-ink/80">{REPORT_COPY.memoMissing}</p>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-[var(--ba-muted)]">{REPORT_COPY.aiScope}</p>
    </section>
  )
}

function PostureChip({ posture }: { posture: Posture | '' }) {
  const label = posture ? POSTURE_LABEL[posture] : REPORT_COPY.scoreMissing
  const tone =
    posture === 'pass'
      ? 'dd-pill-conflict'
      : posture === 'discuss_with_milestones'
        ? 'dd-pill-consistent'
        : 'dd-pill-insufficient'
  return (
    <span className={`dd-pill ${tone}`} data-dd-posture={posture || 'missing'}>
      <span className="dd-pill-dot" aria-hidden="true" />
      {REPORT_COPY.postureLabel}: {label}
    </span>
  )
}

function ScoreBar({ scoreKey, value }: { scoreKey: ScoreKey; value: number | null }) {
  const width = value == null ? 0 : (value / 5) * 100
  return (
    <div className="rounded-xl border border-[var(--ba-line)] bg-white px-4 py-3" data-dd-score={scoreKey}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[0.95rem] font-medium text-ink">{SCORE_LABEL[scoreKey]}</p>
        <p className="text-[0.95rem] font-semibold text-ink">{value == null ? REPORT_COPY.scoreMissing : `${value} ${REPORT_COPY.ofFive}`}</p>
      </div>
      <div className="mt-2 h-2 rounded-full bg-[var(--ba-line)]" aria-hidden="true">
        <div className="h-2 rounded-full bg-[var(--ba-indigo)]" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function MathPill({ result }: { result: MathResult }) {
  const tone = result === 'ties' ? 'dd-pill-consistent' : result === 'breaks' ? 'dd-pill-conflict' : 'dd-pill-neutral'
  return (
    <span className={`dd-pill ${tone}`} data-dd-math-result={result}>
      <span className="dd-pill-dot" aria-hidden="true" />
      {RESULT_LABEL[result]}
    </span>
  )
}

function SeverityPill({ severity }: { severity: Severity }) {
  const tone = severity === 'high' ? 'dd-pill-conflict' : severity === 'medium' ? 'dd-pill-insufficient' : 'dd-pill-neutral'
  return (
    <span className={`dd-pill ${tone}`} data-dd-risk={severity}>
      <span className="dd-pill-dot" aria-hidden="true" />
      {SEVERITY_LABEL[severity]}
    </span>
  )
}

function HeroFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--ba-line)] bg-[var(--ba-porcelain)] px-3 py-3">
      <dt className="text-[0.82rem] font-semibold text-[var(--ba-muted)]">{label}</dt>
      <dd className="mt-1 text-[1rem] break-words text-ink">{value}</dd>
    </div>
  )
}

function moneyLabel(value: number | null, currency: string): string {
  if (value == null) return REPORT_COPY.notInDeck
  const amount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
  return `${amount} ${currency || 'USD'}`
}

function formatDate(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', { dateStyle: 'long' })
}

function severityRank(severity: Severity): number {
  if (severity === 'high') return 0
  if (severity === 'medium') return 1
  return 2
}

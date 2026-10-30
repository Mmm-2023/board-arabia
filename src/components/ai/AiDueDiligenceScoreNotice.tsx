import { AI_DD_SCORE_NOTICE, AI_DD_SCORE_TAG } from '../../lib/aiDueDiligenceNotice'

/** Full notice, once at the top of an AI Due Diligence report. */
export function AiDueDiligenceReportNotice({ className }: { className?: string }) {
  const classes = [
    'max-w-3xl rounded-xl border border-[var(--ba-line)] border-s-2 border-s-[var(--ba-indigo)] bg-[var(--ba-porcelain)] px-4 py-3 text-[0.95rem] leading-relaxed text-ink',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <p className={classes} data-dd-report-notice="">
      {AI_DD_SCORE_NOTICE}
    </p>
  )
}

/** Short tag beside one member-facing score. */
export function AiDueDiligenceScoreTag({ className }: { className?: string }) {
  const classes = [
    'inline-flex max-w-full items-center rounded-full border border-[var(--ba-line)] bg-[var(--ba-porcelain)] px-2.5 py-1 text-[0.8125rem] font-medium leading-snug text-[var(--ba-muted)]',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <span className={classes} data-dd-score-tag="" data-chip="">
      {AI_DD_SCORE_TAG}
    </span>
  )
}

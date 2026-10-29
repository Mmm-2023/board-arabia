import { AI_DD_SCORE_NOTICE } from '../../lib/aiDueDiligenceNotice'

/** One notice beside every member-facing AI Due Diligence score. */
export function AiDueDiligenceScoreNotice({ className }: { className?: string }) {
  const classes = ['max-w-xl text-[0.92rem] leading-relaxed text-[var(--ba-muted)]', className].filter(Boolean).join(' ')
  return (
    <p className={classes} data-dd-score-notice="">
      {AI_DD_SCORE_NOTICE}
    </p>
  )
}

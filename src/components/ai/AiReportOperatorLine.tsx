import { operatorCredit } from '../../lib/aiReportOperator'
import { useAiReportOperator } from '../../lib/useAiReportOperator'

/** Operator line for logged-in AI Due Diligence disclaimers and footers. */
export function AiReportOperatorLine({ className }: { className?: string }) {
  const credit = operatorCredit(useAiReportOperator())
  if (!credit) return null
  return (
    <p className={className} data-ai-operator="">
      {credit}
    </p>
  )
}

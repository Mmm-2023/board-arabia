import { aiReportOperatorCredit } from '../../lib/aiReportOperator'

/** Operator line for logged-in AI Due Diligence disclaimers and footers. */
export function AiReportOperatorLine({ className }: { className?: string }) {
  return (
    <p className={className} data-ai-operator="">
      {aiReportOperatorCredit()}
    </p>
  )
}

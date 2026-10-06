/**
 * Logged-in AI report operator credit.
 * The name and commercial registration are not stored here.
 * A signed-in client loads them from public.ai_report_operator.
 * If that read fails, the Provided by sentence is omitted.
 */

export type AiReportOperator = {
  entity: string
  cr: string
}

let modulePreview: AiReportOperator | null | undefined

type PreviewWindow = Window & {
  __baAiReportOperator?: AiReportOperator | null
}

/** Smoke and tests inject a fetched row. Undefined means use the server. */
export function previewAiReportOperator(value: AiReportOperator | null | undefined) {
  modulePreview = value
}

export function readAiReportOperatorPreview(): AiReportOperator | null | undefined {
  if (modulePreview !== undefined) return modulePreview
  if (typeof window === 'undefined') return undefined
  if (!Object.prototype.hasOwnProperty.call(window, '__baAiReportOperator')) return undefined
  return (window as PreviewWindow).__baAiReportOperator ?? null
}

export function operatorCredit(row: AiReportOperator | null): string | null {
  if (!row) return null
  const entity = row.entity.trim()
  const cr = row.cr.trim()
  if (!entity || !cr) return null
  return `Provided by ${entity}, CR ${cr}`
}

const FOOTER_ACT = 'Verify with licensed advisers before you act, under the Board Arabia Terms'

/** Insert the operator sentence, or leave the legal footer unchanged. */
export function footerWithOperator(footer: string, row: AiReportOperator | null): string {
  const credit = operatorCredit(row)
  if (!credit || !footer.includes(FOOTER_ACT)) return footer
  return footer.replace(
    FOOTER_ACT,
    `Verify with licensed advisers before you act. ${credit}, under the Board Arabia Terms`,
  )
}

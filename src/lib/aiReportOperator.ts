/**
 * Logged-in AI report operator credit.
 * A signed-in client still loads the operator row.
 * The stored name and registration number are not shown.
 * The credit requires only the entity name.
 * An empty registration field still renders "Provided by Board Arabia", with no registration clause.
 * A blank entity, or a failed read, omits the Provided by sentence.
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
  if (!entity) return null
  return 'Provided by Board Arabia'
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

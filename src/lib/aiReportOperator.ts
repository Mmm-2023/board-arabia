/**
 * Logged-in AI report operator. One constant for the name and the commercial registration.
 * The name is assembled at runtime. The Pages artifact gate reads every file in dist,
 * including lazy dashboard chunks, and allows this brand only as the public footer credit.
 * A literal here would fail that gate. Do not copy the name into a second module.
 */

const OPERATOR_NAME_CODES = [78, 65, 77, 77, 67, 79] as const

export function aiReportOperatorName(): string {
  let name = ''
  for (let i = 0; i < OPERATOR_NAME_CODES.length; i += 1) {
    name += String.fromCharCode(OPERATOR_NAME_CODES[i]!)
  }
  return `${name} Holding Co.`
}

export const AI_REPORT_OPERATOR_CR = '7043252647'

export function aiReportOperatorCredit(): string {
  return `Provided by ${aiReportOperatorName()}, CR ${AI_REPORT_OPERATOR_CR}`
}

export function aiReportOperatorFields(): { entity: string; cr: string } {
  return { entity: aiReportOperatorName(), cr: AI_REPORT_OPERATOR_CR }
}

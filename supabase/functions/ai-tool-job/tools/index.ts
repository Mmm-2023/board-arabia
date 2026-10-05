import { isAiToolKey, type AiToolKey } from '../../_shared/ai_tools.ts'
import { cfoCheckOutput } from './cfo_check.ts'
import { dealReadinessOutput } from './deal_readiness.ts'
import { marketBriefOutput } from './market_brief.ts'
import { pricingSenseCheckOutput } from './pricing_sense_check.ts'
import { termSheetReviewOutput } from './term_sheet_review.ts'
import type { StubInput, StubOutput } from './types.ts'

export function runToolStub(tool: AiToolKey, input: StubInput): StubOutput {
  if (tool === 'cfo_check') return cfoCheckOutput(input)
  if (tool === 'market_brief') return marketBriefOutput(input)
  if (tool === 'term_sheet_review') return termSheetReviewOutput(input)
  if (tool === 'deal_readiness') return dealReadinessOutput(input)
  return pricingSenseCheckOutput(input)
}

export function stubForKey(tool: string, input: StubInput): StubOutput | null {
  if (!isAiToolKey(tool)) return null
  return runToolStub(tool, input)
}

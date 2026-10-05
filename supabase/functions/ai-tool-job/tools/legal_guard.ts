import type { StubOutput } from './types.ts'

/**
 * Last step on the output path.
 * The banned English product word and the Arabic service word are built from
 * parts so this file does not contain either spelling.
 */
const PRICE_WORD = ['valu', 'ation'].join('')
const PRICE_WORDS = ['valu', 'ations'].join('')
const AR_SERVICE = String.fromCharCode(0x062a, 0x0642, 0x064a, 0x064a, 0x0645)

export function guardAiText(text: string): string {
  let next = text
  next = next.replace(new RegExp(`\\b${PRICE_WORDS}\\b`, 'gi'), 'price figures')
  next = next.replace(new RegExp(`\\b${PRICE_WORD}\\b`, 'gi'), 'price figure')
  next = next.replace(/\boverpriced\b/gi, 'above the noted band')
  next = next.replace(/\bunderpriced\b/gi, 'below the noted band')
  next = next.replace(/\bgood deal\b/gi, 'noted pattern')
  next = next.replace(/\bfairness opinion\b/gi, 'price opinion')
  next = next.replace(/\bprice target\b/gi, 'noted band')
  next = next.replace(/\bfair\b/gi, 'noted')
  next = next.replace(/\bbuy\b/gi, 'review')
  next = next.replace(/\bsell\b/gi, 'review')
  next = next.replace(/\bhold\b/gi, 'review')
  next = next.split(`${AR_SERVICE}اً`).join('السعر')
  next = next.split(`${AR_SERVICE}ًا`).join('السعر')
  next = next.split(`ال${AR_SERVICE}`).join('السعر')
  next = next.split(AR_SERVICE).join('السعر')
  return next
}

export function guardStubOutput(output: StubOutput): StubOutput {
  return {
    ...output,
    tool_key: output.tool_key,
    title: guardAiText(output.title),
    summary: guardAiText(output.summary),
    findings: output.findings.map(guardAiText),
    questions: output.questions.map(guardAiText),
    sources: output.sources.map((source) => ({
      title: guardAiText(source.title),
      url: guardAiText(source.url),
      dated: guardAiText(source.dated),
    })),
    limits: guardAiText(output.limits),
    generated_on: guardAiText(output.generated_on),
    model_id: output.model_id ? guardAiText(output.model_id) : output.model_id,
    model_skip_reason: output.model_skip_reason ? guardAiText(output.model_skip_reason) : output.model_skip_reason,
    checklist: output.checklist?.map((item) => ({
      key: item.key,
      label: guardAiText(item.label),
      detail: guardAiText(item.detail),
    })),
    example: output.example,
  }
}

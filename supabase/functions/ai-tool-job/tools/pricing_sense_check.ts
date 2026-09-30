import type { StubInput, StubOutput } from './types.ts'

export function pricingSenseCheckOutput(input: StubInput): StubOutput {
  return {
    tool_key: 'pricing_sense_check',
    title: 'Pricing sense-check',
    summary:
      'Placeholder comparison of an asking figure with public comparables and reported regional deals. General and educational only.',
    findings: [
      'Ranges are not calculated in this frame.',
      'Public comparables and reported deals can be incomplete or stale.',
    ],
    questions: ['Which public sources should a licensed adviser check before you rely on a figure?'],
    sources: [
      {
        title: 'Example public comparable note',
        url: 'https://example.com/comparables',
        dated: input.generatedOn,
      },
    ],
    limits: 'General and educational only. Not a price opinion or an investment recommendation.',
    generated_on: input.generatedOn,
    model_id: input.modelId,
    model_skip_reason: input.modelSkipReason,
  }
}

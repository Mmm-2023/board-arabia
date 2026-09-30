import type { StubInput, StubOutput } from './types.ts'

export function marketBriefOutput(input: StubInput): StubOutput {
  return {
    tool_key: 'market_brief',
    title: 'Market brief',
    summary:
      'Placeholder brief on entering the Saudi market. General and sourced. Rules change often. This is not legal or tax advice.',
    findings: [
      'Licences, local partner rules, Saudization, and incentives are not confirmed for a specific case here.',
    ],
    questions: ['What should a licensed Saudi lawyer and MISA confirm before you act?'],
    sources: [
      {
        title: 'Example public note on market entry',
        url: 'https://example.com/misa',
        dated: input.generatedOn,
      },
    ],
    limits: 'General and sourced. Every source is dated. Confirm current rules with a licensed Saudi lawyer and the relevant authority.',
    generated_on: input.generatedOn,
    model_id: input.modelId,
    model_skip_reason: input.modelSkipReason,
  }
}

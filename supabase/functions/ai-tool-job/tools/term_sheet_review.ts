import type { StubInput, StubOutput } from './types.ts'

export function termSheetReviewOutput(input: StubInput): StubOutput {
  return {
    tool_key: 'term_sheet_review',
    title: 'Term sheet reviewer',
    summary: `Placeholder read of ${input.fileName}. General and educational only. It is not legal or investment advice.`,
    findings: [
      'Key terms are not summarised in this frame.',
      'Unusual terms against general market practice are not flagged yet.',
    ],
    questions: ['Which terms should your lawyer walk through with you?'],
    sources: [
      {
        title: 'Example public note on market practice',
        url: 'https://example.com/terms-practice',
        dated: input.generatedOn,
      },
    ],
    limits: 'General and educational only. Market practice here means patterns in public sources, not a legal opinion.',
    generated_on: input.generatedOn,
    model_id: input.modelId,
    model_skip_reason: input.modelSkipReason,
  }
}

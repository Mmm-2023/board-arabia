import type { StubInput, StubOutput } from './types.ts'

export function cfoCheckOutput(input: StubInput): StubOutput {
  return {
    tool_key: 'cfo_check',
    title: 'CFO check',
    summary: `Placeholder first read of ${input.fileName}. This is not SOCPA accounting or audit.`,
    findings: [
      'Runway, margins, and inconsistencies are not calculated in this frame.',
      'A later release can read the uploaded accounts or model.',
    ],
    questions: ['What should your finance team or auditor confirm before you rely on these figures?'],
    sources: [],
    limits: 'This is not SOCPA accounting or audit, and it is not financial advice.',
    generated_on: input.generatedOn,
    model_id: input.modelId,
    model_skip_reason: input.modelSkipReason,
  }
}

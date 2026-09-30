export type StubInput = {
  fileName: string
  generatedOn: string
  modelId: string | null
  modelSkipReason: string | null
  sourceText?: string
  mimeType?: string
}

export type StubOutput = {
  tool_key: string
  title: string
  summary: string
  findings: string[]
  questions: string[]
  sources: { title: string; url: string; dated: string }[]
  limits: string
  generated_on: string
  model_id: string | null
  model_skip_reason: string | null
}

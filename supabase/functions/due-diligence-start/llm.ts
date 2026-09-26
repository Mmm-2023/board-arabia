import {
  extractDeckFacts,
  factsFromModelJson,
  mergeModelFacts,
  parsePublicHttpsUrl,
  type DeckFacts,
} from '../_shared/due_diligence.ts'

const DEFAULT_MODEL = 'gpt-4o-mini'
const DEFAULT_BASE = 'https://api.openai.com/v1'

const SYSTEM = [
  'You extract structured facts from pitch deck text. Reply with one JSON object and no markdown.',
  'Schema: {"company":"","sector":"","ask":"","claims":[{"text":"","kind":"team"}]}',
  'kind is team, traction, market, ip, or other.',
  'Copy company, sector, ask, and every claim text from the deck. If a field is not in the deck, use an empty string.',
  'Do not invent names, figures, customers, or sources.',
  'Do not use these words: invest, approve, reject, fraud, pass, valid, invalid, investable.',
  'Do not use em dashes.',
  'Skip titles, postal addresses, phone numbers, and headings that only say partnership proposal.',
  'At most 8 claims.',
].join(' ')

export async function extractDeckFactsWithOptionalLlm(text: string): Promise<DeckFacts> {
  const heuristic = extractDeckFacts(text)
  const key = Deno.env.get('BA_DD_LLM_API_KEY')?.trim()
  if (!key) return heuristic
  try {
    const parsed = await requestFacts(text, key)
    if (!parsed) return heuristic
    return mergeModelFacts(factsFromModelJson(parsed, text), heuristic)
  } catch {
    return heuristic
  }
}

async function requestFacts(text: string, key: string): Promise<unknown | null> {
  const endpoint = llmEndpoint()
  if (!endpoint) return null
  const model = Deno.env.get('BA_DD_LLM_MODEL')?.trim() || DEFAULT_MODEL
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: text.slice(0, 12_000) },
      ],
    }),
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) return null
  const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] }
  const content = body.choices?.[0]?.message?.content
  if (typeof content !== 'string') return null
  return parseModelContent(content)
}

function llmEndpoint(): URL | null {
  const base = (Deno.env.get('BA_DD_LLM_BASE_URL')?.trim() || DEFAULT_BASE).replace(/\/$/, '')
  let endpoint: URL
  try {
    endpoint = new URL(`${base}/chat/completions`)
  } catch {
    return null
  }
  if (!parsePublicHttpsUrl(`${endpoint.origin}/`).ok) return null
  return endpoint
}

function parseModelContent(content: string): unknown | null {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}

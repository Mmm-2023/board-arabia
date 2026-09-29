import {
  fitNumberedDeck,
  numberDeckPages,
  parseDeckAnalysis,
  parseModelJson,
  preferredAsk,
  preferredCompany,
  rawHasHero,
  type DeckAnalysis,
} from '../_shared/deck_analysis.ts'
import {
  FALLBACK_MS,
  PRIMARY_CAP_MS,
  PRIMARY_TTFT_MS,
  REPAIR_MS,
  STEP_ANALYSIS_CAP_MS,
  type ModelPass,
} from '../_shared/due_diligence.ts'
import {
  extractDeckFacts,
  mergeModelFacts,
  NOT_STATED,
  parsePublicHttpsUrl,
  type DeckFacts,
} from '../_shared/due_diligence.ts'
import { NARRATIVE_PROMPT } from './prompts/narrative_prompt.ts'
import { REPAIR_PROMPT } from './prompts/repair_prompt.ts'
import { SCHEMA_PROMPT } from './prompts/schema_prompt.ts'
import { SCORES_PROMPT } from './prompts/scores_prompt.ts'
import { SYSTEM_PROMPT } from './prompts/system_prompt.ts'

const DEFAULT_MODEL = 'gpt-4o-mini'
const DEFAULT_BASE = 'https://api.openai.com/v1'
const XAI_CHAT_URL = 'https://api.x.ai/v1/chat/completions'

export const ANALYSIS_TIMEOUT_MS = 75_000
export const PRIMARY_CALL_MS = PRIMARY_CAP_MS
export const ANALYSIS_MAX_TOKENS = 4_000
export const FALLBACK_MODEL_ID = 'grok-4.20-0309-non-reasoning'

function edgeEnv(name: string): string {
  const Deno = (globalThis as { Deno?: { env: { get: (key: string) => string | undefined } } }).Deno
  if (!Deno?.env?.get) return ''
  if (name === 'BA_DD_LLM_API_KEY') return Deno.env.get('BA_DD_LLM_API_KEY')?.trim() || ''
  if (name === 'BA_DD_LLM_MODEL') return Deno.env.get('BA_DD_LLM_MODEL')?.trim() || ''
  if (name === 'BA_DD_LLM_BASE_URL') return Deno.env.get('BA_DD_LLM_BASE_URL')?.trim() || ''
  if (name === 'BA_DD_LLM_PROVIDER') return Deno.env.get('BA_DD_LLM_PROVIDER')?.trim() || ''
  return Deno.env.get(name)?.trim() || ''
}

export function plannedModelId(): string {
  return llmChatTarget()?.model || FALLBACK_MODEL_ID
}

export function llmChatTarget(): { url: string; model: string } | null {
  const provider = edgeEnv('BA_DD_LLM_PROVIDER').toLowerCase()
  const model = edgeEnv('BA_DD_LLM_MODEL')
  if (provider === 'xai') {
    if (!model) return null
    return { url: XAI_CHAT_URL, model }
  }
  const endpoint = llmEndpoint()
  if (!endpoint) return null
  return { url: endpoint.toString(), model: model || DEFAULT_MODEL }
}

export type FactExtraction = {
  facts: DeckFacts
  modelRan: boolean
  skipReason: string | null
  claimsReturned: number
  claimsKept: number
  modelId: string | null
  analysis: DeckAnalysis | null
  usedFallback: boolean
}

type Attempt = {
  ok: true
  content: string
} | {
  ok: false
  reason: string
}

export type ModelStage = 'model' | 'repair' | 'fallback'

export async function extractDeckFactsWithOptionalLlm(
  text: string,
  fileName = '',
  numberedText = '',
  onStage?: (stage: ModelStage, modelId: string) => Promise<void>,
  deadlineAt?: number,
  onTick?: (elapsedMs: number, modelId: string) => Promise<void>,
): Promise<FactExtraction> {
  const heuristic = extractDeckFacts(text, fileName)
  const deck = fitNumberedDeck(numberedText.trim() || (text.trim() ? numberDeckPages([text]) : ''))
  const companyHint = heuristic.company === NOT_STATED ? '' : heuristic.company
  const run = await analyzeDeckText(deck, {
    companyHint,
    roundHint: heuristic.ask === NOT_STATED ? '' : heuristic.ask,
    onStage,
    deadlineAt,
    onTick,
  })
  const modelCompany = preferredCompany(run.analysis?.meta.company || '')
  const ask = preferredAsk(run.analysis?.snapshot.round)
  const facts = mergeModelFacts(
    run.analysis && run.modelRan
      ? {
          company: modelCompany || NOT_STATED,
          sector: NOT_STATED,
          ask: ask || NOT_STATED,
          claims: heuristic.claims,
        }
      : null,
    heuristic,
  )
  if (modelCompany) facts.company = modelCompany
  else facts.company = heuristic.company
  if (ask) facts.ask = ask
  return {
    facts,
    modelRan: run.modelRan,
    skipReason: run.skipReason,
    claimsReturned: run.analysis?.claims.length ?? 0,
    claimsKept: facts.claims.length,
    modelId: run.modelId,
    analysis: run.analysis,
    usedFallback: run.usedFallback,
  }
}

export type SectionCall = {
  content: string
  modelId: string
  ok: boolean
  reason: string | null
}

/** One model call. Fallback and repair are separate invocations, not extra calls here. */
export async function analyzeDeckSection(input: {
  system: string
  user: string
  mode: ModelPass
  onStage?: (stage: ModelStage, modelId: string) => Promise<void>
  onTick?: (elapsedMs: number, modelId: string) => Promise<void>
  deadlineAt?: number
  callTimeoutMs?: number
  ttftMs?: number
  repair?: boolean
}): Promise<SectionCall> {
  const key = edgeEnv('BA_DD_LLM_API_KEY')
  const target = llmChatTarget()
  const modelId = input.mode === 'fallback' ? FALLBACK_MODEL_ID : target?.model || ''
  if (!key) return { content: '', modelId: modelId || FALLBACK_MODEL_ID, ok: false, reason: 'missing_api_key' }
  if (!target || !modelId) return { content: '', modelId: FALLBACK_MODEL_ID, ok: false, reason: 'missing_model' }
  const url = input.mode === 'fallback' || target.url === XAI_CHAT_URL ? XAI_CHAT_URL : target.url
  const stage: ModelStage = input.repair ? 'repair' : input.mode === 'fallback' ? 'fallback' : 'model'
  const call = await runCall(
    input,
    stage,
    url,
    modelId,
    key,
    input.system,
    input.user,
  )
  if (!call.ok) {
    return { content: '', modelId, ok: false, reason: `${input.mode === 'fallback' ? 'fallback' : 'primary'}_${call.reason}` }
  }
  return { content: call.content, modelId, ok: true, reason: null }
}

export function scoresUser(deck: string, companyHint: string, roundHint: string): string {
  return `${SCORES_PROMPT}\n\n${JSON.stringify({
    company_hint: companyHint.slice(0, 80),
    round_hint: roundHint.slice(0, 180),
    deck_text: fitNumberedDeck(deck),
  })}`
}

export function narrativeUser(deck: string, scoresJson: unknown): string {
  return `${NARRATIVE_PROMPT}\n\n${JSON.stringify({
    scores_pass: scoresJson,
    deck_text: fitNumberedDeck(deck),
  })}`
}

export async function analyzeDeckText(
  numberedText: string,
  hints: {
    companyHint?: string
    roundHint?: string
    mode?: ModelPass
    onStage?: (stage: ModelStage, modelId: string) => Promise<void>
    deadlineAt?: number
    callTimeoutMs?: number
    ttftMs?: number
    onTick?: (elapsedMs: number, modelId: string) => Promise<void>
  } = {},
): Promise<{
  analysis: DeckAnalysis | null
  modelRan: boolean
  modelId: string | null
  skipReason: string | null
  usedFallback: boolean
}> {
  const key = edgeEnv('BA_DD_LLM_API_KEY')
  const target = llmChatTarget()
  const mode: ModelPass = hints.mode === 'fallback' ? 'fallback' : 'primary'
  const modelId = mode === 'fallback' ? FALLBACK_MODEL_ID : target?.model || ''
  if (!key) {
    return { analysis: null, modelRan: false, modelId: modelId || FALLBACK_MODEL_ID, skipReason: 'missing_api_key', usedFallback: mode === 'fallback' }
  }
  if (!target || !modelId) {
    return { analysis: null, modelRan: false, modelId: FALLBACK_MODEL_ID, skipReason: 'missing_model', usedFallback: false }
  }
  const deck = fitNumberedDeck(numberedText)
  if (deck.replace(/\s+/g, ' ').trim().length < 40) {
    return { analysis: null, modelRan: false, modelId, skipReason: 'empty_deck', usedFallback: mode === 'fallback' }
  }

  const user = JSON.stringify({
    company_hint: (hints.companyHint || '').slice(0, 80),
    round_hint: (hints.roundHint || '').slice(0, 180),
    deck_text: deck,
    user_question: 'default full DD',
  })
  const url = mode === 'fallback' ? XAI_CHAT_URL : target.url
  const call = await runCall(hints, mode === 'fallback' ? 'fallback' : 'model', url, modelId, key, SYSTEM_PROMPT, `${SCHEMA_PROMPT}\n\n${user}`)
  const usedFallback = mode === 'fallback'
  const reasons: string[] = []
  if (!call.ok) return failed(modelId, [`${usedFallback ? 'fallback' : 'primary'}_${call.reason}`])

  let content = call.content
  let parsedRaw = parseModelJson(content)
  let analysis = parseDeckAnalysis(parsedRaw)
  let repaired = false
  if (!analysis || !rawHasHero(parsedRaw)) {
    const repair = await runCall(
      hints,
      'repair',
      url,
      modelId,
      key,
      REPAIR_PROMPT,
      `${SCHEMA_PROMPT}\n\nDeck text:\n${deck}\n\nPrevious reply:\n${content.slice(0, 8_000)}`,
    )
    repaired = true
    if (repair.ok) {
      const repairedRaw = parseModelJson(repair.content)
      const repairedAnalysis = parseDeckAnalysis(repairedRaw)
      if (repairedAnalysis) {
        analysis = repairedAnalysis
        parsedRaw = repairedRaw
        content = repair.content
      }
    } else {
      reasons.push(`repair_${repair.reason}`)
    }
  }

  if (!analysis) return failed(modelId, [...reasons, 'unusable'])
  if (repaired) reasons.push('repaired')
  if (usedFallback) reasons.push('fallback')
  if (analysis.sections_missing.length > 0) reasons.push('partial')
  return {
    analysis,
    modelRan: true,
    modelId,
    skipReason: reasons.length ? clipReason(reasons.join(':')) : null,
    usedFallback,
  }
}

function failed(modelId: string, reasons: string[]) {
  return {
    analysis: null,
    modelRan: false,
    modelId,
    skipReason: clipReason(reasons.join(':')),
    usedFallback: reasons.some((reason) => reason.startsWith('fallback')),
  }
}

function clipReason(value: string): string {
  const cleaned = value.replace(/[^\w:.-]+/g, '_').replace(/_+/g, '_').slice(0, 160)
  return cleaned || 'model_request_failed'
}

function stageCap(stage: ModelStage): number {
  if (stage === 'repair') return REPAIR_MS
  if (stage === 'fallback') return FALLBACK_MS
  return PRIMARY_CAP_MS
}

async function runCall(
  hints: {
    onStage?: (stage: ModelStage, modelId: string) => Promise<void>
    onTick?: (elapsedMs: number, modelId: string) => Promise<void>
    deadlineAt?: number
    callTimeoutMs?: number
    ttftMs?: number
  },
  stage: ModelStage,
  url: string,
  model: string,
  key: string,
  system: string,
  user: string,
): Promise<Attempt> {
  const remaining = hints.deadlineAt == null ? STEP_ANALYSIS_CAP_MS : hints.deadlineAt - Date.now()
  if (remaining < 5_000) return { ok: false, reason: 'deadline' }
  await hints.onStage?.(stage, model)
  const timeoutMs = Math.min(hints.callTimeoutMs ?? stageCap(stage), remaining)
  const ttftMs = Math.min(hints.ttftMs ?? (stage === 'model' ? PRIMARY_TTFT_MS : timeoutMs), timeoutMs)
  return complete(url, model, key, system, user, timeoutMs, ttftMs, (elapsed) => hints.onTick?.(elapsed, model))
}

async function complete(
  url: string,
  model: string,
  key: string,
  system: string,
  user: string,
  timeoutMs: number,
  ttftMs: number,
  onTick?: (elapsedMs: number) => Promise<void> | undefined,
): Promise<Attempt> {
  const controller = new AbortController()
  const started = Date.now()
  let sawToken = false
  const capTimer = setTimeout(() => {
    const error = new Error('timed out')
    error.name = 'TimeoutError'
    controller.abort(error)
  }, timeoutMs)
  const ttftTimer = setTimeout(() => {
    if (sawToken) return
    const error = new Error('slow first token')
    error.name = 'TtftError'
    controller.abort(error)
  }, ttftMs)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: ANALYSIS_MAX_TOKENS,
        stream: true,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: controller.signal,
    })
    if (!response.ok) return { ok: false, reason: `http_${response.status}` }
    const content = await readModelContent(response, () => {
      if (!sawToken) {
        sawToken = true
        clearTimeout(ttftTimer)
      }
      return onTick?.(Date.now() - started)
    })
    if (!content.trim()) return { ok: false, reason: 'empty_content' }
    return { ok: true, content }
  } catch (err) {
    const aborted = controller.signal.reason
    const name = aborted instanceof Error ? aborted.name : err instanceof Error ? err.name : ''
    if (name === 'TtftError') return { ok: false, reason: 'ttft' }
    if (name === 'TimeoutError' || name === 'AbortError' || controller.signal.aborted) return { ok: false, reason: 'timeout' }
    return { ok: false, reason: 'request_failed' }
  } finally {
    clearTimeout(capTimer)
    clearTimeout(ttftTimer)
  }
}

async function readModelContent(response: Response, onToken?: () => Promise<void> | undefined): Promise<string> {
  const kind = response.headers.get('content-type') || ''
  if (!kind.includes('text/event-stream') || !response.body) {
    const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] }
    const content = body.choices?.[0]?.message?.content
    await onToken?.()
    return typeof content === 'string' ? content : ''
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  while (true) {
    const step = await reader.read()
    if (step.done) break
    buffer += decoder.decode(step.value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') continue
      try {
        const json = JSON.parse(data) as {
          choices?: { delta?: { content?: unknown }; message?: { content?: unknown } }[]
        }
        const delta = json.choices?.[0]?.delta?.content
        const message = json.choices?.[0]?.message?.content
        if (typeof delta === 'string') content += delta
        else if (typeof message === 'string') content += message
        if ((typeof delta === 'string' && delta) || (typeof message === 'string' && message)) await onToken?.()
      } catch {
        // A partial chunk is ignored. The next line still parses.
      }
    }
  }
  return content
}

function llmEndpoint(): URL | null {
  const base = (edgeEnv('BA_DD_LLM_BASE_URL') || DEFAULT_BASE).replace(/\/$/, '')
  let endpoint: URL
  try {
    endpoint = new URL(`${base}/chat/completions`)
  } catch {
    return null
  }
  if (!parsePublicHttpsUrl(`${endpoint.origin}/`).ok) return null
  return endpoint
}

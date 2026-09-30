/**
 * Same secret names as due-diligence-start/llm.ts.
 * The frame records whether a provider is configured. It does not call the model.
 * BA_DD_LLM_API_KEY, BA_DD_LLM_MODEL, BA_DD_LLM_BASE_URL, BA_DD_LLM_PROVIDER.
 */

const XAI_CHAT_URL = 'https://api.x.ai/v1/chat/completions'
const DEFAULT_MODEL = 'gpt-4o-mini'
const DEFAULT_BASE = 'https://api.openai.com/v1'

function edgeEnv(name: string): string {
  const runtime = globalThis as { Deno?: { env?: { get: (key: string) => string | undefined } } }
  return runtime.Deno?.env?.get?.(name)?.trim() || ''
}

export function aiProviderTarget(): { url: string; model: string } | null {
  const provider = edgeEnv('BA_DD_LLM_PROVIDER').toLowerCase()
  const model = edgeEnv('BA_DD_LLM_MODEL')
  if (provider === 'xai') {
    if (!model) return null
    return { url: XAI_CHAT_URL, model }
  }
  const base = edgeEnv('BA_DD_LLM_BASE_URL') || (provider === 'openai' || provider === '' ? DEFAULT_BASE : '')
  if (!base) return null
  try {
    const url = new URL(base)
    const path = url.pathname.endsWith('/chat/completions') ? url.pathname : `${url.pathname.replace(/\/$/, '')}/chat/completions`
    url.pathname = path
    return { url: url.toString(), model: model || DEFAULT_MODEL }
  } catch {
    return null
  }
}

export function aiProviderNote(): { modelId: string | null; skipReason: string | null } {
  const key = edgeEnv('BA_DD_LLM_API_KEY')
  const target = aiProviderTarget()
  if (!key || !target) return { modelId: null, skipReason: 'provider_not_configured' }
  return { modelId: target.model, skipReason: null }
}

/** One chat completion on the same BA_DD_LLM_* secrets. No new secret names. */
export async function completeAiToolPrompt(
  system: string,
  user: string,
): Promise<{ text: string | null; modelId: string | null; skipReason: string | null }> {
  const note = aiProviderNote()
  const target = aiProviderTarget()
  const key = edgeEnv('BA_DD_LLM_API_KEY')
  if (note.skipReason || !target || !key) {
    return { text: null, modelId: note.modelId, skipReason: note.skipReason || 'provider_not_configured' }
  }
  const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(12_000) : undefined
  try {
    const res = await fetch(target.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: target.model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal,
    })
    if (!res.ok) return { text: null, modelId: target.model, skipReason: 'provider_error' }
    const payload = (await res.json()) as { choices?: { message?: { content?: unknown } }[] }
    const text = payload.choices?.[0]?.message?.content
    return {
      text: typeof text === 'string' && text.trim() ? text : null,
      modelId: target.model,
      skipReason: typeof text === 'string' && text.trim() ? null : 'provider_error',
    }
  } catch {
    return { text: null, modelId: target.model, skipReason: 'provider_error' }
  }
}

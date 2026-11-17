/**
 * Client for the server-side AI assistant endpoint.
 *
 * The provider key lives only on the FastAPI backend (ASSISTANT_API_KEY).
 * When `VITE_API_BASE_URL` is empty (the standalone GitHub Pages deployment)
 * or the backend has no key, callers get a clear ASSISTANT_NOT_CONFIGURED
 * error and the UI shows setup guidance instead of a fake reply.
 *
 * Requests carry city-level conditions and the conversation only. Profile
 * name, email, and device location are never included — the backend schema
 * rejects such fields outright.
 */

const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/+$/, '') ?? ''
export const ASSISTANT_API_CONFIGURED = baseUrl.length > 0
const REQUEST_TIMEOUT_MS = 60000

export class AssistantApiError extends Error {
  constructor(message: string, readonly code?: string, readonly status?: number) {
    super(message)
    this.name = 'AssistantApiError'
  }
}

export type AssistantEvidenceType = 'weather-model' | 'air-quality-model' | 'official-warning' | 'app-state'
export type AssistantFreshness = 'current' | 'stale' | 'unknown'

/** Wire shape (snake_case) — mirrors backend schemas.AssistantContextItem. */
export interface AssistantContextItem {
  label: string
  value: string
  evidence_type: AssistantEvidenceType
  source: string
  observed_at: string | null
  freshness: AssistantFreshness
}

export interface AssistantMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistantChatRequest {
  region: { slug: string; name: string; state: string }
  messages: AssistantMessage[]
  context: AssistantContextItem[]
}

export interface AssistantSource {
  label: string
  source: string
  evidenceType: AssistantEvidenceType
  observedAt: string | null
  freshness: AssistantFreshness
}

export interface AssistantChatResult {
  reply: string
  model: string
  generatedAt: string
  sources: AssistantSource[]
  disclaimer: string
}

export interface AssistantStatus {
  configured: boolean
  model: string | null
  dataPolicy: string
}

type JsonObject = Record<string, unknown>

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new AssistantApiError('The assistant service returned an invalid response.')
  return value
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function evidenceType(value: unknown): AssistantEvidenceType {
  if (value === 'weather-model' || value === 'air-quality-model' || value === 'official-warning' || value === 'app-state') return value
  throw new AssistantApiError('The assistant service returned an unknown evidence type.')
}

function freshness(value: unknown): AssistantFreshness {
  if (value === 'current' || value === 'stale' || value === 'unknown') return value
  throw new AssistantApiError('The assistant service returned an invalid freshness state.')
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  if (!ASSISTANT_API_CONFIGURED) {
    throw new AssistantApiError('The assistant backend URL is not configured.', 'ASSISTANT_NOT_CONFIGURED')
  }
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...init,
    })
    const payload = await response.json().catch(() => null) as unknown
    if (!response.ok) {
      const error = payload && typeof payload === 'object' ? payload as JsonObject : {}
      const code = nullableText(error.code)
      const detail = nullableText(error.detail)
      if (response.status === 503 && code === 'ASSISTANT_NOT_CONFIGURED') {
        throw new AssistantApiError('The assistant provider is not configured on the backend.', 'ASSISTANT_NOT_CONFIGURED', 503)
      }
      throw new AssistantApiError(detail ?? `The assistant service returned HTTP ${response.status}.`, code ?? 'ASSISTANT_ERROR', response.status)
    }
    return payload
  } catch (error) {
    if (error instanceof AssistantApiError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AssistantApiError('The assistant service took too long to respond.', 'ASSISTANT_TIMEOUT')
    }
    throw new AssistantApiError('The assistant service could not be reached.', 'ASSISTANT_UNREACHABLE')
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

function source(value: unknown): AssistantSource {
  const item = value as JsonObject
  return {
    label: text(item.label), source: text(item.source), evidenceType: evidenceType(item.evidence_type),
    observedAt: nullableText(item.observed_at), freshness: freshness(item.freshness ?? 'unknown'),
  }
}

export async function sendAssistantChat(chatRequest: AssistantChatRequest): Promise<AssistantChatResult> {
  const item = (await request('/api/v1/assistant/chat', {
    method: 'POST',
    body: JSON.stringify(chatRequest),
  })) as JsonObject
  return {
    reply: text(item.reply),
    model: text(item.model),
    generatedAt: text(item.generated_at),
    sources: Array.isArray(item.sources) ? item.sources.map(source) : [],
    disclaimer: text(item.disclaimer),
  }
}

export async function getAssistantStatus(): Promise<AssistantStatus> {
  const item = (await request('/api/v1/assistant/status')) as JsonObject
  const status = text(item.status)
  return {
    configured: status === 'ready',
    model: nullableText(item.model),
    dataPolicy: text(item.data_policy),
  }
}

/**
 * Local chat-history model.
 *
 * Conversations live in this browser only (localStorage, key `hs-chats-v1`);
 * there is no sign-in and nothing syncs between devices. Storage failures are
 * tolerated so private-browsing modes degrade instead of crashing.
 */

export interface ChatMessageSource {
  label: string
  source: string
  evidenceType: string
  observedAt: string | null
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  /** Source list + disclaimer returned with an assistant reply. */
  sources?: ChatMessageSource[]
  disclaimer?: string
}

export interface ChatConversation {
  id: string
  title: string | null
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
}

export interface ChatStore {
  conversations: ChatConversation[]
  activeId: string | null
}

export const EMPTY_CHAT_STORE: ChatStore = { conversations: [], activeId: null }

export function makeChatId(): string {
  try {
    return globalThis.crypto.randomUUID()
  } catch {
    return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

export function deriveChatTitle(content: string): string {
  const collapsed = content.trim().replace(/\s+/g, ' ')
  return collapsed.length > 60 ? `${collapsed.slice(0, 59)}…` : collapsed
}

/** Stable display title: explicit rename wins, otherwise first message, otherwise a draft label. */
export function chatTitle(conversation: ChatConversation, draftLabel: string): string {
  if (conversation.title) return conversation.title
  const derived = deriveChatTitle(conversation.messages[0]?.content ?? '')
  return derived || draftLabel
}

export function chatPreview(conversation: ChatConversation, emptyLabel: string): string {
  const last = conversation.messages[conversation.messages.length - 1]
  if (!last) return emptyLabel
  const collapsed = last.content.trim().replace(/\s+/g, ' ')
  return collapsed.length > 80 ? `${collapsed.slice(0, 79)}…` : collapsed
}

export function formatChatTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return ''
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const dayMs = 24 * 60 * 60 * 1000
  const diffDays = Math.floor((startOfNow - new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime()) / dayMs)
  const time = then.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  if (diffDays <= 0) return time
  if (diffDays === 1) return 'Yesterday'
  return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/** Human-readable export of one conversation. Kept pure so tests can pin it. */
export function serializeConversation(conversation: ChatConversation): string {
  return JSON.stringify({
    title: conversation.title ?? conversation.messages[0]?.content ?? 'Conversation',
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages: conversation.messages.map((message) => ({
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    })),
    note: 'Exported from Heat Shield AI. Conversations are stored locally in your browser.',
  }, null, 2)
}

export function downloadConversation(conversation: ChatConversation): void {
  const slug = (conversation.title ?? 'heat-shield-chat').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'heat-shield-chat'
  const blob = new Blob([serializeConversation(conversation)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${slug}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

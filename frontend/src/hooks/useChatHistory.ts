/**
 * Local chat-history store backed by localStorage (`hs-chats-v1`).
 *
 * One conversation can be active at a time. A brand-new chat is an empty
 * draft that appears in history immediately; everything persists across page
 * refreshes in this browser only.
 */

import { useCallback } from 'react'
import { useLocalStorage } from './useLocalStorage'
import {
  EMPTY_CHAT_STORE, deriveChatTitle, makeChatId,
  type ChatConversation, type ChatMessage, type ChatStore,
} from '../data/chatHistory'

export interface ChatHistoryApi {
  conversations: ChatConversation[]
  activeConversation: ChatConversation | null
  newChat: () => string
  openChat: (id: string) => void
  renameChat: (id: string, title: string) => void
  deleteChat: (id: string) => void
  clearAllChats: () => void
  appendMessage: (
    role: ChatMessage['role'],
    content: string,
    meta?: { sources?: ChatMessage['sources']; disclaimer?: string },
    targetId?: string,
  ) => void
}

export function useChatHistory(): ChatHistoryApi {
  const [store, setStore] = useLocalStorage<ChatStore>('hs-chats-v1', EMPTY_CHAT_STORE)
  const conversations = store.conversations
  const activeConversation = conversations.find((conversation) => conversation.id === store.activeId) ?? null

  const newChat = useCallback(() => {
    const existingEmpty = conversations.find((conversation) => conversation.messages.length === 0)
    if (existingEmpty) {
      setStore((previous) => ({ ...previous, activeId: existingEmpty.id }))
      return existingEmpty.id
    }
    const conversation: ChatConversation = {
      id: makeChatId(), title: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [],
    }
    setStore((previous) => ({ conversations: [conversation, ...previous.conversations], activeId: conversation.id }))
    return conversation.id
  }, [conversations, setStore])

  const openChat = useCallback((id: string) => {
    setStore((previous) => (previous.conversations.some((conversation) => conversation.id === id)
      ? { ...previous, activeId: id }
      : previous))
  }, [setStore])

  const renameChat = useCallback((id: string, title: string) => {
    const trimmed = title.trim().slice(0, 80)
    if (!trimmed) return
    setStore((previous) => ({
      ...previous,
      conversations: previous.conversations.map((conversation) => conversation.id === id
        ? { ...conversation, title: trimmed, updatedAt: new Date().toISOString() }
        : conversation),
    }))
  }, [setStore])

  const deleteChat = useCallback((id: string) => {
    setStore((previous) => ({
      conversations: previous.conversations.filter((conversation) => conversation.id !== id),
      activeId: previous.activeId === id ? null : previous.activeId,
    }))
  }, [setStore])

  const clearAllChats = useCallback(() => {
    setStore({ conversations: [], activeId: null })
  }, [setStore])

  const appendMessage = useCallback((
    role: ChatMessage['role'],
    content: string,
    meta?: { sources?: ChatMessage['sources']; disclaimer?: string },
    targetId?: string,
  ) => {
    const message: ChatMessage = {
      id: makeChatId(), role, content, createdAt: new Date().toISOString(),
      sources: meta?.sources, disclaimer: meta?.disclaimer,
    }
    setStore((previous) => {
      const now = new Date().toISOString()
      const activeId = targetId ?? previous.activeId
      const target = previous.conversations.find((conversation) => conversation.id === activeId)
      if (!target) {
        // A caller-supplied targetId becomes the new conversation's id, so the
        // sender can await a reply against it before React state has settled.
        const conversation: ChatConversation = {
          id: activeId ?? makeChatId(), title: role === 'user' ? deriveChatTitle(content) : null,
          createdAt: now, updatedAt: now, messages: [message],
        }
        return { conversations: [conversation, ...previous.conversations], activeId: conversation.id }
      }
      return {
        ...previous,
        conversations: previous.conversations.map((conversation) => {
          if (conversation.id !== activeId) return conversation
          const isFirstUserMessage = conversation.title === null && role === 'user' && conversation.messages.length === 0
          return {
            ...conversation,
            title: isFirstUserMessage ? deriveChatTitle(content) : conversation.title,
            updatedAt: now,
            messages: [...conversation.messages, message],
          }
        }),
      }
    })
  }, [setStore])

  return { conversations, activeConversation, newChat, openChat, renameChat, deleteChat, clearAllChats, appendMessage }
}

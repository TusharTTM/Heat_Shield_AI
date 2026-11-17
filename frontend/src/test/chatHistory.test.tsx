import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { AppProvider } from '../context/AppContext'
import { WeatherProvider } from '../context/WeatherContext'
import { getAirQuality, getWeather } from '../api/openMeteo'
import { sendAssistantChat, type AssistantChatResult } from '../api/assistant'
import type { ChatStore } from '../data/chatHistory'
import { airQualityResult, weatherResult } from './weatherFixtures'

vi.mock('../api/openMeteo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/openMeteo')>()
  return { ...actual, getWeather: vi.fn(), getAirQuality: vi.fn() }
})

vi.mock('../api/assistant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/assistant')>()
  return {
    ...actual,
    ASSISTANT_API_CONFIGURED: true,
    sendAssistantChat: vi.fn(),
    getAssistantStatus: vi.fn(),
  }
})

function renderApp(route = '/menu') {
  return render(<AppProvider><WeatherProvider><MemoryRouter initialEntries={[route]}><App /></MemoryRouter></WeatherProvider></AppProvider>)
}

const REPLY: AssistantChatResult = {
  reply: 'Stay hydrated and limit afternoon sun.',
  model: 'test-model',
  generatedAt: '2026-11-16T12:00:00Z',
  sources: [],
  disclaimer: 'Modelled weather and air quality are model estimates, not official warnings.',
}

function seedStore(store: ChatStore) {
  localStorage.setItem('hs-chats-v1', JSON.stringify(store))
}

function readStore(): ChatStore {
  return JSON.parse(localStorage.getItem('hs-chats-v1') ?? '{"conversations":[],"activeId":null}') as ChatStore
}

beforeEach(() => {
  cleanup()
  localStorage.clear()
  window.scrollTo = vi.fn()
  vi.mocked(getWeather).mockReset().mockImplementation(async (region) => weatherResult(region.slug))
  vi.mocked(getAirQuality).mockReset().mockImplementation(async (region) => airQualityResult(region.slug))
  vi.mocked(sendAssistantChat).mockReset().mockResolvedValue(REPLY)
  URL.createObjectURL = vi.fn(() => 'blob:export-stub')
  URL.revokeObjectURL = vi.fn()
})

describe('local chat history', () => {
  it('keeps created conversations available after a page refresh', async () => {
    const user = userEvent.setup()
    renderApp('/assistant')
    await user.type(screen.getByRole('textbox', { name: 'Ask Heat Shield' }), 'Plan my day in the heat')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => within(screen.getByRole('log')).getByText('Stay hydrated and limit afternoon sun.'))

    const stored = readStore()
    expect(stored.conversations).toHaveLength(1)
    expect(stored.conversations[0].messages).toHaveLength(2)
    expect(stored.conversations[0].title).toBe('Plan my day in the heat')

    // "Refresh": unmount and load the menu from the persisted store.
    cleanup()
    renderApp('/menu')
    expect(await screen.findByRole('button', { name: /Open chat: Plan my day in the heat/ })).toBeInTheDocument()

    cleanup()
    renderApp('/assistant')
    const log = await screen.findByRole('log')
    expect(within(log).getByText('Plan my day in the heat')).toBeInTheDocument()
    expect(within(log).getByText('Stay hydrated and limit afternoon sun.')).toBeInTheDocument()
  })

  it('starts a new chat empty and does not duplicate empty drafts', async () => {
    const user = userEvent.setup()
    renderApp('/assistant')
    expect(screen.getByRole('heading', { name: 'Heat Shield AI' })).toBeInTheDocument()
    expect(screen.queryByRole('log')).not.toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'Ask Heat Shield' }), 'First question')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => within(screen.getByRole('log')).getByText('Stay hydrated and limit afternoon sun.'))

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByRole('button', { name: 'New Chat' }))
    expect(screen.getByRole('heading', { name: 'Heat Shield AI' })).toBeInTheDocument()
    expect(screen.queryByRole('log')).not.toBeInTheDocument()
    expect(readStore().conversations.filter((conversation) => conversation.messages.length === 0)).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByRole('button', { name: 'New Chat' }))
    expect(readStore().conversations.filter((conversation) => conversation.messages.length === 0)).toHaveLength(1)
  })

  it('renames, exports, and deletes a saved chat with confirmation', async () => {
    const user = userEvent.setup()
    seedStore({
      activeId: 'c1',
      conversations: [{
        id: 'c1', title: 'Old title', createdAt: '2026-11-16T10:00:00Z', updatedAt: '2026-11-16T10:00:00Z',
        messages: [{ id: 'm1', role: 'user', content: 'What is the heat index?', createdAt: '2026-11-16T10:00:00Z' }],
      }],
    })
    renderApp('/menu')
    await screen.findByRole('button', { name: /Open chat: Old title/ })

    // Rename
    await user.click(screen.getByRole('button', { name: /Rename: Old title/ }))
    const input = screen.getByRole('textbox', { name: 'Chat title' })
    await user.clear(input)
    await user.type(input, 'Heat index notes')
    await user.click(screen.getByRole('button', { name: 'Save title' }))
    expect(await screen.findByRole('button', { name: /Open chat: Heat index notes/ })).toBeInTheDocument()
    expect(readStore().conversations[0].title).toBe('Heat index notes')

    // Export downloads JSON of the conversation
    await user.click(screen.getByRole('button', { name: /Export: Heat index notes/ }))
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.readAsText(blob)
    })
    const exported = JSON.parse(text) as { title: string; messages: { content: string }[] }
    expect(exported.title).toBe('Heat index notes')
    expect(exported.messages[0].content).toBe('What is the heat index?')

    // Delete requires confirmation, then removes the conversation
    await user.click(screen.getByRole('button', { name: /Delete: Heat index notes/ }))
    expect(screen.getByText('Delete this chat?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Confirm: Delete this chat/ }))
    await waitFor(() => expect(readStore().conversations).toHaveLength(0))
    expect(screen.getByText(/No conversations yet/i)).toBeInTheDocument()
  })

  it('reopens a saved chat and clears all history only after confirmation', async () => {
    const user = userEvent.setup()
    seedStore({
      activeId: null,
      conversations: [
        {
          id: 'c1', title: 'Water plan', createdAt: '2026-11-15T10:00:00Z', updatedAt: '2026-11-15T10:00:00Z',
          messages: [{ id: 'm1', role: 'user', content: 'When should I drink water?', createdAt: '2026-11-15T10:00:00Z' }],
        },
        {
          id: 'c2', title: 'Air quality', createdAt: '2026-11-14T10:00:00Z', updatedAt: '2026-11-14T10:00:00Z',
          messages: [{ id: 'm2', role: 'user', content: 'Is the air clean?', createdAt: '2026-11-14T10:00:00Z' }],
        },
      ],
    })
    renderApp('/menu')
    const list = screen.getByRole('list')

    // Reopen a saved chat from history.
    await user.click(within(list).getByRole('button', { name: /Open chat: Water plan/ }))
    expect(readStore().activeId).toBe('c1')

    // Clearing asks for confirmation first.
    await user.click(screen.getByRole('button', { name: 'Clear all history' }))
    expect(screen.getByText('Clear every saved chat?')).toBeInTheDocument()
    expect(readStore().conversations).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(readStore().conversations).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Clear all history' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(readStore().conversations).toHaveLength(0))
    expect(screen.getByText(/No conversations yet/i)).toBeInTheDocument()
  })
})

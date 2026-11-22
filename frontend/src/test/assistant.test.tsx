import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { AppProvider } from '../context/AppContext'
import { WeatherProvider } from '../context/WeatherContext'
import { getAirQuality, getWeather } from '../api/openMeteo'
import {
  AssistantApiError, sendAssistantChat,
  type AssistantChatRequest, type AssistantChatResult,
} from '../api/assistant'
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

function renderApp(route = '/assistant') {
  return render(<AppProvider><WeatherProvider><MemoryRouter initialEntries={[route]}><App /></MemoryRouter></WeatherProvider></AppProvider>)
}

const REPLY: AssistantChatResult = {
  reply: 'Drink water and stay in shade between 12 PM and 4 PM.',
  model: 'test-model',
  generatedAt: '2026-11-16T12:00:00Z',
  sources: [
    { label: 'Heat index', source: 'Open-Meteo (weather model)', evidenceType: 'weather-model', observedAt: '2026-11-16T11:00:00Z', freshness: 'current' },
    { label: 'Official SACHET alert: Heat wave', source: 'NDMA SACHET (official CAP feed)', evidenceType: 'official-warning', observedAt: null, freshness: 'unknown' },
    { label: 'US AQI (model estimate)', source: 'Open-Meteo Air Quality API (CAMS model estimate)', evidenceType: 'air-quality-model', observedAt: '2026-11-16T11:00:00Z', freshness: 'current' },
    { label: 'Official government warnings', source: 'Heat Shield configuration', evidenceType: 'app-state', observedAt: null, freshness: 'unknown' },
  ],
  disclaimer: 'Modelled weather and air quality are model estimates, not official warnings. Not medical advice.',
}

beforeEach(() => {
  cleanup()
  localStorage.clear()
  window.scrollTo = vi.fn()
  vi.mocked(getWeather).mockReset().mockImplementation(async (region) => weatherResult(region.slug))
  vi.mocked(getAirQuality).mockReset().mockImplementation(async (region) => airQualityResult(region.slug))
  vi.mocked(sendAssistantChat).mockReset()
})

describe('the connected AI assistant', () => {
  it('sends city conditions only, and shows the reply with separated sources', async () => {
    const user = userEvent.setup()
    let resolveChat: (value: AssistantChatResult) => void = () => undefined
    vi.mocked(sendAssistantChat).mockReturnValue(new Promise<AssistantChatResult>((resolve) => { resolveChat = resolve }))
    renderApp()

    // The route is code-split, so its controls appear a tick after render.
    await user.type(await screen.findByRole('textbox', { name: 'Ask Heat Shield' }), 'How hot does it feel?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(screen.getByText('Thinking…')).toBeInTheDocument()
    resolveChat(REPLY)
    const log = await screen.findByRole('log')
    await waitFor(() => within(log).getByText('Drink water and stay in shade between 12 PM and 4 PM.'))
    expect(within(log).getByText('How hot does it feel?')).toBeInTheDocument()

    const payload = vi.mocked(sendAssistantChat).mock.calls[0][0] as AssistantChatRequest
    expect(Object.keys(payload).sort()).toEqual(['context', 'messages', 'region'])
    expect(payload.region).toEqual({ slug: 'mumbai', name: 'Mumbai', state: 'Maharashtra' })
    expect(payload.messages).toEqual([{ role: 'user', content: 'How hot does it feel?' }])
    expect(payload.context.length).toBeGreaterThan(3)
    for (const item of payload.context) {
      expect(['weather-model', 'air-quality-model', 'official-warning', 'app-state']).toContain(item.evidence_type)
      expect(item.source.length).toBeGreaterThan(0)
    }
    const wire = JSON.stringify(payload)
    expect(wire).not.toMatch(/email|latitude|longitude|@/)
    expect(wire).toContain('not an all-clear')

    // Model estimates, official warnings and app status are labelled apart.
    expect(within(log).getByText(/Model estimate \(weather model\)/)).toBeInTheDocument()
    expect(within(log).getByText(/Official warning \(government feed\)/)).toBeInTheDocument()
    expect(within(log).getByText(/Model estimate \(air quality model\)/)).toBeInTheDocument()
    expect(within(log).getByText(/App status/)).toBeInTheDocument()
    expect(within(log).getByText(/not official warnings/)).toBeInTheDocument()
  })

  it('shows a retryable error state and keeps the conversation', async () => {
    const user = userEvent.setup()
    vi.mocked(sendAssistantChat)
      .mockRejectedValueOnce(new AssistantApiError('The assistant service could not be reached.', 'ASSISTANT_UNREACHABLE'))
      .mockResolvedValueOnce(REPLY)
    renderApp()

    await user.type(screen.getByRole('textbox', { name: 'Ask Heat Shield' }), 'What should I do today?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The assistant could not reply')
    expect(within(screen.getByRole('log')).getByText('What should I do today?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => within(screen.getByRole('log')).getByText('Drink water and stay in shade between 12 PM and 4 PM.'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('falls back to the setup notice when the backend has no provider key', async () => {
    const user = userEvent.setup()
    vi.mocked(sendAssistantChat).mockRejectedValue(
      new AssistantApiError('The assistant provider is not configured on the backend.', 'ASSISTANT_NOT_CONFIGURED', 503),
    )
    renderApp()

    await user.type(screen.getByRole('textbox', { name: 'Ask Heat Shield' }), 'Is the air quality okay?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByRole('heading', { name: 'Assistant service not configured' })).toBeInTheDocument()
    // A short status message, not operator setup instructions.
    expect(screen.getByText(/not available right now/i)).toBeInTheDocument()
    expect(screen.queryByText(/VITE_API_BASE_URL/)).toBeNull()
  })

  it('starts empty and lets suggested prompts ask a question', async () => {
    const user = userEvent.setup()
    vi.mocked(sendAssistantChat).mockResolvedValue(REPLY)
    renderApp()

    expect(screen.getByRole('heading', { name: 'Heat Shield AI' })).toBeInTheDocument()
    expect(screen.getByText('Ask about heat, air quality, and staying safe in Mumbai')).toBeInTheDocument()
    expect(screen.queryByRole('log')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'How hot does it feel in Mumbai right now?' }))
    await waitFor(() => expect(screen.getByRole('log')).toBeInTheDocument())
    await waitFor(() => within(screen.getByRole('log')).getByText('Drink water and stay in shade between 12 PM and 4 PM.'))
    expect(within(screen.getByRole('log')).getByText('How hot does it feel in Mumbai right now?')).toBeInTheDocument()
  })
})

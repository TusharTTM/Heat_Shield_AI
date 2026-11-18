import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowUp, Menu as MenuIcon, Paperclip, Plus, ShieldCheck, Volume2, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  ASSISTANT_API_CONFIGURED, AssistantApiError, sendAssistantChat,
  type AssistantChatResult,
} from '../api/assistant'
import { buildAssistantContext } from '../data/assistantContext'
import { makeChatId } from '../data/chatHistory'
import { ChatHistoryMenu } from '../components/ChatHistoryMenu'
import { useApp } from '../context/AppContext'
import { useSettings } from '../context/SettingsContext'
import { useWeather } from '../context/WeatherContext'
import { getRegion } from '../data/regions'
import { useChatHistory } from '../hooks/useChatHistory'
import { useOfficialAlerts } from '../hooks/useOfficialData'
import { useT } from '../i18n'

type Phase = 'idle' | 'loading' | 'error' | 'unavailable'

const SUGGESTED_PROMPTS = (city: string) => [
  `How hot does it feel in ${city} right now?`,
  'Is the air quality okay for outdoor activity?',
  'What should I do during a heat wave?',
]

export default function Assistant() {
  const t = useT()
  const { region } = useApp()
  const { formatTemp, tempSymbol } = useSettings()
  const weatherState = useWeather()
  const official = useOfficialAlerts(region)
  const history = useChatHistory()
  const selected = getRegion(region)

  const [prompt, setPrompt] = useState('')
  const [fileName, setFileName] = useState('')
  const [phase, setPhase] = useState<Phase>(ASSISTANT_API_CONFIGURED ? 'idle' : 'unavailable')
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const threadEnd = useRef<HTMLDivElement>(null)

  const conversation = history.activeConversation
  const messages = conversation?.messages ?? []

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.length, phase])

  // The drawer is a navigation surface, so Escape closes it and focus returns
  // to the button that opened it. Focus enters the drawer on open.
  useEffect(() => {
    if (!menuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButton.current?.focus()
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen])

  const runRequest = async (targetId: string, requestMessages: { role: 'user' | 'assistant'; content: string }[]) => {
    if (requestMessages.length === 0 || requestMessages[requestMessages.length - 1].role !== 'user') return
    if (!ASSISTANT_API_CONFIGURED) {
      setPhase('unavailable')
      return
    }
    setPhase('loading')
    setErrorDetail(null)
    try {
      const result: AssistantChatResult = await sendAssistantChat({
        region: { slug: selected.slug, name: selected.name, state: selected.state },
        messages: requestMessages.slice(-20),
        context: buildAssistantContext({
          weather: weatherState.data,
          weatherFreshness: weatherState.freshness,
          airQuality: weatherState.airQuality,
          airFreshness: weatherState.airFreshness,
          official: { status: official.status, data: official.data },
          formatTemp,
          tempSymbol,
        }),
      })
      history.appendMessage('assistant', result.reply, {
        sources: result.sources.map((source) => ({
          label: source.label, source: source.source, evidenceType: source.evidenceType, observedAt: source.observedAt,
        })),
        disclaimer: result.disclaimer,
      }, targetId)
      setPhase('idle')
    } catch (error) {
      if (error instanceof AssistantApiError && error.code === 'ASSISTANT_NOT_CONFIGURED') {
        setPhase('unavailable')
        return
      }
      setErrorDetail(error instanceof Error ? error.message : 'The assistant service could not be reached.')
      setPhase('error')
    }
  }

  const send = (text: string) => {
    if (phase === 'loading') return
    if (!ASSISTANT_API_CONFIGURED) {
      setPhase('unavailable')
      return
    }
    // Snapshot the conversation before appending: the store state settles on
    // the next render, so the request builds its message list synchronously.
    const targetId = conversation?.id ?? makeChatId()
    const requestMessages = [
      ...(conversation?.messages ?? []).slice(-19).map((message) => ({ role: message.role, content: message.content })),
      { role: 'user' as const, content: text },
    ]
    history.appendMessage('user', text, undefined, targetId)
    void runRequest(targetId, requestMessages)
  }

  const submitPrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = prompt.trim()
    if (!text) return
    send(text)
    if (ASSISTANT_API_CONFIGURED) setPrompt('')
  }

  const retry = () => {
    const current = history.activeConversation
    if (!current) return
    const requestMessages = current.messages.slice(-20).map((message) => ({ role: message.role, content: message.content }))
    void runRequest(current.id, requestMessages)
  }

  return <div className={`assistant-page${menuOpen ? ' menu-open' : ''}`}>
    <header className="assistant-topbar">
      <Link to="/" className="assistant-back-link" aria-label={t('assistant.backToDashboard')}>
        <ArrowLeft size={20} aria-hidden="true" />
      </Link>
      <button
        ref={menuButton}
        type="button"
        className="assistant-menu-trigger"
        aria-label={t('assistant.openMenu')}
        aria-expanded={menuOpen}
        aria-controls="assistant-menu-drawer"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <MenuIcon size={18} aria-hidden="true" />
        <span>{t('assistant.menu')}</span>
      </button>
    </header>

    {messages.length === 0
      ? <section className="assistant-welcome" aria-labelledby="assistant-title">
        <span className="assistant-logo" aria-hidden="true"><ShieldCheck size={52} /></span>
        <h1 id="assistant-title">Heat Shield AI</h1>
        <p className="assistant-subtitle">{t('assistant.subtitle', { city: selected.name })}</p>
      </section>
      : <h1 id="assistant-title" className="sr-only">Heat Shield AI</h1>}

    {messages.length > 0 && (
      <section className="assistant-thread" aria-label={t('assistant.conversation')} role="log">
        {messages.map((message) => <article
          key={message.id}
          className={`assistant-message assistant-message--${message.role}`}
          aria-label={message.role === 'user' ? t('assistant.you') : 'Heat Shield AI'}
        >
          <div className="assistant-message-bubble">{message.content}</div>
          {message.sources && message.sources.length > 0 && (
            <div className="assistant-sources">
              <span className="assistant-sources-title">{t('assistant.sources')}</span>
              <ul>
                {message.sources.map((source, index) => <li key={`${source.label}-${index}`}>
                  <strong>{source.label}</strong>
                  <small>
                    {source.evidenceType === 'weather-model' && 'Model estimate (weather model) · '}
                    {source.evidenceType === 'air-quality-model' && 'Model estimate (air quality model) · '}
                    {source.evidenceType === 'official-warning' && 'Official warning (government feed) · '}
                    {source.evidenceType === 'app-state' && 'App status · '}
                    {source.source}
                    {source.observedAt && ` · data time ${source.observedAt}`}
                  </small>
                </li>)}
              </ul>
              {message.disclaimer && <p className="assistant-disclaimer">{message.disclaimer}</p>}
            </div>
          )}
        </article>)}

        {phase === 'loading' && (
          <article className="assistant-message assistant-message--assistant" aria-label="Heat Shield AI">
            <div className="assistant-message-bubble assistant-thinking" role="status">{t('assistant.thinking')}</div>
          </article>
        )}

        {phase === 'error' && (
          <div className="assistant-error" role="alert">
            <strong>{t('assistant.errorTitle')}</strong>
            <p>{errorDetail}</p>
            <button type="button" className="button button-primary" onClick={retry}>
              {t('assistant.retry')}
            </button>
          </div>
        )}
        <div ref={threadEnd} />
      </section>
    )}

    {phase === 'unavailable' && (
      <section className="assistant-unavailable" role="status" aria-labelledby="assistant-unavailable-title">
        <h2 id="assistant-unavailable-title">{t('assistant.notConfiguredTitle')}</h2>
        <p>This deployment has no assistant backend connected, so no answers are generated — and none are faked.</p>
        <details className="official-why-drawer">
          <summary>Technical setup details</summary>
          <p className="operator-detail-note">
            <span className="operator-detail-tag">For site operators:</span> Set{' '}
            <code>VITE_API_BASE_URL</code> to a deployed Heat Shield FastAPI backend (see{' '}
            <code>docs/DEPLOYMENT.md</code>) and configure <code>ASSISTANT_API_KEY</code> on the
            server. The key never reaches the browser; without it the backend fails closed with{' '}
            <code>503 ASSISTANT_NOT_CONFIGURED</code>. On the standalone GitHub Pages deployment
            this message is expected until a backend is added.
          </p>
        </details>
      </section>
    )}

    {messages.length === 0 && phase !== 'unavailable' && (
      <div className="assistant-suggestions" aria-label={t('assistant.suggestionsLabel')}>
        <span className="assistant-suggestions-title">{t('assistant.suggestionsLabel')}</span>
        <div className="assistant-suggestion-chips">
          {SUGGESTED_PROMPTS(selected.name).map((suggestion) => (
            <button key={suggestion} type="button" className="assistant-suggestion-chip" onClick={() => send(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    )}

    <div className="assistant-composer-wrap">
      {fileName && <p className="assistant-file-status" role="status">Selected file: {fileName}</p>}
      <p className="assistant-connection-note">{t('assistant.privacyNote', { city: selected.name })}</p>
      <form className="assistant-composer" onSubmit={submitPrompt}>
        <label className="assistant-attach" htmlFor="assistant-file" aria-label="Upload a file">
          <Paperclip size={20} aria-hidden="true" />
          <span>Upload</span>
        </label>
        <input
          id="assistant-file"
          className="sr-only"
          type="file"
          onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name ?? '')}
        />
        <input
          className="assistant-prompt"
          aria-label={t('metric.ask')}
          placeholder={t('metric.ask')}
          value={prompt}
          disabled={phase === 'loading'}
          onChange={(event) => setPrompt(event.currentTarget.value)}
        />
        <button className="assistant-voice" type="button" disabled aria-label="Voice input unavailable">
          <Volume2 size={20} aria-hidden="true" />
          <span>Voice</span>
        </button>
        <button
          className="assistant-send"
          type="submit"
          aria-label={t('assistant.send')}
          disabled={!prompt.trim() || phase === 'loading'}
        >
          <ArrowUp size={20} aria-hidden="true" />
        </button>
      </form>
    </div>

    {menuOpen && <div
      className="assistant-menu-backdrop"
      aria-hidden="true"
      onClick={() => {
        setMenuOpen(false)
        menuButton.current?.focus()
      }}
    />}

    <aside
      id="assistant-menu-drawer"
      className="assistant-menu-drawer"
      aria-labelledby="assistant-menu-title"
      aria-hidden={!menuOpen}
      // React keeps the drawer mounted so it can slide; without `inert` the
      // off-screen links would still be tabbable.
      inert={!menuOpen}
    >
      <div className="assistant-menu-heading">
        <h2 id="assistant-menu-title">{t('assistant.menu')}</h2>
        <button
          type="button"
          className="assistant-menu-close"
          aria-label={t('assistant.closeMenu')}
          onClick={() => {
            setMenuOpen(false)
            menuButton.current?.focus()
          }}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <ChatHistoryMenu api={history} variant="drawer" onOpen={() => setMenuOpen(false)} />

      <button
        type="button"
        className="menu-new-chat"
        onClick={() => {
          history.newChat()
          setMenuOpen(false)
          setPrompt('')
          setPhase(ASSISTANT_API_CONFIGURED ? 'idle' : 'unavailable')
          setErrorDetail(null)
        }}
      >
        <Plus size={18} aria-hidden="true" />{t('menu.newChat')}
      </button>

      <div className="assistant-menu-footer">
        <Link to="/menu" className="assistant-menu-more">{t('assistant.openFullMenu')}</Link>
        <div className="menu-brand"><ShieldCheck size={18} aria-hidden="true" /><span>Heat Shield AI</span></div>
      </div>
    </aside>
  </div>
}

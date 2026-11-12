import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowUp, Menu as MenuIcon, Paperclip, Plus, ShieldCheck, Volume2, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ChatHistoryMenu } from '../components/ChatHistoryMenu'

export default function Assistant() {
  const [prompt, setPrompt] = useState('')
  const [fileName, setFileName] = useState('')
  const [notice, setNotice] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)

  const submitPrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!prompt.trim()) return
    setNotice('Chat is not connected yet.')
  }

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

  return <div className={`assistant-page${menuOpen ? ' menu-open' : ''}`}>
    <header className="assistant-topbar">
      <Link to="/" className="assistant-back-link" aria-label="Back to Dashboard">
        <ArrowLeft size={20} aria-hidden="true" />
      </Link>
      <button
        ref={menuButton}
        type="button"
        className="assistant-menu-trigger"
        aria-label="Open menu"
        aria-expanded={menuOpen}
        aria-controls="assistant-menu-drawer"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <MenuIcon size={18} aria-hidden="true" />
        <span>Menu</span>
      </button>
    </header>

    <section className="assistant-welcome" aria-labelledby="assistant-title">
      <span className="assistant-logo" aria-hidden="true"><ShieldCheck size={52} /></span>
      <h1 id="assistant-title">Heat Shield AI</h1>
    </section>

    <div className="assistant-composer-wrap">
      {fileName && <p className="assistant-file-status" role="status">Selected file: {fileName}</p>}
      {notice && <p className="assistant-connection-note" role="status">{notice}</p>}
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
          aria-label="Ask Heat Shield"
          placeholder="Ask Heat Shield"
          value={prompt}
          onChange={(event) => {
            setPrompt(event.currentTarget.value)
            setNotice('')
          }}
        />
        <button className="assistant-voice" type="button" disabled aria-label="Voice input unavailable">
          <Volume2 size={20} aria-hidden="true" />
          <span>Voice</span>
        </button>
        <button className="assistant-send" type="submit" aria-label="Send message" disabled={!prompt.trim()}>
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
        <h2 id="assistant-menu-title">Menu</h2>
        <button
          type="button"
          className="assistant-menu-close"
          aria-label="Close menu"
          onClick={() => {
            setMenuOpen(false)
            menuButton.current?.focus()
          }}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <ChatHistoryMenu variant="drawer" />

      <Link
        to="/assistant"
        className="menu-new-chat"
        onClick={() => {
          setMenuOpen(false)
          setPrompt('')
          setNotice('')
        }}
      >
        <Plus size={18} aria-hidden="true" />New Chat
      </Link>

      <div className="assistant-menu-footer">
        <Link to="/menu" className="assistant-menu-more">Open full menu</Link>
        <div className="menu-brand"><ShieldCheck size={18} aria-hidden="true" /><span>Heat Shield AI</span></div>
      </div>
    </aside>
  </div>
}

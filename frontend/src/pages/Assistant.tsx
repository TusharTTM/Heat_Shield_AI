import { useState, type FormEvent } from 'react'
import { ArrowUp, Menu as MenuIcon, Paperclip, ShieldCheck, Volume2 } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Assistant() {
  const [prompt, setPrompt] = useState('')
  const [fileName, setFileName] = useState('')
  const [notice, setNotice] = useState('')

  const submitPrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!prompt.trim()) return
    setNotice('Chat is not connected yet.')
  }

  return <div className="assistant-page">
    <header className="assistant-topbar">
      <Link to="/" className="assistant-dashboard-link">Dashboard</Link>
      <Link to="/menu" className="assistant-menu-link"><MenuIcon size={18} aria-hidden="true" />Menu</Link>
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
  </div>
}

import { ArrowLeft, Plus, ShieldCheck, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Menu() {
  return <div className="menu-page">
    <header className="menu-topbar">
      <Link to="/assistant" className="menu-back-link" aria-label="Back to AI Assistant">
        <ArrowLeft size={20} aria-hidden="true" />
      </Link>
      <h1>Menu</h1>
      <Link to="/" className="menu-dashboard-link">Dashboard</Link>
    </header>

    <section className="menu-panel" aria-label="Chat history menu">
      <div className="menu-profile">
        <span className="menu-profile-icon"><UserRound size={20} aria-hidden="true" /></span>
        <span>Profile</span>
      </div>

      <section className="menu-history-group" aria-labelledby="pinned-history-title">
        <h2 id="pinned-history-title">Pinned</h2>
        <div className="menu-history-placeholder">Chat History</div>
      </section>

      <section className="menu-history-group menu-recents" aria-labelledby="recent-history-title">
        <h2 id="recent-history-title">Recents</h2>
        <div className="menu-history-placeholder menu-history-list">Chat History</div>
      </section>

      <Link to="/assistant" className="menu-new-chat"><Plus size={18} aria-hidden="true" />New Chat</Link>
      <div className="menu-brand"><ShieldCheck size={20} aria-hidden="true" /><span>Heat Shield AI</span></div>
    </section>
  </div>
}

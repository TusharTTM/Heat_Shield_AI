import { ArrowLeft, Plus, ShieldCheck, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ChatHistoryMenu } from '../components/ChatHistoryMenu'
import { useChatHistory } from '../hooks/useChatHistory'
import { useT } from '../i18n'

export default function Menu() {
  const t = useT()
  const history = useChatHistory()
  return <div className="menu-page">
    <header className="menu-topbar">
      <Link to="/assistant" className="menu-back-link" aria-label="Back to AI Assistant">
        <ArrowLeft size={20} aria-hidden="true" />
      </Link>
      <h1>{t('nav.menu')}</h1>
      <Link to="/" className="menu-dashboard-link">{t('nav.dashboard')}</Link>
    </header>

    <section className="menu-panel" aria-label="Chat history menu">
      <Link to="/profile" className="menu-profile">
        <span className="menu-profile-icon"><UserRound size={20} aria-hidden="true" /></span>
        <span>{t('nav.profile')}</span>
      </Link>

      <ChatHistoryMenu api={history} variant="page" />

      <Link to="/assistant" className="menu-new-chat" onClick={() => history.newChat()}>
        <Plus size={18} aria-hidden="true" />{t('menu.newChat')}
      </Link>
      <div className="menu-brand"><ShieldCheck size={20} aria-hidden="true" /><span>Heat Shield AI</span></div>
    </section>
  </div>
}

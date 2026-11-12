import { MessageSquare, Pin, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * The chat history that the three screens refer to. The assistant is not wired
 * to a backend yet, so these are labelled reference entries rather than fake
 * conversations: each row still reads as a history item (pin, title, preview,
 * timestamp) instead of a bare "Chat History" string.
 */
interface HistoryEntry {
  id: string
  title: string
  preview: string
  time: string
}

const pinnedEntries: HistoryEntry[] = [
  { id: 'heat-plan', title: 'Heat plan for Mumbai', preview: 'Shade breaks, water timing, and the daily checklist', time: 'Pinned' },
]

const recentEntries: HistoryEntry[] = [
  { id: 'uv-index', title: 'UV index and outdoor timing', preview: 'When the afternoon peak lifts enough to go out', time: 'Yesterday' },
  { id: 'aqi-bands', title: 'Air quality bands explained', preview: 'US AQI against the European band on the dashboard', time: '2 days ago' },
  { id: 'mission', title: 'Heat mission progress', preview: 'How the daily precautions are counted', time: 'Last week' },
]

function HistoryRow({ entry, pinned, badge }: { entry: HistoryEntry; pinned?: boolean; badge?: ReactNode }) {
  return <li className="chat-history-item">
    <button type="button" className={`chat-history-row${pinned ? ' is-pinned' : ''}`} aria-label={`${entry.title}. ${entry.preview}`}>
      <span className="chat-history-icon" aria-hidden="true">
        {pinned ? <Pin size={16} /> : <MessageSquare size={16} />}
      </span>
      <span className="chat-history-copy">
        <strong>{entry.title}</strong>
        <small>{entry.preview}</small>
      </span>
      <span className="chat-history-meta">
        <time>{entry.time}</time>
        {badge}
      </span>
    </button>
  </li>
}

export function ChatHistoryMenu({ variant = 'page' }: { variant?: 'page' | 'drawer' }) {
  return <div className={`chat-history chat-history-${variant}`}>
    <section className="chat-history-group" aria-labelledby={`${variant}-pinned-title`}>
      <h2 id={`${variant}-pinned-title`} className="chat-history-heading"><Pin size={13} aria-hidden="true" />Pinned</h2>
      <ul className="chat-history-list">
        {pinnedEntries.map((entry) => <HistoryRow
          key={entry.id}
          entry={entry}
          pinned
          badge={<ShieldCheck size={14} aria-hidden="true" />}
        />)}
      </ul>
    </section>

    <section className="chat-history-group chat-history-recents" aria-labelledby={`${variant}-recents-title`}>
      <h2 id={`${variant}-recents-title`} className="chat-history-heading"><MessageSquare size={13} aria-hidden="true" />Recents</h2>
      <ul className="chat-history-list">
        {recentEntries.map((entry) => <HistoryRow key={entry.id} entry={entry} />)}
      </ul>
    </section>

    <p className="chat-history-note">Reference entries. Chat is not connected yet, so no live history is stored.</p>
  </div>
}

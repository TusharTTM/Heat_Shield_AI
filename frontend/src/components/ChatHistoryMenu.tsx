import { useState, type FormEvent } from 'react'
import { Check, Download, MessageSquare, Pencil, Trash2, X } from 'lucide-react'
import type { ChatHistoryApi } from '../hooks/useChatHistory'
import { chatPreview, chatTitle, downloadConversation, formatChatTime } from '../data/chatHistory'
import { useT } from '../i18n'

/**
 * Real, locally stored chat history (localStorage, this device only).
 * Opening a row reopens that conversation; rename, export and delete act on
 * one conversation; clearing everything asks for confirmation first — both
 * destructive actions use the app's two-click confirm pattern.
 */
export function ChatHistoryMenu({
  api,
  variant = 'page',
  onOpen,
}: {
  api: ChatHistoryApi
  variant?: 'page' | 'drawer'
  onOpen?: () => void
}) {
  const t = useT()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [pendingClear, setPendingClear] = useState(false)

  const conversations = [...api.conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const submitRename = (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault()
    api.renameChat(id, renameValue)
    setRenamingId(null)
  }

  return <div className={`chat-history chat-history-${variant}`}>
    <section className="chat-history-group" aria-labelledby={`${variant}-history-title`}>
      <h2 id={`${variant}-history-title`} className="chat-history-heading">{t('menu.historyTitle')}</h2>

      {conversations.length === 0 && (
        <p className="chat-history-empty" role="status">{t('menu.empty')}</p>
      )}

      <ul className="chat-history-list">
        {conversations.map((conversation) => {
          const title = chatTitle(conversation, t('menu.untitled'))
          return <li key={conversation.id} className="chat-history-item">
            {renamingId === conversation.id
              ? <form className="chat-history-rename" onSubmit={(event) => submitRename(event, conversation.id)}>
                <label className="sr-only" htmlFor={`${variant}-rename-${conversation.id}`}>{t('menu.renameLabel')}</label>
                <input
                  id={`${variant}-rename-${conversation.id}`}
                  className="chat-history-rename-input"
                  value={renameValue}
                  maxLength={80}
                  autoFocus
                  onChange={(event) => setRenameValue(event.currentTarget.value)}
                />
                <button type="submit" className="chat-history-action" aria-label={t('menu.saveTitle')} disabled={!renameValue.trim()}>
                  <Check size={16} aria-hidden="true" />
                </button>
                <button type="button" className="chat-history-action" aria-label={t('menu.cancel')} onClick={() => setRenamingId(null)}>
                  <X size={16} aria-hidden="true" />
                </button>
              </form>
              : <>
                <button
                  type="button"
                  className="chat-history-row"
                  aria-label={`${t('menu.openChat')}: ${title}`}
                  onClick={() => {
                    api.openChat(conversation.id)
                    onOpen?.()
                  }}
                >
                  <span className="chat-history-icon" aria-hidden="true"><MessageSquare size={16} /></span>
                  <span className="chat-history-copy">
                    <strong>{title}</strong>
                    <small>{chatPreview(conversation, t('menu.noMessages'))}</small>
                  </span>
                  <span className="chat-history-meta">
                    <time dateTime={conversation.updatedAt}>{formatChatTime(conversation.updatedAt)}</time>
                  </span>
                </button>
                <div className="chat-history-actions" aria-label={`${t('menu.actions')}: ${title}`}>
                  <button
                    type="button"
                    className="chat-history-action"
                    aria-label={`${t('menu.rename')}: ${title}`}
                    onClick={() => {
                      setRenamingId(conversation.id)
                      setRenameValue(title)
                      setPendingDeleteId(null)
                    }}
                  >
                    <Pencil size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="chat-history-action"
                    aria-label={`${t('menu.export')}: ${title}`}
                    onClick={() => downloadConversation(conversation)}
                  >
                    <Download size={16} aria-hidden="true" />
                  </button>
                  {pendingDeleteId === conversation.id
                    ? <>
                      <button
                        type="button"
                        className="chat-history-action chat-history-action--danger"
                        aria-label={`${t('menu.confirm')}: ${t('menu.deleteConfirm')}`}
                        onClick={() => {
                          api.deleteChat(conversation.id)
                          setPendingDeleteId(null)
                        }}
                      >
                        <Check size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="chat-history-action"
                        aria-label={t('menu.cancel')}
                        onClick={() => setPendingDeleteId(null)}
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                      <span className="chat-history-confirm" role="status">{t('menu.deleteConfirm')}</span>
                    </>
                    : <button
                      type="button"
                      className="chat-history-action chat-history-action--danger"
                      aria-label={`${t('menu.delete')}: ${title}`}
                      onClick={() => {
                        setPendingDeleteId(conversation.id)
                        setPendingClear(false)
                      }}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>}
                </div>
              </>}
          </li>
        })}
      </ul>
    </section>

    {conversations.length > 0 && (
      <div className="chat-history-footer">
        {pendingClear
          ? <div className="chat-history-clear-confirm" role="status">
            <span>{t('menu.clearConfirm')}</span>
            <button
              type="button"
              className="chat-history-action chat-history-action--danger"
              onClick={() => {
                api.clearAllChats()
                setPendingClear(false)
                setPendingDeleteId(null)
              }}
            >
              {t('menu.confirm')}
            </button>
            <button type="button" className="chat-history-action" onClick={() => setPendingClear(false)}>
              {t('menu.cancel')}
            </button>
          </div>
          : <button type="button" className="chat-history-clear" onClick={() => setPendingClear(true)}>
            {t('menu.clearAll')}
          </button>}
      </div>
    )}

    {/* Long technical note: kept in English per the app's language policy. */}
    <p className="chat-history-note">Chats are stored in this browser only. Nothing is uploaded or synced to other devices.</p>
  </div>
}

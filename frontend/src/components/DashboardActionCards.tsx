import { ArrowRight, Award, CheckCircle2, ListChecks, RotateCcw, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import type { DashboardTask, PreparednessProgress } from '../data/dashboardTasks'
import { Card, RiskBadge, StatusBadge } from './ui'

export function ActionChecklistCard({
  cityName,
  tasks,
  completedIds,
  onToggleTask,
  onResetTasks,
  loading = false,
}: {
  cityName: string
  tasks: DashboardTask[]
  completedIds: string[]
  onToggleTask: (id: string) => void
  onResetTasks: () => void
  /** While a model is still arriving, the tasks are placeholders — say so rather than
   *  rendering them beside an "Unassessed" badge that reads like a finished result. */
  loading?: boolean
}) {
  const completedSet = new Set(completedIds)

  return (
    <Card className="action-checklist-card">
      <div className="action-checklist-head">
        <div>
          <span className="section-label">Practical suggestions · task checklist</span>
          <h2>Actions for {cityName} today</h2>
        </div>
        {completedIds.length > 0 && (
          <button
            type="button"
            className="icon-text-button"
            onClick={onResetTasks}
            aria-label={`Reset today’s checklist for ${cityName}`}
          >
            <RotateCcw size={13} aria-hidden="true" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="action-checklist-loading">
          <span className="action-checklist-loading-line" aria-hidden="true" />
          <p><strong>Working out today’s actions for {cityName}.</strong> Actions follow the heat and air-quality screening, so they appear once the model readings arrive. The general safety guidance is unaffected and stays available in the Safety Guide.</p>
        </div>
      ) : (
      <ul className="action-task-list" aria-label={`Suggested preparedness tasks for ${cityName}`}>
        {tasks.map((task) => {
          const checked = completedSet.has(task.id)
          const inputId = `dashboard-task-${task.id}`
          return (
            <li key={task.id} className={`action-task-item${checked ? ' completed' : ''}`}>
              {/* The checkbox label covers only the title row and tag, so the "why this helps"
                  disclosure sits beside it rather than inside it — otherwise expanding the
                  explanation would also toggle the task. */}
              <div className="action-task-row">
                <input
                  id={inputId}
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleTask(task.id)}
                />
                <label htmlFor={inputId} className="action-task-label">
                  <span className="action-task-top">
                    <strong>{task.title}</strong>
                    {task.level
                      ? <RiskBadge level={task.level} subtle />
                      : <StatusBadge status="unavailable">Unassessed</StatusBadge>}
                  </span>
                  <span className="action-task-tag">{task.badgeLabel}{checked ? ' · Marked complete' : ''}</span>
                </label>
              </div>
              <details className="action-task-more">
                <summary>Why this helps</summary>
                <p className="action-task-detail">{task.detail}</p>
              </details>
            </li>
          )
        })}
      </ul>
      )}

      <p className="checklist-risk-reminder">
        <ShieldAlert size={16} aria-hidden="true" />
        <span>
          <strong>Personal prep only:</strong> completing a task does not mean the weather or air-quality risk has gone away. Keep following outdoor precautions.
        </span>
      </p>

      <div className="action-checklist-footer">
        <Link to="/safety" className="text-link">
          Full Safety Guide <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </Card>
  )
}

export function PreparednessProgressCard({
  cityName,
  progress,
}: {
  cityName: string
  progress: PreparednessProgress
}) {
  const { reducedMotion } = useApp()
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - progress.percent / 100)
  const earnedBadges = progress.badges.filter((badge) => badge.earned)
  const nextBadge = progress.badges.find((badge) => !badge.earned)

  return (
    <Card className="preparedness-progress-card">
      <div className="progress-card-top">
        <div className="progress-ring-wrap" role="img" aria-label={`Today’s preparedness checklist progress for ${cityName}: ${progress.completedCount} of ${progress.totalCount} tasks completed (${progress.percent} percent)`}>
          <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
            <circle cx="36" cy="36" r={radius} className="progress-ring-track" />
            <circle
              cx="36"
              cy="36"
              r={radius}
              className={`progress-ring-fill${reducedMotion ? ' no-transition' : ''}`}
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <strong className="progress-ring-value">{progress.completedCount}/{progress.totalCount}</strong>
        </div>

        <div className="progress-card-summary">
          <span className="section-label"><ListChecks size={13} aria-hidden="true" /> Today’s preparedness</span>
          <h2>{progress.completedCount === progress.totalCount && progress.totalCount > 0 ? 'All today’s steps checked' : `${progress.completedCount} of ${progress.totalCount} steps checked`}</h2>
          <p>Check off today’s suggestions to earn badges.</p>
        </div>
      </div>

      <ul className="earned-badges-list" aria-label="Preparedness badges">
        {earnedBadges.map((badge) => (
          <li key={badge.id} className="earned-badge-item is-earned">
            <span className="earned-badge-icon" aria-hidden="true">
              <CheckCircle2 size={16} />
            </span>
            <div>
              <div className="earned-badge-title">
                <strong>{badge.label}</strong>
                <span>Earned today</span>
              </div>
            </div>
          </li>
        ))}
        {nextBadge && <li className="progress-next-badge"><Award size={16} aria-hidden="true" /><span><strong>Next badge: {nextBadge.label}</strong><small>{nextBadge.rule}</small></span></li>}
      </ul>

      <details className="progress-rules">
        <summary>Badge collection &amp; rules ({progress.badges.length})</summary>
        <ul>
          {progress.badges.map((badge) => (
            <li key={`rule-${badge.id}`}><strong>{badge.label} · {badge.earned ? 'Earned today' : 'Not yet earned'}:</strong> {badge.rule}</li>
          ))}
        </ul>
        <p>Badges unlock only from tasks you check today for this city. They are saved only in this browser and reset each IST day. There are no points or streaks, and badges do not guarantee safety.</p>
      </details>
    </Card>
  )
}

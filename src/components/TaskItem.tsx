import { useRef, useState, type HTMLAttributes, type TouchEvent } from 'react'
import { dueLabel, today } from '../dates'
import { BellIcon, CheckCircleIcon, ListCheckIcon, NoteIcon, PostponeIcon, RepeatIcon } from '../icons'
import { REPEAT_LABEL } from '../logic'
import type { Task, TaskList } from '../types'

interface Props {
  task: Task
  list?: TaskList
  showList: boolean
  /** בתצוגת "היום" לא מציגים את התווית "היום" */
  hideToday?: boolean
  /** בלוח השנה התאריך כבר ידוע – לא מציגים אותו */
  hideDue?: boolean
  onToggle: (t: Task) => void
  onOpen: (t: Task) => void
  /** החלקה: ימינה = בוצעה, שמאלה = דחייה למחר (רק בטלפון, רק למשימות פתוחות) */
  onPostpone?: (t: Task) => void
  /** אירועי גרירה (מ-useDateDrag) – רק במסכים שיש בהם תאריכים לשחרר עליהם */
  dragProps?: HTMLAttributes<HTMLLIElement>
  dragging?: boolean
}

const SWIPE_TRIGGER = 90 // פיקסלים להפעלה
const SWIPE_MAX = 140

export function TaskItem({ task, list, showList, hideToday, hideDue, onToggle, onOpen, onPostpone, dragProps, dragging }: Props) {
  const overdue = !task.done && task.due !== null && task.due < today()
  const showDue = task.due !== null && !hideDue && !(hideToday && task.due === today())
  const subDone = task.subtasks.filter((s) => s.done).length

  // ---------- החלקה ----------
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number; mode: 'idle' | 'swipe' | 'scroll' } | null>(null)
  const canSwipe = !task.done && !!onPostpone

  const onTouchStart = (e: TouchEvent<HTMLLIElement>) => {
    dragProps?.onTouchStart?.(e)
    if (canSwipe) start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, mode: 'idle' }
  }
  const onTouchMove = (e: TouchEvent<HTMLLIElement>) => {
    const s = start.current
    if (!s || dragging) return
    const mx = e.touches[0].clientX - s.x
    const my = e.touches[0].clientY - s.y
    if (s.mode === 'idle') {
      if (Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(my) * 1.5) s.mode = 'swipe'
      else if (Math.abs(my) > 10) s.mode = 'scroll'
    }
    if (s.mode === 'swipe') setDx(Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, mx)))
  }
  const onTouchEnd = () => {
    const s = start.current
    start.current = null
    if (s?.mode === 'swipe') {
      if (dx >= SWIPE_TRIGGER) onToggle(task)
      else if (dx <= -SWIPE_TRIGGER) onPostpone?.(task)
    }
    setDx(0)
  }

  const cls = ['task', task.done && 'is-done', dragProps && 'draggable', dragging && 'dragging', dx !== 0 && 'swiping'].filter(Boolean).join(' ')

  return (
    <li className={cls} {...dragProps} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      {dx !== 0 && (
        <div className={`swipe-bg ${dx > 0 ? 'done' : 'later'}${Math.abs(dx) >= SWIPE_TRIGGER ? ' armed' : ''}`} aria-hidden="true">
          {dx > 0 ? (
            <span>
              <CheckCircleIcon width={20} height={20} /> בוצע
            </span>
          ) : (
            <span>
              מחר <PostponeIcon width={20} height={20} />
            </span>
          )}
        </div>
      )}
      <div className="task-row" style={dx ? { transform: `translateX(${dx}px)` } : undefined}>
        <button
          className={`check p${task.priority}`}
          role="checkbox"
          aria-checked={task.done}
          aria-label={task.done ? `סמן כלא הושלמה: ${task.title}` : `סמן כהושלמה: ${task.title}`}
          onClick={() => onToggle(task)}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path d="m5 12 5 5 9-10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button className="task-body" onClick={() => onOpen(task)}>
          <span className="task-title">{task.title}</span>
          <span className="task-meta">
            {task.time && <span className="time">{task.time}</span>}
            {showDue && task.due && <span className={`due${overdue ? ' overdue' : ''}`}>{dueLabel(task.due)}</span>}
            {task.repeat && (
              <span className="meta-icon" title={REPEAT_LABEL[task.repeat]}>
                <RepeatIcon width={13} height={13} />
                {REPEAT_LABEL[task.repeat]}
              </span>
            )}
            {task.remind !== null && task.time && <BellIcon width={13} height={13} className="muted" aria-label="יש תזכורת" />}
            {task.subtasks.length > 0 && (
              <span className={`meta-icon${subDone === task.subtasks.length ? ' all-done' : ''}`}>
                <ListCheckIcon width={13} height={13} />
                {subDone}/{task.subtasks.length}
              </span>
            )}
            {task.postponed > 0 && (
              <span className="postponed">
                <PostponeIcon width={13} height={13} />
                {task.done ? doneAfterLabel(task.postponed) : postponedLabel(task.postponed)}
              </span>
            )}
            {task.notes && <NoteIcon width={14} height={14} className="muted" />}
            {showList && list && (
              <span className="list-tag">
                <i style={{ background: list.color }} />
                {list.name}
              </span>
            )}
          </span>
        </button>
      </div>
    </li>
  )
}

/** "נדחתה ביום", "נדחתה יומיים", "נדחתה 5 ימים" */
export function postponedLabel(days: number): string {
  if (days === 1) return 'נדחתה ביום'
  if (days === 2) return 'נדחתה יומיים'
  return `נדחתה ${days} ימים`
}

/** למשימה שהושלמה: "בוצעה אחרי יום דחייה", "בוצעה אחרי 4 ימי דחייה" */
export function doneAfterLabel(days: number): string {
  if (days === 1) return 'בוצעה אחרי יום דחייה'
  if (days === 2) return 'בוצעה אחרי יומיים של דחייה'
  return `בוצעה אחרי ${days} ימי דחייה`
}

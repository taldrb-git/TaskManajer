import { useEffect, useRef, useState } from 'react'
import { addDays, diffDays, dueLabel, fullDateLabel, today } from '../dates'
import { CopyIcon, TrashIcon, XIcon } from '../icons'
import { PRIORITY_LABEL, REMIND_OPTIONS, REPEAT_LABEL } from '../logic'
import { notificationPermission, requestNotifications } from '../reminders'
import { addList, deleteTask, duplicateTask, toggleTask, uid, updateTask, useStore } from '../store'
import type { Priority, Repeat, Task } from '../types'
import { Sheet } from './Sheet'
import { doneAfterLabel, postponedLabel } from './TaskItem'

interface Props {
  taskId: string
  onClose: () => void
  onDeleted: (t: Task) => void
  onDuplicated: (count: number, undo: () => void) => void
}

export function TaskEditor({ taskId, onClose, onDeleted, onDuplicated }: Props) {
  const { tasks, lists } = useStore()
  const task = tasks.find((t) => t.id === taskId)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const [dup, setDup] = useState<DupState | null>(null) // לא null = מצב שכפול

  useEffect(() => {
    if (!task) onClose()
  }, [task, onClose])

  useEffect(() => autosize(titleRef.current), [task?.title])

  if (!task) return null
  const t = today()

  // אותו חלון, תוכן אחר – כדי לא לסגור ולפתוח חלון (זה משבש את כפתור "חזור")
  if (dup) {
    const n = dupCount(dup, task)
    return (
      <Sheet
        title="שכפול משימה"
        onClose={onClose}
        footer={
          <>
            <button className="btn ghost" onClick={() => setDup(null)}>
              חזרה
            </button>
            <span className="spacer" />
            <button
              className="btn primary"
              disabled={n < 2}
              onClick={() => {
                onDuplicated(n, duplicateTask(task.id, n, { everyDays: dup.everyDays, numbered: dup.numbered }))
                onClose()
              }}
            >
              {n < 2 ? 'יצירה' : `יצירת ${n} משימות`}
            </button>
          </>
        }
      >
        <DuplicateBody task={task} state={dup} onChange={setDup} />
      </Sheet>
    )
  }

  return (
    <Sheet
      title="עריכת משימה"
      onClose={onClose}
      footer={
        <>
          <button
            className="btn danger ghost"
            onClick={() => {
              deleteTask(task.id)
              onDeleted(task)
              onClose()
            }}
          >
            <TrashIcon width={18} height={18} /> מחיקה
          </button>
          <button className="btn ghost" onClick={() => setDup({ mode: 'count', count: 7, until: addDays(task.due ?? t, 14), everyDays: 1, numbered: true })}>
            <CopyIcon width={18} height={18} /> שכפול
          </button>
          <span className="spacer" />
          <button className="btn primary" onClick={onClose}>
            סיום
          </button>
        </>
      }
    >
      <div className="editor-title">
        <button
          className={`check big p${task.priority}`}
          role="checkbox"
          aria-checked={task.done}
          aria-label="הושלמה"
          onClick={() => toggleTask(task.id)}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="m5 12 5 5 9-10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <textarea
          ref={titleRef}
          rows={1}
          value={task.title}
          aria-label="כותרת"
          placeholder="כותרת המשימה"
          onChange={(e) => {
            updateTask(task.id, { title: e.target.value.replace(/\n/g, ' ') })
            autosize(e.target)
          }}
          onBlur={(e) => !e.target.value.trim() && updateTask(task.id, { title: 'ללא כותרת' })}
        />
      </div>

      <Subtasks task={task} />

      <div className="field">
        <span className="label">תאריך יעד</span>
        <div className="chips">
          <button className={`chip${task.due === t ? ' on' : ''}`} onClick={() => updateTask(task.id, { due: t })}>
            היום
          </button>
          <button
            className={`chip${task.due === addDays(t, 1) ? ' on' : ''}`}
            onClick={() => updateTask(task.id, { due: addDays(t, 1) })}
          >
            מחר
          </button>
          <button
            className={`chip${task.due === addDays(t, 7) ? ' on' : ''}`}
            onClick={() => updateTask(task.id, { due: addDays(t, 7) })}
          >
            בעוד שבוע
          </button>
          <button className={`chip${!task.due ? ' on' : ''}`} onClick={() => updateTask(task.id, { due: null })}>
            ללא
          </button>
          <input
            type="date"
            className="chip date"
            aria-label="בחירת תאריך"
            value={task.due ?? ''}
            min={t}
            onChange={(e) => updateTask(task.id, { due: e.target.value || null })}
          />
        </div>
        {task.due && <span className="hint">{fullDateLabel(task.due)}</span>}
        {task.postponed > 0 && (
          <span className="hint postponed">
            {task.done ? doneAfterLabel(task.postponed) : `${postponedLabel(task.postponed)} – משימה שלא בוצעה עוברת אוטומטית ליום הבא`}
          </span>
        )}
      </div>

      <div className="field-row">
        <label className="field">
          <span className="label">שעה</span>
          <span className="time-field">
            <input
              type="time"
              className="date-input"
              value={task.time ?? ''}
              onChange={(e) => updateTask(task.id, { time: e.target.value || null, ...(e.target.value ? {} : { remind: null }) })}
            />
            {task.time && (
              <button className="icon-btn" onClick={() => updateTask(task.id, { time: null, remind: null })} aria-label="הסרת השעה">
                <XIcon width={16} height={16} />
              </button>
            )}
          </span>
        </label>
        <label className="field">
          <span className="label">תזכורת</span>
          <select
            value={task.remind ?? ''}
            disabled={!task.time || !task.due}
            onChange={async (e) => {
              const v = e.target.value === '' ? null : Number(e.target.value)
              updateTask(task.id, { remind: v })
              if (v !== null) await requestNotifications()
            }}
          >
            <option value="">{task.time && task.due ? 'ללא' : 'צריך תאריך ושעה'}</option>
            {REMIND_OPTIONS.map(([m, label]) => (
              <option key={m} value={m}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {task.remind !== null && notificationPermission() === 'denied' && (
        <span className="hint error">ההתראות חסומות בדפדפן – אפשרו אותן בהגדרות האתר כדי לקבל תזכורות</span>
      )}

      <label className="field">
        <span className="label">חזרה</span>
        <select value={task.repeat ?? ''} onChange={(e) => updateTask(task.id, { repeat: (e.target.value || null) as Repeat | null })}>
          <option value="">לא חוזרת</option>
          {(Object.keys(REPEAT_LABEL) as Repeat[]).map((r) => (
            <option key={r} value={r}>
              {REPEAT_LABEL[r]}
            </option>
          ))}
        </select>
        {task.repeat && <span className="hint">כשמסמנים את המשימה כבוצעה, נוצרת לבד המשימה הבאה</span>}
      </label>

      <div className="field">
        <span className="label">עדיפות</span>
        <div className="segmented" role="radiogroup" aria-label="עדיפות">
          {([0, 1, 2, 3] as Priority[]).map((p) => (
            <button
              key={p}
              role="radio"
              aria-checked={task.priority === p}
              className={`seg p${p}${task.priority === p ? ' on' : ''}`}
              onClick={() => updateTask(task.id, { priority: p })}
            >
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span className="label">רשימה (נושא, למשל עבודה או בית)</span>
        <select
          value={task.list_id ?? ''}
          onChange={(e) => {
            if (e.target.value !== '__new') return updateTask(task.id, { list_id: e.target.value || null })
            const name = prompt('שם הרשימה החדשה (למשל: עבודה, בית)')?.trim()
            if (name) updateTask(task.id, { list_id: addList(name).id })
          }}
        >
          <option value="">ללא רשימה</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
          <option value="__new">＋ רשימה חדשה…</option>
        </select>
      </label>

      <label className="field">
        <span className="label">הערות</span>
        <textarea
          className="notes"
          rows={4}
          value={task.notes}
          placeholder="פרטים נוספים, קישורים…"
          onChange={(e) => updateTask(task.id, { notes: e.target.value })}
        />
      </label>
    </Sheet>
  )
}

// ---------- תת-משימות ----------

function Subtasks({ task }: { task: Task }) {
  const [text, setText] = useState('')
  const set = (subtasks: Task['subtasks']) => updateTask(task.id, { subtasks })
  const add = () => {
    const title = text.trim()
    if (!title) return
    set([...task.subtasks, { id: uid(), title, done: false }])
    setText('')
  }
  const done = task.subtasks.filter((s) => s.done).length

  return (
    <div className="field">
      <span className="label">
        תת-משימות{task.subtasks.length > 0 && ` · ${done}/${task.subtasks.length}`}
      </span>
      {task.subtasks.length > 0 && (
        <ul className="subtasks">
          {task.subtasks.map((s) => (
            <li key={s.id} className={s.done ? 'done' : ''}>
              <input
                type="checkbox"
                checked={s.done}
                aria-label={s.title}
                onChange={() => set(task.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))}
              />
              <input
                className="sub-title"
                value={s.title}
                aria-label="כותרת תת-משימה"
                onChange={(e) => set(task.subtasks.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)))}
                onBlur={(e) => !e.target.value.trim() && set(task.subtasks.filter((x) => x.id !== s.id))}
              />
              <button className="icon-btn" onClick={() => set(task.subtasks.filter((x) => x.id !== s.id))} aria-label={`מחיקת ${s.title}`}>
                <XIcon width={15} height={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="sub-add"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="+ תת-משימה" aria-label="תת-משימה חדשה" enterKeyHint="done" />
      </form>
    </div>
  )
}

function autosize(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

// ---------- שכפול ----------

interface DupState {
  mode: 'count' | 'until' // מספר פעמים קבוע, או עד תאריך
  count: number
  until: string // YYYY-MM-DD, כולל
  everyDays: 1 | 7
  numbered: boolean
}

/** כמה משימות ייווצרו בסך הכול (כולל המקורית). במצב "עד תאריך" יכול לצאת פחות מ-2 – ואז אין מה ליצור */
function dupCount(d: DupState, task: Task): number {
  if (d.mode === 'until') {
    const days = diffDays(task.due ?? today(), d.until)
    return days < 0 ? 0 : Math.min(365, Math.floor(days / d.everyDays) + 1)
  }
  return Math.min(365, Math.max(2, d.count || 2))
}

/** שכפול משימה לכמה ימים: "לקחת כדור 1", "לקחת כדור 2"... */
function DuplicateBody({ task, state, onChange }: { task: Task; state: DupState; onChange: (s: DupState) => void }) {
  const { mode, count, until, everyDays, numbered } = state
  const set = (patch: Partial<DupState>) => onChange({ ...state, ...patch })
  const start = task.due ?? today()
  const base = task.title.trim()
  const n = dupCount(state, task)
  const name = (i: number) => (numbered ? `${base} ${i}` : base)
  const at = (i: number) => dueLabel(addDays(start, (i - 1) * everyDays))

  return (
    <>
      <div className="field">
        <span className="label">עד מתי</span>
        <div className="segmented" role="radiogroup" aria-label="עד מתי">
          {(
            [
              ['count', 'מספר פעמים'],
              ['until', 'עד תאריך'],
            ] as const
          ).map(([m, label]) => (
            <button key={m} role="radio" aria-checked={mode === m} className={`seg${mode === m ? ' on' : ''}`} onClick={() => set({ mode: m })}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'until' ? (
        <div className="field">
          <span className="label">התאריך האחרון</span>
          <input
            type="date"
            className="date-input"
            value={until}
            min={addDays(start, everyDays)}
            onChange={(e) => e.target.value && set({ until: e.target.value })}
            aria-label="התאריך האחרון"
          />
          <span className="hint">{n >= 2 ? `${fullDateLabel(until)} · ${n} פעמים בסך הכול` : 'צריך לבחור תאריך מאוחר יותר'}</span>
        </div>
      ) : (
      <div className="field">
        <span className="label">כמה פעמים בסך הכול</span>
        <div className="stepper">
          <button className="icon-btn" onClick={() => set({ count: Math.max(2, n - 1) })} aria-label="פחות">
            −
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={2}
            max={365}
            value={count || ''}
            onChange={(e) => set({ count: parseInt(e.target.value, 10) || 0 })}
            aria-label="מספר פעמים"
          />
          <button className="icon-btn" onClick={() => set({ count: Math.min(365, n + 1) })} aria-label="יותר">
            +
          </button>
        </div>
      </div>
      )}

      <div className="field">
        <span className="label">כל כמה זמן</span>
        <div className="segmented" role="radiogroup" aria-label="תדירות">
          {(
            [
              [1, 'כל יום'],
              [7, 'כל שבוע'],
            ] as const
          ).map(([d, label]) => (
            <button key={d} role="radio" aria-checked={everyDays === d} className={`seg${everyDays === d ? ' on' : ''}`} onClick={() => set({ everyDays: d })}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <label className="toggle">
        <input type="checkbox" checked={numbered} onChange={(e) => set({ numbered: e.target.checked })} />
        <span>מספור</span>
      </label>

      {n >= 2 && (
      <div className="dup-preview">
        <span className="label">יתקבל</span>
        <ul>
          <li>
            <b>{name(1)}</b> <span>{at(1)}</span>
          </li>
          <li>
            <b>{name(2)}</b> <span>{at(2)}</span>
          </li>
          {n > 3 && <li className="more">⋮</li>}
          {n > 2 && (
            <li>
              <b>{name(n)}</b> <span>{at(n)}</span>
            </li>
          )}
        </ul>
      </div>
      )}
    </>
  )
}

import { useRef, useState, type FormEvent } from 'react'
import { addDays, fullDateLabel, today } from '../dates'
import { ArrowUpIcon, CalendarIcon, ClockIcon, MicIcon, RepeatIcon } from '../icons'
import { PRIORITY_LABEL, REPEAT_LABEL, parseQuickAdd } from '../logic'
import { speechSupported, useSpeech } from '../speech'
import { addTask } from '../store'
import type { TaskList, View } from '../types'
import { useDismiss } from './Sheet'

interface Props {
  view: View
  lists: TaskList[]
  onClose: () => void
}

/** חלונית הוספת משימה שנפתחת מכפתור ה-+. נשארת פתוחה להוספה רצופה. */
export function Composer({ view, lists, onClose }: Props) {
  useDismiss(onClose)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  // הקלטה קולית: הטקסט נכתב לשורה תוך כדי דיבור, ואז לוחצים על החץ כדי להוסיף
  const speech = useSpeech((spoken) => setText(spoken))

  const t = today()
  const defaultDue = view.kind === 'today' ? t : view.kind === 'upcoming' ? addDays(t, 1) : view.kind === 'calendar' ? view.date : null
  const listId = view.kind === 'list' ? view.id : null
  const parsed = parseQuickAdd(text)
  const due = parsed.due ?? defaultDue
  const list = lists.find((l) => l.id === listId)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!parsed.title) return
    addTask({ title: parsed.title, due: due ?? (parsed.repeat ? t : null), priority: parsed.priority, list_id: listId, time: parsed.time, repeat: parsed.repeat })
    setText('')
    inputRef.current?.focus()
  }

  return (
    <div className="composer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="composer" onSubmit={submit} role="dialog" aria-label="משימה חדשה">
        <input
          ref={inputRef}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={speech.listening ? 'אפשר לדבר…' : 'משימה חדשה'}
          aria-label="משימה חדשה"
          enterKeyHint="send"
        />
        {speechSupported && (
          <button
            type="button"
            className={`mic${speech.listening ? ' on' : ''}`}
            onClick={() => (speech.listening ? speech.stop() : speech.start())}
            aria-label={speech.listening ? 'עצירת הקלטה' : 'הקלטה קולית'}
            aria-pressed={speech.listening}
          >
            <MicIcon width={20} height={20} />
          </button>
        )}
        <button className="send" type="submit" disabled={!parsed.title} aria-label="הוספה">
          <ArrowUpIcon width={20} height={20} strokeWidth={2.5} />
        </button>
        <div className="composer-meta">
          <span>
            <CalendarIcon width={13} height={13} />
            {due ? fullDateLabel(due) : 'ללא תאריך'}
          </span>
          {parsed.time && (
            <span>
              <ClockIcon width={13} height={13} />
              {parsed.time}
            </span>
          )}
          {parsed.repeat && (
            <span>
              <RepeatIcon width={13} height={13} />
              {REPEAT_LABEL[parsed.repeat]}
            </span>
          )}
          {list && (
            <span>
              <i className="dot" style={{ background: list.color }} />
              {list.name}
            </span>
          )}
          {speech.error && <span className="error">{speech.error}</span>}
          {parsed.priority && <span className={`prio p${parsed.priority}`}>עדיפות {PRIORITY_LABEL[parsed.priority]}</span>}
        </div>
      </form>
    </div>
  )
}

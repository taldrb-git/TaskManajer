import { emptyTrash, purgeTask, restoreTask } from '../store'
import type { Task } from '../types'

const fmt = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** סל מחזור: משימות שנמחקו ב-30 הימים האחרונים */
export function TrashView({ trash, toast }: { trash: Task[]; toast: (m: string) => void }) {
  if (!trash.length)
    return (
      <div className="empty">
        <h3>סל המחזור ריק</h3>
        <p>משימות שנמחקות נשמרות כאן 30 יום.</p>
      </div>
    )
  return (
    <>
      <div className="trash-head">
        <p className="muted">משימות שנמחקו נשמרות כאן 30 יום ואז נמחקות לגמרי.</p>
        <button
          className="btn ghost danger small"
          onClick={() => {
            if (confirm(`למחוק לצמיתות ${trash.length} משימות?`)) {
              emptyTrash()
              toast('סל המחזור רוקן')
            }
          }}
        >
          ריקון הסל
        </button>
      </div>
      <ul className="tasks">
        {trash.map((t) => (
          <li key={t.id} className="task trash-item">
            <div className="task-body">
              <span className="task-title">{t.title}</span>
              <span className="task-meta">נמחקה {t.deleted_at ? fmt.format(new Date(t.deleted_at)) : ''}</span>
            </div>
            <button
              className="btn small"
              onClick={() => {
                restoreTask(t.id)
                toast('המשימה שוחזרה')
              }}
            >
              שחזור
            </button>
            <button className="btn ghost danger small" onClick={() => purgeTask(t.id)} aria-label={`מחיקה לצמיתות: ${t.title}`}>
              מחיקה
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

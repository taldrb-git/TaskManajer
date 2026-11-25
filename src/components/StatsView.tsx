import { useMemo, useState } from 'react'
import { addDays, toISODate, today } from '../dates'
import type { Task } from '../types'
import { postponedLabel } from './TaskItem'

interface Props {
  tasks: Task[]
  onOpen: (t: Task) => void
}

const dayShort = new Intl.DateTimeFormat('he-IL', { weekday: 'narrow' })
const dayLong = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })
const doneDay = (t: Task) => (t.done_at ? toISODate(new Date(t.done_at)) : null)

/** מסך סיכום: כמה הושלם, גרף 7 ימים, והמשימות שנדחו הכי הרבה */
export function StatsView({ tasks, onOpen }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const t = today()

  const s = useMemo(() => {
    const done = tasks.filter((x) => x.done)
    const open = tasks.filter((x) => !x.done)
    const week = Array.from({ length: 7 }, (_, i) => {
      const iso = addDays(t, i - 6)
      return { iso, count: done.filter((x) => doneDay(x) === iso).length }
    })
    const doneWeek = week.reduce((a, b) => a + b.count, 0)
    const doneToday = week[6].count
    const postponedDone = done.filter((x) => x.postponed > 0)
    const avg = postponedDone.length ? postponedDone.reduce((a, b) => a + b.postponed, 0) / done.length : 0
    const top = open.filter((x) => x.postponed > 0).sort((a, b) => b.postponed - a.postponed).slice(0, 5)
    return { week, doneWeek, doneToday, open: open.length, avg, top, max: Math.max(1, ...week.map((w) => w.count)) }
  }, [tasks, t])

  return (
    <div className="stats">
      <div className="tiles">
        <Tile value={s.doneToday} label="הושלמו היום" />
        <Tile value={s.doneWeek} label="הושלמו ב-7 ימים" />
        <Tile value={s.open} label="פתוחות" />
        <Tile value={s.avg ? s.avg.toFixed(1) : '0'} label="ממוצע ימי דחייה למשימה שהושלמה" />
      </div>

      <section className="stats-card">
        <h2>משימות שהושלמו ב-7 הימים האחרונים</h2>
        <div className="bars" role="img" aria-label={s.week.map((w) => `${dayLong.format(new Date(w.iso + 'T12:00'))}: ${w.count}`).join(', ')}>
          {s.week.map((w, i) => (
            <div
              key={w.iso}
              className={`bar-col${hover === i ? ' hover' : ''}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onTouchStart={() => setHover(i)}
            >
              {hover === i && (
                <div className="bar-tip" role="tooltip">
                  <b>{w.count}</b> {dayLong.format(new Date(w.iso + 'T12:00'))}
                </div>
              )}
              <div className="bar-track">
                <div className="bar" style={{ height: `${(w.count / s.max) * 100}%` }} />
              </div>
              <span className={`bar-label${w.iso === t ? ' today' : ''}`}>{w.iso === t ? 'היום' : dayShort.format(new Date(w.iso + 'T12:00'))}</span>
            </div>
          ))}
        </div>
        <table className="sr-only">
          <tbody>
            {s.week.map((w) => (
              <tr key={w.iso}>
                <td>{dayLong.format(new Date(w.iso + 'T12:00'))}</td>
                <td>{w.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="stats-card">
        <h2>נדחו הכי הרבה</h2>
        {s.top.length ? (
          <ul className="top-list">
            {s.top.map((x) => (
              <li key={x.id}>
                <button onClick={() => onOpen(x)}>
                  <span>{x.title}</span>
                  <span className="postponed">{postponedLabel(x.postponed)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">אין משימות פתוחות שנדחו 🎉</p>
        )}
      </section>
    </div>
  )
}

function Tile({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="tile">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}

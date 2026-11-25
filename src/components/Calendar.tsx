import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, toISODate, today } from '../dates'
import { ChevronIcon } from '../icons'
import { holidayOn } from '../holidays'
import type { DayMark } from '../logic'

interface Props {
  selected: string // YYYY-MM-DD
  marks: Map<string, DayMark>
  onSelect: (iso: string) => void
  dropOver?: string | null // יום שמשימה נגררת מעליו
}

const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
const monthFmt = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' })
const dayFmt = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })
const COLLAPSE_KEY = 'task-manager:calendar-collapsed'

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const sameMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7)
/** יום ראשון של השבוע שבו נמצא התאריך */
const weekStart = (iso: string) => addDays(iso, -parse(iso).getDay())

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * לוח חודשי: נקודה מתחת לכל יום שיש בו משימות, לחיצה על יום בוחרת אותו.
 * מצב מכווץ מציג רק את השבוע של היום הנבחר. החלקה למעלה מכווצת, החלקה למטה מרחיבה.
 */
export function Calendar({ selected, marks, onSelect, dropOver }: Props) {
  // anchor: התאריך שקובע מה מוצג – החודש שלו (מורחב) או השבוע שלו (מכווץ)
  const [anchor, setAnchor] = useState(selected)
  const [collapsed, setCollapsedState] = useState(readCollapsed)
  const t = today()

  const setCollapsed = (v: boolean) => {
    setCollapsedState(v)
    // בכיווץ מציגים את השבוע של היום הנבחר, אם הוא בחודש שמוצג
    if (v && sameMonth(selected, anchor)) setAnchor(selected)
    try {
      localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  // כשבוחרים יום (או "היום") – מציגים את החודש / השבוע שלו
  useEffect(() => setAnchor(selected), [selected])

  const days = useMemo(() => {
    const a = parse(anchor)
    let start: Date
    let count: number
    if (collapsed) {
      start = parse(weekStart(anchor))
      count = 7
    } else {
      const first = new Date(a.getFullYear(), a.getMonth(), 1)
      const last = new Date(a.getFullYear(), a.getMonth() + 1, 0)
      start = new Date(a.getFullYear(), a.getMonth(), 1 - first.getDay())
      count = Math.ceil((first.getDay() + last.getDate()) / 7) * 7
    }
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
      return { iso: toISODate(d), day: d.getDate(), inMonth: collapsed || d.getMonth() === a.getMonth() }
    })
  }, [anchor, collapsed])

  /** הקודם / הבא: חודש במצב מורחב, שבוע במצב מכווץ */
  const shift = (delta: number) =>
    setAnchor((cur) => {
      if (collapsed) return addDays(cur, delta * 7)
      const d = parse(cur)
      return toISODate(new Date(d.getFullYear(), d.getMonth() + delta, 1))
    })

  // החלקות בטלפון. אופקית (RTL): ימינה = הבא, שמאלה = הקודם. אנכית: למעלה = כיווץ, למטה = הרחבה
  const touch = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return
    const dx = e.changedTouches[0].clientX - touch.current.x
    const dy = e.changedTouches[0].clientY - touch.current.y
    touch.current = null
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) shift(dx > 0 ? 1 : -1)
    else if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx) * 1.2) setCollapsed(dy < 0)
  }

  const showsToday = collapsed ? days.some((d) => d.iso === t) : sameMonth(anchor, t)
  const unit = collapsed ? 'השבוע' : 'החודש'

  return (
    <div className={`calendar${collapsed ? ' collapsed' : ''}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="cal-head">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label={`${unit} הקודם`}>
          <ChevronIcon className="flip" />
        </button>
        <h2 className="cal-month">{monthFmt.format(parse(collapsed ? weekStart(anchor) : anchor))}</h2>
        <button className="icon-btn" onClick={() => shift(1)} aria-label={`${unit} הבא`}>
          <ChevronIcon />
        </button>
        <span className="spacer" />
        {(!showsToday || selected !== t) && (
          <button className="btn small" onClick={() => onSelect(t)}>
            היום
          </button>
        )}
      </div>

      <div className="cal-grid" role="grid" aria-label="לוח שנה" key={collapsed ? 'week' : 'month'}>
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-weekday" role="columnheader">
            {w}
          </div>
        ))}
        {days.map(({ iso, day, inMonth }) => {
          const mark = marks.get(iso)
          const holiday = holidayOn(iso)
          const cls = [
            'cal-day',
            inMonth ? '' : 'out',
            iso === t ? 'today' : '',
            iso === selected ? 'selected' : '',
            iso === dropOver ? 'drop-over' : '',
            holiday ? 'holiday' : '',
          ]
            .filter(Boolean)
            .join(' ')
          const label = `${dayFmt.format(parse(iso))}${holiday ? `, ${holiday}` : ''}${mark?.open ? `, ${mark.open} משימות פתוחות` : ''}`
          return (
            <button key={iso} data-date={iso} className={cls} onClick={() => onSelect(iso)} aria-label={label} aria-pressed={iso === selected} title={holiday ?? undefined}>
              <span className="cal-num">{day}</span>
              <span className={`cal-dot${mark?.open ? (mark.overdue ? ' overdue' : ' open') : mark?.done ? ' done' : ''}`} />
            </button>
          )
        })}
      </div>

      <button
        className="cal-handle"
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? 'הצגת החודש המלא' : 'כיווץ לשבוע אחד'}
        aria-expanded={!collapsed}
      >
        <span />
      </button>
    </div>
  )
}

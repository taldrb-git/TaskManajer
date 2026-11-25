import { useCallback, useEffect, useRef, useState, type MouseEvent, type TouchEvent as ReactTouchEvent } from 'react'
import { dueLabel } from '../dates'
import type { Task } from '../types'

/**
 * גרירת משימה אל תאריך.
 * יעדי השחרור הם אלמנטים עם data-date="YYYY-MM-DD" (ימים בלוח השנה, קבוצות תאריך במסך "בקרוב").
 * עכבר: גוררים אחרי תזוזה של 6px. מגע: לחיצה ארוכה (350ms) ואז גרירה, כדי לא להפריע לגלילה.
 */
/** "להיום", "למחר", "ליום שלישי", "ל־22 בנוב׳" */
export function toDateLabel(iso: string): string {
  const label = dueLabel(iso)
  return /^\d/.test(label) ? `ל־${label}` : `ל${label}`
}

export function useDateDrag(onDrop: (task: Task, date: string) => void) {
  const [drag, setDrag] = useState<{ task: Task; x: number; y: number; over: string | null } | null>(null)
  const suppressClick = useRef(false)
  const dropRef = useRef(onDrop)
  dropRef.current = onDrop

  const hit = (x: number, y: number): string | null =>
    (document.elementFromPoint(x, y)?.closest('[data-date]') as HTMLElement | null)?.dataset.date ?? null

  const begin = (task: Task, x: number, y: number) => {
    document.body.classList.add('is-dragging')
    navigator.vibrate?.(15)
    setDrag({ task, x, y, over: hit(x, y) })
  }
  const moveTo = (x: number, y: number) => setDrag((d) => d && { ...d, x, y, over: hit(x, y) })
  const finish = (task: Task, x: number, y: number) => {
    document.body.classList.remove('is-dragging')
    suppressClick.current = true
    setTimeout(() => (suppressClick.current = false), 50)
    const date = hit(x, y)
    setDrag(null)
    if (date && date !== task.due) dropRef.current(task, date)
  }

  useEffect(() => () => document.body.classList.remove('is-dragging'), [])

  const bind = useCallback(
    (task: Task) => ({
      onMouseDown(e: MouseEvent) {
        if (e.button !== 0 || (e.target as HTMLElement).closest('.check')) return
        const sx = e.clientX
        const sy = e.clientY
        let started = false
        const move = (ev: globalThis.MouseEvent) => {
          if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) {
            started = true
            begin(task, ev.clientX, ev.clientY)
          }
          if (started) moveTo(ev.clientX, ev.clientY)
        }
        const up = (ev: globalThis.MouseEvent) => {
          window.removeEventListener('mousemove', move)
          window.removeEventListener('mouseup', up)
          if (started) finish(task, ev.clientX, ev.clientY)
        }
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', up)
      },
      onTouchStart(e: ReactTouchEvent) {
        if ((e.target as HTMLElement).closest('.check')) return
        const sx = e.touches[0].clientX
        const sy = e.touches[0].clientY
        let started = false
        const timer = setTimeout(() => {
          started = true
          begin(task, sx, sy)
        }, 350)
        const cleanup = () => {
          clearTimeout(timer)
          window.removeEventListener('touchmove', move)
          window.removeEventListener('touchend', end)
          window.removeEventListener('touchcancel', cancel)
        }
        const move = (ev: TouchEvent) => {
          const p = ev.touches[0]
          if (!started) {
            if (Math.hypot(p.clientX - sx, p.clientY - sy) > 8) cleanup() // זו גלילה, לא גרירה
            return
          }
          ev.preventDefault()
          moveTo(p.clientX, p.clientY)
        }
        const end = (ev: TouchEvent) => {
          cleanup()
          if (started) {
            ev.preventDefault()
            const p = ev.changedTouches[0]
            finish(task, p.clientX, p.clientY)
          }
        }
        const cancel = () => {
          cleanup()
          if (started) {
            document.body.classList.remove('is-dragging')
            setDrag(null)
          }
        }
        window.addEventListener('touchmove', move, { passive: false })
        window.addEventListener('touchend', end)
        window.addEventListener('touchcancel', cancel)
      },
      onClickCapture(e: MouseEvent) {
        if (suppressClick.current) {
          e.stopPropagation()
          e.preventDefault()
        }
      },
      onContextMenu(e: MouseEvent) {
        e.preventDefault() // לחיצה ארוכה באנדרואיד פותחת תפריט
      },
    }),
    [],
  )

  const ghost = drag && (
    <div className="drag-ghost" style={{ left: Math.min(Math.max(drag.x, 130), window.innerWidth - 130), top: drag.y }} aria-hidden="true">
      {drag.task.title}
      <small>{drag.over ? `העברה ${toDateLabel(drag.over)}` : 'שחררו על תאריך'}</small>
    </div>
  )

  return { bind, ghost, dragging: drag?.task.id ?? null, over: drag?.over ?? null }
}

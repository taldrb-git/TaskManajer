import { useRef, useState, type TouchEvent } from 'react'
import { TrashIcon } from '../icons'

const TRIGGER = 90
const MAX = 140

/**
 * החלקה ימינה למחיקה (בטלפון), לשורות של פתקים. אותה התנהגות ואותו מראה כמו בשורת משימה.
 * מחזיר אירועי מגע לשורה, את הרקע האדום שנחשף, ואת הסגנון של התוכן שזז.
 */
export function useSwipeDelete(onDelete: () => void) {
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number; mode: 'idle' | 'swipe' | 'scroll' } | null>(null)

  const handlers = {
    onTouchStart: (e: TouchEvent) => {
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, mode: 'idle' }
    },
    onTouchMove: (e: TouchEvent) => {
      const s = start.current
      if (!s) return
      const mx = e.touches[0].clientX - s.x
      const my = e.touches[0].clientY - s.y
      if (s.mode === 'idle') {
        if (mx > 12 && mx > Math.abs(my) * 1.5) s.mode = 'swipe'
        else if (Math.abs(my) > 10 || mx < -12) s.mode = 'scroll'
      }
      if (s.mode === 'swipe') setDx(Math.max(0, Math.min(MAX, mx)))
    },
    onTouchEnd: () => {
      const s = start.current
      start.current = null
      if (s?.mode === 'swipe' && dx >= TRIGGER) onDelete()
      setDx(0)
    },
  }

  const bg =
    dx > 0 ? (
      <div className={`swipe-bg delete${dx >= TRIGGER ? ' armed' : ''}`} aria-hidden="true">
        <span>
          <TrashIcon width={20} height={20} /> מחיקה
        </span>
      </div>
    ) : null

  return {
    handlers: { ...handlers, onTouchCancel: handlers.onTouchEnd },
    bg,
    rowStyle: dx ? { transform: `translateX(${dx}px)` } : undefined,
    swiping: dx !== 0,
  }
}

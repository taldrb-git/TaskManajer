import { useEffect, useRef, type ReactNode } from 'react'
import { XIcon } from '../icons'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

/**
 * סגירה ב-Esc או בכפתור "חזור" של הטלפון / הדפדפן.
 * משמש את כל החלונות הקופצים (Sheet, Composer).
 */
export function useDismiss(onClose: () => void) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    history.pushState({ sheet: true }, '')
    let poppedByBack = false
    const onPop = () => {
      poppedByBack = true
      closeRef.current()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)
    document.body.classList.add('no-scroll')
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('no-scroll')
      if (!poppedByBack && history.state?.sheet) history.back()
    }
  }, [])
}

/** חלון תחתון (במובייל) / דיאלוג (במחשב). נסגר גם בלחיצה על הרקע. */
export function Sheet({ title, onClose, children, footer }: Props) {
  useDismiss(onClose)

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="סגירה">
            <XIcon />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </div>
    </div>
  )
}

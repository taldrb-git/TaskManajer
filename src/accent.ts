import { useState } from 'react'

/** צבע ההדגשה של האפליקציה. הצבעים עצמם מוגדרים ב-index.css לפי data-accent */
export type Accent = 'lavender' | 'sage' | 'peach' | 'rose'

export const ACCENTS: { id: Accent; name: string; color: string }[] = [
  { id: 'lavender', name: 'לבנדר', color: '#b4a5f5' },
  { id: 'sage', name: 'מרווה', color: '#8fcfb0' },
  { id: 'peach', name: 'אפרסק', color: '#f2b38b' },
  { id: 'rose', name: 'ורוד עתיק', color: '#eba4c0' },
]

const KEY = 'task-manager:accent'

function read(): Accent {
  try {
    const v = localStorage.getItem(KEY) as Accent | null
    if (v && ACCENTS.some((a) => a.id === v)) return v
  } catch {
    /* ignore */
  }
  return 'lavender'
}

export function applyAccent(a: Accent = read()) {
  if (a === 'lavender') document.documentElement.removeAttribute('data-accent')
  else document.documentElement.setAttribute('data-accent', a)
}

export function useAccent(): [Accent, (a: Accent) => void] {
  const [accent, setState] = useState<Accent>(read)
  const set = (a: Accent) => {
    setState(a)
    applyAccent(a)
    try {
      localStorage.setItem(KEY, a)
    } catch {
      /* ignore */
    }
  }
  return [accent, set]
}

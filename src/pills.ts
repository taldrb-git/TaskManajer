/**
 * גלולות: 21 ימי כדורים, 7 ימי הפסקה, וחוזר. מקסימום 2 חפיסות ברצף (בלי הפסקה ביניהן).
 * הנתונים: רשימת תאריכי התחלה של חפיסות שנרשמו (Note עם board = 'pills', date = היום של הכדור הראשון).
 * כל השאר מחושב: אחרי החפיסה האחרונה שנרשמה ממשיכים לבד – הפסקה, חפיסה, הפסקה...
 */
import { addDays, diffDays, today } from './dates'
import type { Note } from './types'

export const PILL_DAYS = 21
export const BREAK_DAYS = 7
export const MAX_CHAIN = 2

export interface Segment {
  kind: 'pack' | 'break'
  start: string
  end: string // כולל
  chain: number // חפיסה: כמה ברצף כולל זו. הפסקה: כמה חפיסות ברצף היו לפניה
  projected: boolean // חפיסה שלא נרשמה – חושבה לבד
  noteId?: string
}

export const packStarts = (notes: Note[]) =>
  notes
    .filter((n) => n.board === 'pills' && n.date)
    .sort((a, b) => a.date!.localeCompare(b.date!))

/** ציר הזמן מהחפיסה הראשונה שנרשמה ועד until (כולל) */
export function timeline(notes: Note[], until: string): Segment[] {
  const packs = packStarts(notes)
  const out: Segment[] = []
  let chain = 0
  for (let i = 0; i < packs.length; i++) {
    const start = packs[i].date!
    const prev = out.findLast((s) => s.kind === 'pack')
    if (prev) {
      const breakStart = addDays(prev.start, PILL_DAYS)
      if (start <= breakStart) {
        // חיבור: החפיסה הבאה התחילה בלי הפסקה (אם מוקדם מהצפוי – החפיסה הקודמת נגמרת יום לפני)
        prev.end = addDays(start, -1)
        chain++
      } else {
        out.push({ kind: 'break', start: breakStart, end: addDays(start, -1), chain, projected: false })
        chain = 1
      }
    } else chain = 1
    out.push({ kind: 'pack', start, end: addDays(start, PILL_DAYS - 1), chain, projected: false, noteId: packs[i].id })
  }
  // המשך אוטומטי: הפסקה של 7 ימים וחפיסה חדשה
  let last = out.findLast((s) => s.kind === 'pack')
  while (last && last.end < until) {
    const bStart = addDays(last.end, 1)
    out.push({ kind: 'break', start: bStart, end: addDays(bStart, BREAK_DAYS - 1), chain: last.chain, projected: true })
    const pStart = addDays(bStart, BREAK_DAYS)
    last = { kind: 'pack', start: pStart, end: addDays(pStart, PILL_DAYS - 1), chain: 1, projected: true }
    out.push(last)
  }
  return out
}

export interface PillState {
  current: Segment
  day: number // יום כמה בתוך הקטע (מ-1)
  length: number // אורך הקטע
  next: Segment | undefined
  canConnect: boolean // אפשר לחבר חפיסה (בלי הפסקה)
  connected: boolean // החפיסה הבאה כבר מחוברת
}

/** איפה את היום. undefined = אין חפיסה רשומה, או שהחפיסה הראשונה עוד לא התחילה */
export function pillState(notes: Note[], on = today()): PillState | undefined {
  const segs = timeline(notes, addDays(on, 120))
  const i = segs.findIndex((s) => s.start <= on && on <= s.end)
  if (i < 0) return undefined
  const current = segs[i]
  const next = segs[i + 1]
  const connected = current.kind === 'pack' && next?.kind === 'pack'
  return {
    current,
    day: diffDays(current.start, on) + 1,
    length: diffDays(current.start, current.end) + 1,
    next,
    connected,
    canConnect: current.kind === 'pack' && !connected && current.chain < MAX_CHAIN,
  }
}

/** ימי ההפסקה (לסימון בלוח השנה), מהחפיסה הראשונה ועד שנה וחצי קדימה */
export function breakDays(notes: Note[]): Map<string, { day: number; length: number }> {
  const map = new Map<string, { day: number; length: number }>()
  for (const s of timeline(notes, addDays(today(), 550))) {
    if (s.kind !== 'break') continue
    const length = diffDays(s.start, s.end) + 1
    for (let d = 0; d < length; d++) map.set(addDays(s.start, d), { day: d + 1, length })
  }
  return map
}

/** ההפסקות הבאות (מהיום והלאה) */
export const upcomingBreaks = (notes: Note[], count: number) =>
  timeline(notes, addDays(today(), (PILL_DAYS + BREAK_DAYS) * (count + 1)))
    .filter((s) => s.kind === 'break' && s.end >= today())
    .slice(0, count)

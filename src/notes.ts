import { diffDays, today } from './dates'
import type { Board, Note, NoteBoard } from './types'

export interface BoardMeta {
  id: Board
  label: string
  emoji: string
  /** שלושת המצבים (0, 1, 2) – ללוחות עם מעקב מצב */
  statuses?: [string, string, string]
  /** כותרת המקטע של פריטים שהסתיימו (status 2) */
  doneTitle?: string
  /** טקסט לשדה הכותרת בחלון ההוספה */
  titleLabel: string
}

export const BOARDS: BoardMeta[] = [
  { id: 'someday', label: 'יום אחד', emoji: '💭', titleLabel: 'מה לעשות' },
  { id: 'shopping', label: 'לקנות', emoji: '🛒', doneTitle: 'נקנו', titleLabel: 'מה לקנות' },
  { id: 'packages', label: 'חבילות', emoji: '📦', statuses: ['הוזמנה', 'בדרך', 'הגיעה'], doneTitle: 'הגיעו', titleLabel: 'מה הזמנתי' },
  { id: 'refunds', label: 'החזרים', emoji: '💸', statuses: ['ביקשתי', 'אושר', 'התקבל בבנק'], doneTitle: 'התקבלו', titleLabel: 'ממי (חנות / חברה)' },
  { id: 'hair', label: 'שיער', emoji: '💇‍♀️', titleLabel: 'סוג הטיפול' },
]

export const boardMeta = (b: Board): BoardMeta => BOARDS.find((x) => x.id === b)!

export const isBoard = (s: string): s is Board => BOARDS.some((b) => b.id === s)

/** סוגי טיפול שמוצעים בלוח השיער (אפשר לכתוב גם סוג אחר) */
export const HAIR_TYPES = ['גוונים', 'פתיחת תלתלים', 'תספורת', 'צבע']

const money = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 })
export const formatMoney = (n: number) => money.format(n)

const shortDate = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short' })
const shortDateYear = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })
/** "12 באוק׳" (או עם שנה, אם לא השנה) */
export function shortDateLabel(iso: string): string {
  const d = new Date(iso + 'T12:00')
  return (iso.slice(0, 4) === today().slice(0, 4) ? shortDate : shortDateYear).format(d)
}

/** "היום", "אתמול", "לפני 5 ימים", "לפני 6 שבועות", "לפני 3 חודשים" (או "בעוד…" לתאריך עתידי) */
export function agoLabel(iso: string): string {
  const days = diffDays(iso, today())
  if (days === 0) return 'היום'
  if (days === 1) return 'אתמול'
  if (days === -1) return 'מחר'
  const abs = Math.abs(days)
  const pre = days > 0 ? 'לפני' : 'בעוד'
  if (abs < 14) return `${pre} ${abs} ימים`
  if (abs < 60) {
    const w = Math.round(abs / 7)
    return w === 2 ? `${pre} שבועיים` : `${pre} ${w} שבועות`
  }
  const m = Math.round(abs / 30.4)
  if (m < 12) return m === 2 ? `${pre} חודשיים` : `${pre} ${m} חודשים`
  const y = Math.round(abs / 365)
  return y === 1 ? `${pre} שנה` : y === 2 ? `${pre} שנתיים` : `${pre} ${y} שנים`
}

export const notesOf = (notes: Note[], b: NoteBoard) => notes.filter((n) => n.board === b)

/** הטיפול האחרון מכל סוג – לראש לוח השיער */
export function lastHair(notes: Note[]): { title: string; date: string }[] {
  const last = new Map<string, string>()
  for (const n of notesOf(notes, 'hair')) {
    if (!n.date || n.date > today()) continue
    const k = n.title.trim()
    if (!k) continue
    if (!last.has(k) || last.get(k)! < n.date) last.set(k, n.date)
  }
  return [...last.entries()].map(([title, date]) => ({ title, date })).sort((a, b) => a.date.localeCompare(b.date))
}

/** כמה כסף עוד לא חזר (החזרים שלא התקבלו) */
export const pendingRefunds = (notes: Note[]) =>
  notesOf(notes, 'refunds')
    .filter((n) => n.status < 2)
    .reduce((sum, n) => sum + (n.amount ?? 0), 0)

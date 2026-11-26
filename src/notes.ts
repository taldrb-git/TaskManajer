import { addDays, addMonths, diffDays, today } from './dates'
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
  { id: 'books', label: 'ספרים', emoji: '📚', doneTitle: 'קראתי', titleLabel: 'שם הספר' },
  { id: 'packages', label: 'חבילות', emoji: '📦', statuses: ['הוזמנה', 'בדרך', 'הגיעה'], doneTitle: 'הגיעו', titleLabel: 'מאיפה הזמנתי' },
  { id: 'refunds', label: 'החזרים', emoji: '💸', statuses: ['ביקשתי', 'אושר', 'התקבל בבנק'], doneTitle: 'התקבלו', titleLabel: 'ממי (חנות / חברה)' },
  { id: 'hair', label: 'שיער', emoji: '💇‍♀️', titleLabel: 'סוג הטיפול' },
  { id: 'lashes', label: 'ריסים', emoji: '👁️', titleLabel: 'סוג הטיפול' },
  { id: 'pills', label: 'גלולות', emoji: '💊', titleLabel: 'חפיסה' },
  { id: 'car', label: 'רכב', emoji: '🚗', titleLabel: 'מה צריך לחדש' },
]

export const CAR_TYPES = ['טסט', 'ביטוח חובה', 'ביטוח מקיף', 'ביטוח צד ג׳', 'רישיון רכב']

export const boardMeta = (b: Board): BoardMeta => BOARDS.find((x) => x.id === b)!

export const isBoard = (s: string): s is Board => BOARDS.some((b) => b.id === s)

/** לוחות של תורים (טיפולים) – "מתי היה התור האחרון" */
export type TreatmentBoard = 'hair' | 'lashes'
export const isTreatment = (b: Board): b is TreatmentBoard => b === 'hair' || b === 'lashes'

/** סוגי טיפול שמוצעים בכל לוח תורים (אפשר לכתוב גם סוג אחר) */
export const TREATMENT_TYPES: Record<TreatmentBoard, string[]> = {
  hair: ['גוונים', 'פתיחת תלתלים', 'תספורת', 'צבע'],
  lashes: ['הרמת ריסים', 'הרמת גבות', 'צביעת ריסים'],
}

// ---------- תזכורות לקביעת תור ----------

/** הגדרות התזכורות של לוחות התורים. המפתח: "hair:גוונים" */
export interface BookingPrefs {
  intervals: Record<string, number> // כל כמה חודשים
  lead: Record<TreatmentBoard, number> // כמה ימים לפני להזכיר
  carLead?: number // רכב: כמה ימים לפני פקיעת התוקף להזכיר
  archive?: Partial<Record<'shopping' | 'someday', number>> // אחרי כמה ימים פריט שסומן יוצא מהרשימה (0 = אף פעם)
}

export const DEFAULT_BOOKING_PREFS: BookingPrefs = {
  intervals: { 'hair:גוונים': 6, 'hair:פתיחת תלתלים': 4, 'lashes:הרמת ריסים': 3, 'lashes:הרמת גבות': 3 },
  lead: { hair: 14, lashes: 14 },
  carLead: 30,
  archive: { shopping: 7, someday: 7 },
}

export const CAR_LEAD_OPTIONS: [number, string][] = [
  [7, 'שבוע לפני'],
  [14, 'שבועיים לפני'],
  [30, 'חודש לפני'],
  [60, 'חודשיים לפני'],
]

export const ARCHIVE_OPTIONS: [number, string][] = [
  [0, 'אף פעם – נשארים ברשימה'],
  [1, 'אחרי יום'],
  [7, 'אחרי שבוע'],
  [30, 'אחרי חודש'],
]

export const archiveDays = (prefs: BookingPrefs, b: 'shopping' | 'someday') => prefs.archive?.[b] ?? DEFAULT_BOOKING_PREFS.archive![b]!

/** פריט שסומן לפני יותר מ-days ימים (לפי זמן הסימון) – יוצא מהרשימה */
export function archived(doneAt: string | null, days: number): boolean {
  if (!days || !doneAt) return false
  return Date.now() - new Date(doneAt).getTime() > days * 86_400_000
}

export interface CarStatus {
  note: Note
  expired: boolean
  due: boolean // בתוך חלון ההתראה (או שפג)
}

/** מצב כל פריט ברכב עם תאריך תוקף, הקרוב לפקוע ראשון */
export function carStatus(notes: Note[], prefs: BookingPrefs): CarStatus[] {
  const t = today()
  const lead = prefs.carLead ?? DEFAULT_BOOKING_PREFS.carLead!
  return notesOf(notes, 'car')
    .filter((n) => n.date)
    .sort((a, b) => a.date!.localeCompare(b.date!))
    .map((n) => ({ note: n, expired: n.date! < t, due: t >= addDays(n.date!, -lead) }))
}

/** "בתוקף עד 12 במרץ · בעוד 3 חודשים" / "פג תוקף לפני 3 ימים" */
export function expiryLabel(date: string): string {
  if (date < today()) return `פג תוקף ${agoLabel(date)}`
  if (date === today()) return 'פג תוקף היום'
  return `בתוקף עד ${shortDateLabel(date)} · ${agoLabel(date)}`
}

/** כמה כסף יש בגיפטקארדים שעוד לא נוצלו */
export const giftcardTotal = (notes: Note[]) =>
  notesOf(notes, 'refunds')
    .filter((n) => n.kind === 'giftcard')
    .reduce((sum, n) => sum + (n.amount ?? 0), 0)

export const LEAD_OPTIONS: [number, string][] = [
  [0, 'ביום עצמו'],
  [7, 'שבוע לפני'],
  [14, 'שבועיים לפני'],
  [30, 'חודש לפני'],
]

export const prefKey = (board: TreatmentBoard, type: string) => `${board}:${type.trim()}`

/** סוגי הטיפול בלוח: המוצעים + כל סוג שכבר נרשם */
export const treatmentTypes = (notes: Note[], board: TreatmentBoard) => [
  ...new Set([...TREATMENT_TYPES[board], ...notesOf(notes, board).map((n) => n.title.trim()).filter(Boolean)]),
]

export interface BookingStatus {
  board: TreatmentBoard
  type: string
  months: number
  last: string // התור האחרון שכבר היה
  next: string // מתי מומלץ התור הבא
  remindFrom: string // מאיזה יום להזכיר
  booked: boolean // יש כבר תור עתידי מהסוג הזה
  due: boolean // צריך להזכיר עכשיו: הגיע הזמן ועוד לא נקבע תור
}

/** מצב התזכורת לכל סוג טיפול שיש לו הגדרת "כל X חודשים" ותור קודם */
export function bookingStatus(notes: Note[], prefs: BookingPrefs, board: TreatmentBoard): BookingStatus[] {
  const t = today()
  const last = new Map(lastTreatment(notes, board).map((x) => [x.title, x.date]))
  const upcoming = new Set(upcomingTreatments(notes, board).map((n) => n.title.trim()))
  const out: BookingStatus[] = []
  for (const type of treatmentTypes(notes, board)) {
    const months = prefs.intervals[prefKey(board, type)]
    const lastDate = last.get(type)
    if (!months || !lastDate) continue
    const next = addMonths(lastDate, months)
    const remindFrom = addDays(next, -(prefs.lead[board] ?? 14))
    const booked = upcoming.has(type)
    out.push({ board, type, months, last: lastDate, next, remindFrom, booked, due: !booked && t >= remindFrom })
  }
  return out
}

/** "כל חודש", "כל חודשיים", "כל 3 חודשים" */
export const everyMonthsLabel = (m: number) => (m === 1 ? 'כל חודש' : m === 2 ? 'כל חודשיים' : `כל ${m} חודשים`)

/** חבילה: "הוזמנה היום", "מחכה יום אחד", "מחכה יומיים", "מחכה 5 ימים" */
export function waitingLabel(ordered: string): string {
  const d = diffDays(ordered, today())
  if (d <= 0) return 'הוזמנה היום'
  if (d === 1) return 'מחכה יום אחד'
  if (d === 2) return 'מחכה יומיים'
  return `מחכה ${d} ימים`
}

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

/** הטיפול האחרון מכל סוג – לראש לוח השיער / הריסים */
export function lastTreatment(notes: Note[], board: TreatmentBoard): { title: string; date: string }[] {
  const last = new Map<string, string>()
  for (const n of notesOf(notes, board)) {
    if (!n.date || n.date >= today()) continue // תור של היום ואילך = תור קרוב
    const k = n.title.trim()
    if (!k) continue
    if (!last.has(k) || last.get(k)! < n.date) last.set(k, n.date)
  }
  return [...last.entries()].map(([title, date]) => ({ title, date })).sort((a, b) => a.date.localeCompare(b.date))
}

/** תורים מהיום והלאה, הקרוב ראשון */
export const upcomingTreatments = (notes: Note[], board: TreatmentBoard) =>
  notesOf(notes, board)
    .filter((n) => n.date && n.date >= today())
    .sort((a, b) => (a.date! + (a.time ?? '')).localeCompare(b.date! + (b.time ?? '')))

/** כמה כסף עוד לא חזר (החזרים שלא התקבלו) */
export const pendingRefunds = (notes: Note[]) =>
  notesOf(notes, 'refunds')
    .filter((n) => n.status < 2 && !n.kind)
    .reduce((sum, n) => sum + (n.amount ?? 0), 0)

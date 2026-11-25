import { addDays, toISODate, today } from './dates'
import type { Priority, Repeat, Task, TaskList, View } from './types'

export const PRIORITY_LABEL: Record<Priority, string> = { 0: 'ללא', 1: 'נמוכה', 2: 'בינונית', 3: 'גבוהה' }

export const REPEAT_LABEL: Record<Repeat, string> = {
  daily: 'כל יום',
  weekdays: 'ימי חול (א׳–ה׳)',
  weekly: 'כל שבוע',
  monthly: 'כל חודש',
  yearly: 'כל שנה',
}

export const REMIND_OPTIONS: [number, string][] = [
  [0, 'בזמן'],
  [10, '10 דקות לפני'],
  [30, 'חצי שעה לפני'],
  [60, 'שעה לפני'],
  [1440, 'יום לפני'],
]

/** מיון: תאריך יעד (ריק בסוף), משימות עם שעה לפי השעה ולפני משימות בלי שעה, עדיפות יורדת, ואז זמן יצירה */
export function compareTasks(a: Task, b: Task): number {
  if (a.due !== b.due) {
    if (!a.due) return 1
    if (!b.due) return -1
    return a.due < b.due ? -1 : 1
  }
  if (a.time !== b.time) {
    if (!a.time) return 1
    if (!b.time) return -1
    return a.time < b.time ? -1 : 1
  }
  if (a.priority !== b.priority) return b.priority - a.priority
  return a.created_at.localeCompare(b.created_at)
}

export interface Section {
  key: string
  title?: string
  tone?: 'danger'
  tasks: Task[]
  collapsible?: boolean
  date?: string // מקטע של תאריך מסוים – אפשר לגרור אליו משימות
}

export function viewTitle(view: View, lists: TaskList[]): string {
  switch (view.kind) {
    case 'today':
      return 'היום'
    case 'upcoming':
      return 'בקרוב'
    case 'calendar':
      return 'לוח שנה'
    case 'all':
      return 'כל המשימות'
    case 'done':
      return 'הושלמו'
    case 'search':
      return 'חיפוש'
    case 'list':
      return lists.find((l) => l.id === view.id)?.name ?? 'רשימה'
    case 'stats':
      return 'סיכום'
    case 'trash':
      return 'סל מחזור'
  }
}

function groupByDate(tasks: Task[], label: (iso: string) => string): Section[] {
  const map = new Map<string, Task[]>()
  for (const t of tasks) {
    const k = t.due ?? ''
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(t)
  }
  return [...map.entries()].map(([k, ts]) => ({ key: k || 'none', title: k ? label(k) : 'ללא תאריך', tasks: ts, date: k || undefined }))
}

export function sectionsFor(view: View, all: Task[], dateLabel: (iso: string) => string): Section[] {
  const t = today()
  const open = all.filter((x) => !x.done).sort(compareTasks)
  const doneSorted = all.filter((x) => x.done).sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''))

  switch (view.kind) {
    case 'today': {
      const overdue = open.filter((x) => x.due && x.due < t)
      const todays = open.filter((x) => x.due === t)
      const doneToday = doneSorted.filter((x) => x.done_at && toISODate(new Date(x.done_at)) === t && x.due && x.due <= t)
      return [
        { key: 'overdue', title: 'באיחור', tone: 'danger' as const, tasks: overdue },
        { key: 'today', title: overdue.length ? 'היום' : undefined, tasks: todays },
        { key: 'done', title: 'הושלמו', tasks: doneToday, collapsible: true },
      ].filter((s) => s.tasks.length)
    }
    case 'upcoming':
      return groupByDate(
        open.filter((x) => x.due && x.due > t),
        dateLabel,
      )
    case 'calendar':
      return [
        { key: 'open', tasks: open.filter((x) => x.due === view.date) },
        { key: 'done', title: 'הושלמו', tasks: doneSorted.filter((x) => x.due === view.date) },
      ].filter((s, i) => i === 0 || s.tasks.length)
    case 'all':
      return [{ key: 'all', tasks: open }]
    case 'done':
      return [{ key: 'done', tasks: doneSorted }]
    case 'list':
      return [
        { key: 'open', tasks: open.filter((x) => x.list_id === view.id) },
        { key: 'done', title: 'הושלמו', tasks: doneSorted.filter((x) => x.list_id === view.id), collapsible: true },
      ].filter((s, i) => i === 0 || s.tasks.length)
    case 'stats':
    case 'trash':
      return [] // מסכים עם תצוגה משלהם
    case 'search': {
      const q = view.q.trim().toLowerCase()
      if (!q) return []
      const match = (x: Task) => x.title.toLowerCase().includes(q) || x.notes.toLowerCase().includes(q)
      return [
        { key: 'open', tasks: open.filter(match) },
        { key: 'done', title: 'הושלמו', tasks: doneSorted.filter(match) },
      ].filter((s) => s.tasks.length)
    }
  }
}

export function counts(tasks: Task[]) {
  const t = today()
  const open = tasks.filter((x) => !x.done)
  const byList: Record<string, number> = {}
  for (const x of open) if (x.list_id) byList[x.list_id] = (byList[x.list_id] ?? 0) + 1
  return {
    today: open.filter((x) => x.due && x.due <= t).length,
    overdue: open.filter((x) => x.due && x.due < t).length,
    upcoming: open.filter((x) => x.due && x.due > t).length,
    all: open.length,
    byList,
  }
}

export interface DayMark {
  open: number
  done: number
  overdue: boolean
}

/** סימון ימים בלוח השנה: כמה משימות פתוחות / שהושלמו יש בכל תאריך */
export function dayMarks(tasks: Task[]): Map<string, DayMark> {
  const t = today()
  const map = new Map<string, DayMark>()
  for (const x of tasks) {
    if (!x.due) continue
    const m = map.get(x.due) ?? { open: 0, done: 0, overdue: false }
    if (x.done) m.done++
    else {
      m.open++
      if (x.due < t) m.overdue = true
    }
    map.set(x.due, m)
  }
  return map
}

const MONTHS: Record<string, number> = {
  ינואר: 1, פברואר: 2, מרץ: 3, מרס: 3, אפריל: 4, מאי: 5, יוני: 6, יולי: 7, אוגוסט: 8, ספטמבר: 9, אוקטובר: 10, נובמבר: 11, דצמבר: 12,
}
const WEEKDAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const MONTH_RE = Object.keys(MONTHS).join('|')
const WEEKDAY_RE = WEEKDAY_NAMES.join('|')

/** תאריך מלא מיום/חודש/שנה. בלי שנה: השנה הנוכחית, ואם התאריך כבר עבר – השנה הבאה */
function makeDate(day: number, month: number, year?: number): string | undefined {
  const t = today()
  let y = year ? (year < 100 ? 2000 + year : year) : Number(t.slice(0, 4))
  const build = () => {
    const d = new Date(y, month - 1, day)
    return d.getMonth() === month - 1 && d.getDate() === day ? toISODate(d) : undefined
  }
  let iso = build()
  if (iso && !year && iso < t) {
    y++
    iso = build()
  }
  return iso
}

/** יום בחודש בלי שם חודש ("ב-25 לחודש"): החודש הנוכחי, ואם התאריך עבר (או nextMonth) – החודש הבא */
function makeDayOfMonth(day: number, nextMonth: boolean): string | undefined {
  const t = today()
  const [y, m] = t.split('-').map(Number)
  const build = (offset: number) => {
    const d = new Date(y, m - 1 + offset, day)
    return d.getDate() === day ? toISODate(d) : undefined // 31 בחודש של 30 יום – לא תקין
  }
  if (nextMonth) return build(1)
  const iso = build(0)
  return iso && iso >= t ? iso : build(1)
}

// ---------- ניקוי טקסט (בעיקר מזיהוי דיבור) ----------

/** מספרים במילים 1–31, זכר ונקבה: "חמישה", "עשרים וחמש", "שלוש עשרה"... */
const NUMBER_WORDS: Record<string, number> = (() => {
  const units: [number, string[]][] = [
    [1, ['אחד', 'אחת']], [2, ['שניים', 'שתיים', 'שני', 'שתי', 'שנים', 'שתים']], [3, ['שלושה', 'שלוש']], [4, ['ארבעה', 'ארבע']],
    [5, ['חמישה', 'חמש']], [6, ['שישה', 'שש']], [7, ['שבעה', 'שבע']], [8, ['שמונה']], [9, ['תשעה', 'תשע']],
  ]
  const map: Record<string, number> = { עשר: 10, עשרה: 10, עשרים: 20, שלושים: 30, ראשון: 1 }
  for (const [n, words] of units) {
    for (const w of words) {
      map[w] = n
      map[`${w} עשר`] = 10 + n
      map[`${w} עשרה`] = 10 + n
      map[`עשרים ו${w}`] = 20 + n
      if (n === 1) map[`שלושים ו${w}`] = 31
    }
  }
  return map
})()
const NUMBER_WORDS_RE = Object.keys(NUMBER_WORDS)
  .sort((a, b) => b.length - a.length)
  .join('|')
// מספר במילים שמגיע לפני "לחודש" / "בנובמבר" וכו' – מומר לספרות. רק בהקשר של תאריך, כדי לא לשנות "לקנות שלושה תפוחים"
const SPOKEN_DAY = new RegExp(String.raw`(^|\s)(ב|ל|עד\s)?(ה)?(${NUMBER_WORDS_RE})(?=\s+(?:ל|ב)(?:ה?חודש|${MONTH_RE}))`, 'g')

/**
 * Chrome מוסיף לפעמים לטקסט עברי סימני כיוון בלתי נראים, רווח קשיח או מקף עברי (־),
 * וכותב מספרים במילים. מנרמלים כדי שזיהוי התאריכים יעבוד.
 */
export function normalizeSpoken(text: string): string {
  return text
    .replace(/[‎‏‪-‮⁦-⁩؜]/g, '') // סימני כיוון
    .replace(/[  -​  　]/g, ' ') // רווחים מיוחדים
    .replace(/[־‐-―]/g, '-') // מקף עברי, מקפים ארוכים
    .replace(SPOKEN_DAY, (_m, sp: string, pre = '', he = '', words: string) => `${sp}${pre}${he}${NUMBER_WORDS[words]}`)
}

// ---------- שעה ----------

const HOUR_WORDS: Record<string, number> = {
  אחת: 1, שתיים: 2, שתים: 2, שלוש: 3, ארבע: 4, חמש: 5, שש: 6, שבע: 7, שמונה: 8, תשע: 9, עשר: 10,
  'אחת עשרה': 11, 'אחת-עשרה': 11, 'שתים עשרה': 12, 'שתיים עשרה': 12, 'שתים-עשרה': 12,
}
const HOUR_WORDS_RE = Object.keys(HOUR_WORDS).sort((a, b) => b.length - a.length).join('|')
const DAYPART_RE = 'בבוקר|בצהריים|בצהרים|אחר הצהריים|אחרי הצהריים|אחה"צ|אחה״צ|בערב|בלילה'

/** "4" + "אחר הצהריים" → 16. בלי חלק יום ובלי דקות מפורשות: 1–7 נחשבות אחה"צ */
function toHour(h: number, daypart: string | undefined, explicitMinutes: boolean): number {
  if (daypart) {
    if (daypart === 'בבוקר') return h === 12 ? 0 : h
    if (daypart === 'בלילה') return h >= 6 && h < 12 ? h + 12 : h === 12 ? 0 : h
    if (daypart.startsWith('בצהר')) return h < 6 ? h + 12 : h
    return h < 12 ? h + 12 : h // אחר הצהריים / בערב
  }
  if (!explicitMinutes && h >= 1 && h <= 7) return h + 12
  return h
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** מחפש שעה בטקסט. מחזיר את השעה (HH:MM) ואת הטקסט שזוהה, כדי להסיר אותו מהכותרת */
function findTime(title: string): { time: string; match: string } | undefined {
  const dp = String.raw`(?:\s+(${DAYPART_RE}))?`
  // 16:30 / ב-16:30 / בשעה 16:30 / 4:30 אחר הצהריים
  let m = title.match(new RegExp(String.raw`\s(?:בשעה\s+|ב-?|עד\s+)?(\d{1,2}):(\d{2})${dp}(?=\s)`))
  if (m) {
    const h = toHour(+m[1], m[3], true)
    if (h < 24 && +m[2] < 60) return { time: `${pad2(h)}:${m[2]}`, match: m[0] }
  }
  // בשעה 4 / בשעה ארבע וחצי / בארבע אחר הצהריים / בשמונה בערב
  const hour = String.raw`(\d{1,2}|${HOUR_WORDS_RE})(?:\s+ו(חצי|רבע))?`
  m = title.match(new RegExp(String.raw`\s(?:בשעה\s+${hour}${dp}|ב-?${hour}\s+(${DAYPART_RE}))(?=\s)`))
  if (m) {
    const word = m[1] ?? m[4]
    const frac = m[2] ?? m[5]
    const part = m[3] ?? m[6]
    const raw = /^\d+$/.test(word) ? +word : HOUR_WORDS[word]
    if (raw >= 0 && raw <= 23) {
      const h = toHour(raw, part, false)
      return { time: `${pad2(h)}:${frac === 'חצי' ? '30' : frac === 'רבע' ? '15' : '00'}`, match: m[0] }
    }
  }
  return undefined
}

/** מילות פתיחה שלא צריכות להיכנס לכותרת – בעיקר בהקלטה קולית ("יש לי פסיכולוגית") */
const FILLER = /^\s*(יש לי|תזכיר לי|תזכירי לי|להזכיר לי|תוסיף|תוסיפי|אני צריכה|אני צריך|צריך|צריכה)\s+/

/**
 * פענוח טקסט מהיר (מקלדת וקול): "לקנות חלב מחר !!" → כותרת "לקנות חלב", תאריך מחר, עדיפות בינונית.
 * תאריכים: היום, מחר, מחרתיים · 25.11 / 25/11/2026 · 25 בנובמבר · ב-25 לחודש (הבא) · ביום שלישי (הבא) · בעוד 3 ימים / בעוד שבוע.
 * סימני קריאה: ! נמוכה, !! בינונית, !!! גבוהה.
 */
export function parseQuickAdd(text: string): { title: string; due?: string; priority?: Priority; time?: string; repeat?: Repeat } {
  let title = ` ${normalizeSpoken(text).replace(/[.,!?]+$/, (m) => (m.includes('!') ? m : ''))} `
  let due: string | undefined
  let priority: Priority | undefined
  let time: string | undefined
  let repeat: Repeat | undefined
  const t = today()

  // שעה – לפני התאריכים, כדי ש"בארבע" לא ייתפס בטעות כמשהו אחר
  const tm = findTime(title)
  if (tm) {
    time = tm.time
    title = title.replace(tm.match, ' ')
  }

  // חזרה: "כל יום ראשון", "כל 10 לחודש", "כל יום", "בימי חול", "כל שבוע/חודש/שנה"
  const rWeekday = title.match(new RegExp(String.raw`\sכל\s+יום\s+(${WEEKDAY_RE})(?=\s)`))
  const rMonthDay = title.match(/\s(?:כל|ב-?)\s?(\d{1,2})\s+ל(?:כל\s+)?(?:ה)?חודש(?=\s)/)
  const rSimple = title.match(/\s(כל\s+יום\s+חול|בימי\s+חול|כל\s+יום|כל\s+שבוע|כל\s+חודש|כל\s+שנה)(?=\s)/)
  if (rWeekday) {
    repeat = 'weekly'
    const target = WEEKDAY_NAMES.indexOf(rWeekday[1])
    due = addDays(t, (target - new Date().getDay() + 7) % 7) // היום, אם היום זה היום הזה
    title = title.replace(rWeekday[0], ' ')
  } else if (rMonthDay && (title.includes('כל') || /לכל/.test(rMonthDay[0]))) {
    repeat = 'monthly'
    due = makeDayOfMonth(+rMonthDay[1], false)
    title = title.replace(rMonthDay[0], ' ')
  } else if (rSimple) {
    const w = rSimple[1].replace(/\s+/g, ' ')
    repeat = w.includes('חול') ? 'weekdays' : w === 'כל יום' ? 'daily' : w === 'כל שבוע' ? 'weekly' : w === 'כל חודש' ? 'monthly' : 'yearly'
    title = title.replace(rSimple[0], ' ')
  }
  const take = (re: RegExp, toDate: (m: RegExpMatchArray) => string | undefined) => {
    if (due) return
    const m = title.match(re)
    if (!m) return
    const d = toDate(m)
    if (!d) return
    due = d
    title = title.replace(m[0], ' ')
  }

  // 25.11 / 25/11 / 25.11.2026 / ב-25.11
  take(/\s(?:ב|ל|עד)?-?\s?(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=\s)/, (m) => makeDate(+m[1], +m[2], m[3] ? +m[3] : undefined))
  // 25 בנובמבר / ב-25 לנובמבר / 25 נובמבר 2026
  take(new RegExp(String.raw`\s(?:ב|ל|עד)?-?\s?(?:ה-?)?(\d{1,2})\s+(?:ב|ל|של\s)?-?(${MONTH_RE})(?:\s+(\d{4}))?(?=\s)`), (m) =>
    makeDate(+m[1], MONTHS[m[2]], m[3] ? +m[3] : undefined),
  )
  // ב-25 לחודש / ב-25 בחודש / 25 לחודש הבא – החודש הנוכחי, ואם היום כבר עבר: החודש הבא
  take(/\s(?:ב|ל|עד)?-?\s?(?:ה-?)?(\d{1,2})\s+(?:ל|ב)ה?חודש(\s+הבא)?(?=\s)/, (m) => makeDayOfMonth(+m[1], !!m[2]))
  // בעוד 3 ימים / בעוד יומיים / בעוד שבוע / בעוד שבועיים
  take(/\sבעוד\s+(?:(\d+)\s+ימים|(יומיים)|(שבועיים)|(שבוע))(?=\s)/, (m) =>
    addDays(t, m[1] ? +m[1] : m[2] ? 2 : m[3] ? 14 : 7),
  )
  // ביום שלישי / יום שלישי / בשבת – הפעם הבאה (לא היום)
  take(new RegExp(String.raw`\s(?:ב?יום\s+|ב)(${WEEKDAY_RE})(?:\s+(?:הקרוב|הבא))?(?=\s)`), (m) => {
    const target = WEEKDAY_NAMES.indexOf(m[1])
    const now = new Date().getDay()
    return addDays(t, ((target - now + 7) % 7) || 7)
  })
  take(/\s(מחרתיים)\s/, () => addDays(t, 2))
  take(/\s(מחר)\s/, () => addDays(t, 1))
  take(/\s(היום)\s/, () => t)

  const bang = title.match(/\s(!{1,3})(?=\s)/)
  if (bang) {
    priority = bang[1].length as Priority
    title = title.replace(bang[0], ' ')
  }
  title = title.replace(/\s+/g, ' ').trim().replace(FILLER, '')
  return { title: title.replace(/^[-–,:\s]+|[-–,:\s]+$/g, ''), due, priority, time, repeat }
}

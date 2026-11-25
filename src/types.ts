export type Priority = 0 | 1 | 2 | 3 // 0 = ללא, 1 = נמוכה, 2 = בינונית, 3 = גבוהה

/** חזרה: כל יום, ימי חול (א׳–ה׳), כל שבוע, כל שבועיים, כל חודש, כל שנה */
export type Repeat = 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'

export interface Subtask {
  id: string
  title: string
  done: boolean
}

export interface Task {
  id: string
  title: string
  notes: string
  due: string | null // YYYY-MM-DD
  priority: Priority
  list_id: string | null
  done: boolean
  done_at: string | null
  postponed: number // כמה ימים המשימה נדחתה (גלגול בחצות או דחייה בהחלקה)
  time: string | null // HH:MM
  remind: number | null // תזכורת: כמה דקות לפני השעה (0 = בזמן). רק כשיש שעה
  repeat: Repeat | null // משימה שחוזרת – כשמסמנים אותה כבוצעה נוצרת הבאה
  subtasks: Subtask[]
  deleted_at: string | null // זמן המחיקה – לסל המחזור (30 יום)
  created_at: string
  updated_at: string
  deleted: boolean
}

export interface TaskList {
  id: string
  name: string
  color: string
  created_at: string
  updated_at: string
  deleted: boolean
}

/** לוחות במסך "פתקים". "יום אחד" = משימות בלי תאריך; השאר = פתקים (Note) */
export type Board = 'someday' | 'shopping' | 'packages' | 'refunds' | 'hair'
export type NoteBoard = Exclude<Board, 'someday'>

/**
 * פריט בלוח פתקים. השדות משמשים לפי הלוח:
 * - shopping: title, status (0 = לקנות, 2 = נקנה)
 * - packages: title (מה), source (מאיפה), tracking, date (הגעה משוערת), status 0 הוזמנה / 1 בדרך / 2 הגיעה
 * - refunds: title (ממי), amount, date (מתי ביקשתי), status 0 ביקשתי / 1 אושר / 2 התקבל בבנק
 * - hair: title (סוג הטיפול, למשל "גוונים"), date (תאריך התור)
 */
export interface Note {
  id: string
  board: NoteBoard
  title: string
  status: number // 0..2. 2 = הסתיים
  amount: number | null
  source: string
  tracking: string
  date: string | null // YYYY-MM-DD
  notes: string
  created_at: string
  updated_at: string
  deleted: boolean
}

export type View =
  | { kind: 'today' }
  | { kind: 'upcoming' }
  | { kind: 'calendar'; date: string } // date = היום הנבחר, YYYY-MM-DD
  | { kind: 'all' }
  | { kind: 'done' }
  | { kind: 'list'; id: string }
  | { kind: 'search'; q: string }
  | { kind: 'stats' }
  | { kind: 'trash' }
  | { kind: 'notes'; board: Board | null } // null = מסך הלוחות

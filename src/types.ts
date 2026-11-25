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

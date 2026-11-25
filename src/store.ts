/**
 * מאגר נתונים מקומי-תחילה (local-first).
 * כל השינויים נשמרים מיד ב-localStorage ועובדים גם בלי רשת.
 * אם הוגדר Supabase והמשתמש מחובר – השינויים מסונכרנים ברקע (last-write-wins לפי updated_at).
 */
import { useSyncExternalStore } from 'react'
import type { RealtimeChannel, Session } from '@supabase/supabase-js'
import { addDays, diffDays, nextOccurrence, today } from './dates'
import { supabase } from './supabase'
import type { Note, NoteBoard, Priority, Repeat, Task, TaskList } from './types'

type Table = 'tasks' | 'lists' | 'notes'
type Row = Task | TaskList | Note
const TABLES: Table[] = ['lists', 'tasks', 'notes'] // רשימות קודם, כדי שמשימות שמפנות אליהן ייכנסו בלי בעיה

interface Persisted {
  tasks: Record<string, Task>
  lists: Record<string, TaskList>
  notes: Record<string, Note>
  dirty: Record<Table, string[]>
  cursor: Record<Table, string | null>
  userId: string | null
}

export type SyncStatus = 'local' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error'

export interface Snapshot {
  tasks: Task[]
  trash: Task[] // נמחקו ב-30 הימים האחרונים, החדשות למעלה
  lists: TaskList[]
  notes: Note[] // החדשים למעלה
  sync: SyncStatus
  syncError: string | null
  lastSynced: string | null
  user: { id: string; email: string } | null
}

const STORAGE_KEY = 'task-manager:v1'

/** משלים שדות שחסרים ברשומות מגרסאות ישנות / מגיבוי / מהשרת */
function normalizeTask(t: Task): Task {
  return {
    ...t,
    notes: t.notes ?? '',
    postponed: t.postponed ?? 0,
    time: t.time ?? null,
    remind: t.remind ?? null,
    repeat: t.repeat ?? null,
    subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
    deleted_at: t.deleted_at ?? (t.deleted ? t.updated_at : null),
  }
}

function normalizeNote(n: Note): Note {
  return {
    ...n,
    status: n.status ?? 0,
    amount: n.amount ?? null,
    source: n.source ?? '',
    tracking: n.tracking ?? '',
    date: n.date ?? null,
    notes: n.notes ?? '',
  }
}

const TRASH_DAYS = 30
const PURGED = '1970-01-01T00:00:00.000Z' // "נמחק לצמיתות" – מחוץ לטווח סל המחזור בכל המכשירים

function emptyData(): Persisted {
  return {
    tasks: {},
    lists: {},
    notes: {},
    dirty: { tasks: [], lists: [], notes: [] },
    cursor: { tasks: null, lists: null, notes: null },
    userId: null,
  }
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const e = emptyData()
      const p = JSON.parse(raw)
      // נתונים מגרסה ישנה: משלימים טבלאות ושדות שנוספו
      const d: Persisted = { ...e, ...p, dirty: { ...e.dirty, ...p.dirty }, cursor: { ...e.cursor, ...p.cursor } }
      for (const id of Object.keys(d.tasks)) d.tasks[id] = normalizeTask(d.tasks[id])
      for (const id of Object.keys(d.notes)) d.notes[id] = normalizeNote(d.notes[id])
      return d
    }
  } catch {
    /* נתונים פגומים – מתחילים מחדש */
  }
  return emptyData()
}

let data = load()
let sync: SyncStatus = supabase ? 'signed-out' : 'local'
let syncError: string | null = null
let lastSynced: string | null = null
let session: Session | null = null
let snapshot: Snapshot
const listeners = new Set<() => void>()

function rebuild() {
  const trashFrom = new Date(Date.now() - TRASH_DAYS * 86_400_000).toISOString()
  snapshot = {
    tasks: Object.values(data.tasks).filter((t) => !t.deleted),
    trash: Object.values(data.tasks)
      .filter((t) => t.deleted && (t.deleted_at ?? '') > trashFrom)
      .sort((a, b) => (b.deleted_at ?? '').localeCompare(a.deleted_at ?? '')),
    lists: Object.values(data.lists)
      .filter((l) => !l.deleted)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    notes: Object.values(data.notes)
      .filter((n) => !n.deleted)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    sync,
    syncError,
    lastSynced,
    user: session?.user ? { id: session.user.id, email: session.user.email ?? '' } : null,
  }
}
rebuild()

function emit() {
  rebuild()
  listeners.forEach((l) => l())
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (e) {
    console.error('שמירה מקומית נכשלה', e)
  }
}

function setSync(s: SyncStatus, err: string | null = null) {
  sync = s
  syncError = err
  emit()
}

export function useStore(): Snapshot {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => snapshot,
  )
}

// ---------- מזהים ----------

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try {
      return crypto.randomUUID()
    } catch {
      /* לא בהקשר מאובטח (http) – נופלים לגיבוי */
    }
  }
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

const now = () => new Date().toISOString()

// ---------- פעולות ----------

function commit(table: Table, row: Row) {
  store(table)[row.id] = row
  if (!data.dirty[table].includes(row.id)) data.dirty[table].push(row.id)
  save()
  emit()
  scheduleSync()
}

export function addTask(input: {
  title: string
  due?: string | null
  list_id?: string | null
  priority?: Priority
  time?: string | null
  repeat?: Repeat | null
}): Task {
  const t: Task = {
    id: uid(),
    title: input.title.trim(),
    notes: '',
    due: input.due ?? null,
    priority: input.priority ?? 0,
    list_id: input.list_id ?? null,
    done: false,
    done_at: null,
    postponed: 0,
    time: input.time ?? null,
    remind: null,
    repeat: input.repeat ?? null,
    subtasks: [],
    created_at: now(),
    updated_at: now(),
    deleted: false,
    deleted_at: null,
  }
  commit('tasks', t)
  return t
}

export function updateTask(id: string, patch: Partial<Omit<Task, 'id' | 'created_at'>>) {
  const t = data.tasks[id]
  if (!t) return
  commit('tasks', { ...t, ...patch, updated_at: now() })
}

/**
 * סימון כבוצעה / ביטול הסימון. מחזיר פונקציית ביטול.
 * משימה חוזרת: כשמסמנים אותה נוצרת המשימה הבאה בסדרה (והחזרה עוברת אליה).
 */
export function toggleTask(id: string): () => void {
  const t = data.tasks[id]
  if (!t) return () => {}
  if (t.done) {
    updateTask(id, { done: false, done_at: null })
    return () => updateTask(id, { done: true, done_at: t.done_at })
  }
  updateTask(id, { done: true, done_at: now() })
  if (!t.repeat) return () => updateTask(id, { done: false, done_at: null })

  const next = addTask({
    title: t.title,
    due: nextOccurrence(t.due ?? today(), t.repeat),
    priority: t.priority,
    list_id: t.list_id,
    time: t.time,
    repeat: t.repeat,
  })
  updateTask(next.id, { notes: t.notes, remind: t.remind, subtasks: t.subtasks.map((s) => ({ ...s, id: uid(), done: false })) })
  updateTask(id, { repeat: null }) // הסדרה ממשיכה מהמשימה החדשה
  return () => {
    purgeTask(next.id) // ביטול – לא לסל המחזור
    updateTask(id, { done: false, done_at: null, repeat: t.repeat })
  }
}

/** דחייה ידנית (החלקה): מעבירה את המשימה ביום אחד קדימה ומוסיפה יום למונה הדחיות. מחזיר ביטול */
export function postponeTask(id: string): () => void {
  const t = data.tasks[id]
  if (!t) return () => {}
  const base = t.due && t.due > today() ? t.due : today()
  updateTask(id, { due: addDays(base, 1), postponed: t.postponed + 1 })
  return () => updateTask(id, { due: t.due, postponed: t.postponed })
}

/** מחיקה רכה – המשימה עוברת לסל המחזור ל-30 יום */
export function deleteTask(id: string) {
  updateTask(id, { deleted: true, deleted_at: now() })
}

export function restoreTask(id: string) {
  updateTask(id, { deleted: false, deleted_at: null })
}

/** מחיקה לצמיתות מסל המחזור */
export function purgeTask(id: string) {
  updateTask(id, { deleted: true, deleted_at: PURGED })
}

export function emptyTrash() {
  for (const t of snapshot.trash) purgeTask(t.id)
}

export function clearCompleted() {
  for (const t of Object.values(data.tasks)) if (t.done && !t.deleted) deleteTask(t.id)
}

export const LIST_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#9333ea', '#0891b2', '#db2777', '#4b5563']

export function addList(name: string, color?: string): TaskList {
  const used = Object.values(data.lists).filter((l) => !l.deleted).length
  const l: TaskList = {
    id: uid(),
    name: name.trim(),
    color: color ?? LIST_COLORS[used % LIST_COLORS.length],
    created_at: now(),
    updated_at: now(),
    deleted: false,
  }
  commit('lists', l)
  return l
}

export function updateList(id: string, patch: Partial<Pick<TaskList, 'name' | 'color'>>) {
  const l = data.lists[id]
  if (!l) return
  commit('lists', { ...l, ...patch, updated_at: now() })
}

/** מחיקת רשימה – המשימות שלה עוברות ל"ללא רשימה" */
export function deleteList(id: string) {
  const l = data.lists[id]
  if (!l) return
  for (const t of Object.values(data.tasks)) if (t.list_id === id && !t.deleted) updateTask(t.id, { list_id: null })
  commit('lists', { ...l, deleted: true, updated_at: now() })
}

/**
 * שכפול משימה לסדרה: count משימות בסך הכול (כולל המקורית), כל everyDays ימים, החל מתאריך המשימה (או היום).
 * עם numbered: "לקחת כדור 1", "לקחת כדור 2"... – גם המקורית מקבלת את המספר 1.
 * מחזיר פונקציית ביטול.
 */
export function duplicateTask(id: string, count: number, opts: { everyDays: number; numbered: boolean }): () => void {
  const orig = data.tasks[id]
  if (!orig || count < 2) return () => {}
  const start = orig.due ?? today()
  const base = orig.title.trim()
  const before = { title: orig.title, due: orig.due }
  updateTask(id, { title: opts.numbered ? `${base} 1` : base, due: start })
  const created: string[] = []
  for (let i = 2; i <= count; i++) {
    const copy = addTask({
      title: opts.numbered ? `${base} ${i}` : base,
      due: addDays(start, (i - 1) * opts.everyDays),
      priority: orig.priority,
      list_id: orig.list_id,
      time: orig.time,
    })
    updateTask(copy.id, { notes: orig.notes, remind: orig.remind, subtasks: orig.subtasks.map((s) => ({ ...s, id: uid(), done: false })) })
    created.push(copy.id)
  }
  return () => {
    for (const c of created) purgeTask(c) // ביטול – לא לסל המחזור
    updateTask(id, before)
  }
}

// ---------- פתקים ----------

export function addNote(board: NoteBoard, fields: Partial<Omit<Note, 'id' | 'board' | 'created_at' | 'updated_at' | 'deleted'>>): Note {
  const n: Note = normalizeNote({
    id: uid(),
    board,
    title: (fields.title ?? '').trim(),
    status: fields.status ?? 0,
    amount: fields.amount ?? null,
    source: fields.source ?? '',
    tracking: fields.tracking ?? '',
    date: fields.date ?? null,
    notes: fields.notes ?? '',
    created_at: now(),
    updated_at: now(),
    deleted: false,
  })
  commit('notes', n)
  return n
}

export function updateNote(id: string, patch: Partial<Omit<Note, 'id' | 'board' | 'created_at'>>) {
  const n = data.notes[id]
  if (!n) return
  commit('notes', { ...n, ...patch, updated_at: now() })
}

export function deleteNote(id: string) {
  updateNote(id, { deleted: true })
}

export function restoreNote(id: string) {
  updateNote(id, { deleted: false })
}

// ---------- גיבוי ----------

export function exportJSON(): string {
  return JSON.stringify(
    { app: 'task-manager', version: 1, exported_at: now(), tasks: snapshot.tasks, lists: snapshot.lists, notes: snapshot.notes },
    null,
    2,
  )
}

export function importJSON(text: string): number {
  const parsed = JSON.parse(text)
  if (!Array.isArray(parsed?.tasks) || !Array.isArray(parsed?.lists)) throw new Error('קובץ גיבוי לא תקין')
  let n = 0
  for (const l of parsed.lists as TaskList[]) {
    if (!l?.id || typeof l.name !== 'string') continue
    data.lists[l.id] = { ...l, updated_at: now() }
    if (!data.dirty.lists.includes(l.id)) data.dirty.lists.push(l.id)
  }
  for (const t of parsed.tasks as Task[]) {
    if (!t?.id || typeof t.title !== 'string') continue
    data.tasks[t.id] = normalizeTask({ ...t, updated_at: now() })
    if (!data.dirty.tasks.includes(t.id)) data.dirty.tasks.push(t.id)
    n++
  }
  for (const note of (Array.isArray(parsed.notes) ? parsed.notes : []) as Note[]) {
    if (!note?.id || typeof note.title !== 'string' || !note.board) continue
    data.notes[note.id] = normalizeNote({ ...note, updated_at: now() })
    if (!data.dirty.notes.includes(note.id)) data.dirty.notes.push(note.id)
    n++
  }
  save()
  emit()
  scheduleSync()
  return n
}

// ---------- גלגול משימות בחצות ----------

let lastDay = today()

/**
 * משימה פתוחה שתאריך היעד שלה עבר עוברת להיום, ומונה הדחיות שלה גדל במספר הימים שעברו.
 * רץ בטעינה, בחצות, כשחוזרים לאפליקציה ואחרי כל סנכרון.
 */
export function rollover() {
  const t = today()
  let changed = false
  for (const task of Object.values(data.tasks)) {
    if (task.done || task.deleted || !task.due || task.due >= t) continue
    data.tasks[task.id] = { ...task, due: t, postponed: (task.postponed ?? 0) + diffDays(task.due, t), updated_at: now() }
    if (!data.dirty.tasks.includes(task.id)) data.dirty.tasks.push(task.id)
    changed = true
  }
  const dayChanged = t !== lastDay
  lastDay = t
  if (changed) {
    save()
    scheduleSync()
  }
  if (changed || dayChanged) emit() // גם בלי שינוי – כדי ש"היום" במסך יתעדכן
}

function scheduleMidnight() {
  const n = new Date()
  const next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 5)
  setTimeout(() => {
    rollover()
    scheduleMidnight()
  }, next.getTime() - n.getTime())
}

// ---------- סנכרון ----------

const COLUMNS: Record<Table, string[]> = {
  tasks: [
    'id', 'title', 'notes', 'due', 'priority', 'list_id', 'done', 'done_at', 'postponed',
    'time', 'remind', 'repeat', 'subtasks', 'created_at', 'updated_at', 'deleted', 'deleted_at',
  ],
  lists: ['id', 'name', 'color', 'created_at', 'updated_at', 'deleted'],
  notes: ['id', 'board', 'title', 'status', 'amount', 'source', 'tracking', 'date', 'notes', 'created_at', 'updated_at', 'deleted'],
}

function pick(row: Record<string, unknown>, table: Table): Row {
  const out: Record<string, unknown> = {}
  for (const c of COLUMNS[table]) out[c] = row[c]
  if (table === 'tasks') return normalizeTask(out as unknown as Task)
  if (table === 'notes') return normalizeNote(out as unknown as Note)
  return out as unknown as Row
}

function store(table: Table): Record<string, Row> {
  return (table === 'tasks' ? data.tasks : table === 'lists' ? data.lists : data.notes) as Record<string, Row>
}

async function push(table: Table, userId: string) {
  const ids = [...data.dirty[table]]
  if (!ids.length || !supabase) return
  const rows = ids.map((id) => store(table)[id]).filter(Boolean)
  const sent = new Map(rows.map((r) => [r.id, r.updated_at]))
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ ...pick(r as never, table), user_id: userId }))
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'id' })
    if (error) throw error
  }
  // מסירים מהתור רק רשומות שלא השתנו בזמן השליחה
  data.dirty[table] = data.dirty[table].filter((id) => store(table)[id]?.updated_at !== sent.get(id))
  save()
}

async function pull(table: Table) {
  if (!supabase) return
  const PAGE = 1000
  for (;;) {
    let q = supabase.from(table).select('*').order('server_updated_at', { ascending: true }).limit(PAGE)
    const cursor = data.cursor[table]
    if (cursor) q = q.gte('server_updated_at', cursor)
    const { data: rows, error } = await q
    if (error) throw error
    if (!rows?.length) break
    const local = store(table)
    const dirty = new Set(data.dirty[table])
    for (const r of rows) {
      const mine = local[r.id]
      if (mine && dirty.has(r.id) && mine.updated_at > r.updated_at) continue // השינוי המקומי חדש יותר
      local[r.id] = pick(r, table)
      if (mine && dirty.has(r.id) && mine.updated_at <= r.updated_at) {
        data.dirty[table] = data.dirty[table].filter((x) => x !== r.id)
      }
    }
    const last = rows[rows.length - 1].server_updated_at as string
    const advanced = last !== cursor
    data.cursor[table] = last
    if (rows.length < PAGE || !advanced) break
  }
  save()
}

let syncing = false
let again = false
let timer: ReturnType<typeof setTimeout> | undefined

export async function syncNow() {
  const userId = session?.user?.id
  if (!supabase || !userId) return
  if (syncing) {
    again = true
    return
  }
  if (!navigator.onLine) {
    setSync('offline')
    return
  }
  syncing = true
  setSync('syncing')
  try {
    for (const t of TABLES) await push(t, userId)
    for (const t of TABLES) await pull(t)
    rollover() // משימות שהגיעו ממכשיר שעוד לא גלגל אותן
    lastSynced = now()
    setSync('synced')
  } catch (e) {
    console.error('סנכרון נכשל', e)
    setSync(navigator.onLine ? 'error' : 'offline', e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e))
  } finally {
    syncing = false
    if (again) {
      again = false
      void syncNow()
    }
  }
}

function scheduleSync(delay = 700) {
  if (!supabase || !session) return
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), delay)
}

let channel: RealtimeChannel | null = null

function subscribeRealtime(userId: string) {
  if (!supabase) return
  channel?.unsubscribe()
  channel = supabase
    .channel(`user-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${userId}` }, () => scheduleSync(300))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lists', filter: `user_id=eq.${userId}` }, () => scheduleSync(300))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${userId}` }, () => scheduleSync(300))
    .subscribe()
}

function onSession(s: Session | null) {
  const prevUser = session?.user?.id ?? null
  session = s
  const userId = s?.user?.id ?? null
  if (userId && data.userId && data.userId !== userId) {
    // משתמש אחר התחבר במכשיר הזה – לא מערבבים נתונים
    data = emptyData()
  }
  if (userId) {
    // נתונים מקומיים שנוצרו לפני ההתחברות נשארים בתור ויועלו לחשבון
    data.userId = userId
    save()
    if (userId !== prevUser) {
      subscribeRealtime(userId)
      void syncNow()
    }
    emit()
  } else {
    channel?.unsubscribe()
    channel = null
    setSync('signed-out')
  }
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('הסנכרון לא הוגדר')
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(translateAuthError(error.message))
}

export async function signUp(email: string, password: string): Promise<'signed-in' | 'confirm-email'> {
  if (!supabase) throw new Error('הסנכרון לא הוגדר')
  const { data: res, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: location.origin + import.meta.env.BASE_URL },
  })
  if (error) throw new Error(translateAuthError(error.message))
  return res.session ? 'signed-in' : 'confirm-email'
}

/** התנתקות – מוחקת את הנתונים מהמכשיר הזה (הם נשמרים בענן) */
export async function signOut() {
  if (!supabase) return
  await syncNow()
  await supabase.auth.signOut()
  data = emptyData()
  save()
  emit()
}

function translateAuthError(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'דוא"ל או סיסמה שגויים'
  if (/email not confirmed/i.test(msg)) return 'צריך לאשר את כתובת הדוא"ל (בדקו את תיבת הדואר)'
  if (/already registered/i.test(msg)) return 'כתובת הדוא"ל כבר רשומה – נסו להתחבר'
  if (/at least 6 characters/i.test(msg)) return 'הסיסמה צריכה להכיל לפחות 6 תווים'
  if (/rate limit/i.test(msg)) return 'יותר מדי ניסיונות, נסו שוב בעוד כמה דקות'
  return msg
}

// ---------- אתחול ----------

if (supabase) {
  supabase.auth.getSession().then(({ data: d }) => onSession(d.session))
  supabase.auth.onAuthStateChange((_event, s) => {
    if ((s?.user?.id ?? null) !== (session?.user?.id ?? null)) onSession(s)
    else session = s
  })
  window.addEventListener('online', () => void syncNow())
  window.addEventListener('offline', () => session && setSync('offline'))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(100)
  })
  setInterval(() => document.visibilityState === 'visible' && void syncNow(), 60_000)
}

rollover()
scheduleMidnight()
// טלפונים מקפיאים טיימרים ברקע – בודקים שוב כשחוזרים לאפליקציה
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && rollover())

// סנכרון בין לשוניות פתוחות באותו דפדפן
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) {
    data = load()
    emit()
  }
})

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Settings, SYNC_LABEL } from './components/Settings'
import { TaskEditor } from './components/TaskEditor'
import { TaskItem } from './components/TaskItem'
import { Calendar } from './components/Calendar'
import { Composer } from './components/Composer'
import { StatsView } from './components/StatsView'
import { TrashView } from './components/TrashView'
import { NoteBoardView, NoteEditor, NotesHome } from './components/NotesView'
import { boardMeta, isBoard } from './notes'
import { breakDays } from './pills'
import { hebrewDate, hebrewDateFull, holidayOn } from './holidays'
import { checkReminders } from './reminders'
import { toDateLabel, useDateDrag } from './components/useDateDrag'
import { fullDateLabel, nextOccurrence, today } from './dates'
import { ChartIcon, CheckCircleIcon, ChevronIcon, CloudIcon, GridCalendarIcon, MenuIcon, NoteIcon, PlusIcon, SearchIcon, SettingsIcon, SunIcon, TrashIcon, XIcon } from './icons'
import { counts, dayMarks, sectionsFor, viewTitle } from './logic'
import { addList, deleteList, deleteNote, deleteTask, postponeTask, restoreNote, restoreTask, LIST_COLORS, toggleTask, updateList, updateTask, useStore, type SyncStatus } from './store'
import { supabase } from './supabase'
import type { Note, NoteBoard, Task, View } from './types'

// ---------- ניתוב לפי hash (עובד גם ב-GitHub Pages) ----------

function parseHash(): View {
  const h = location.hash.replace(/^#\/?/, '')
  if (h.startsWith('list/')) return { kind: 'list', id: decodeURIComponent(h.slice(5)) }
  if (h === 'notes' || h.startsWith('notes/')) {
    const b = h.slice(6)
    return { kind: 'notes', board: isBoard(b) ? b : null }
  }
  if (h === 'calendar' || h.startsWith('calendar/')) {
    const d = h.slice(9)
    return { kind: 'calendar', date: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today() }
  }
  if (h === 'today' || h === 'upcoming' || h === 'all' || h === 'done' || h === 'stats' || h === 'trash') return { kind: h }
  // ברירת המחדל: לוח שנה על היום
  return { kind: 'calendar', date: today() }
}

function viewHash(v: View): string {
  if (v.kind === 'list') return `#/list/${encodeURIComponent(v.id)}`
  if (v.kind === 'calendar') return `#/calendar/${v.date}`
  if (v.kind === 'notes') return v.board ? `#/notes/${v.board}` : '#/notes'
  return `#/${v.kind}`
}

/** "יום ראשון, 14 בדצמבר · חנוכה" – לכותרות הקבוצות במסך "בקרוב" */
function dateWithHoliday(iso: string): string {
  const h = holidayOn(iso)
  return h ? `${fullDateLabel(iso)} · ${h}` : fullDateLabel(iso)
}

// ---------- התקנת PWA ----------

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function useInstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null)
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setEvt(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])
  const install = useCallback(async () => {
    if (!evt) return
    await evt.prompt()
    await evt.userChoice
    setEvt(null)
  }, [evt])
  return { canInstall: !!evt, install }
}

// ---------- הודעות קופצות ----------

interface ToastMsg {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

function useToasts() {
  const [toast, setToast] = useState<ToastMsg | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const show = useCallback((text: string, action?: ToastMsg['action']) => {
    clearTimeout(timer.current)
    setToast({ id: Date.now(), text, action })
    timer.current = setTimeout(() => setToast(null), action ? 3000 : 1800)
  }, [])
  const dismiss = useCallback(() => setToast(null), [])
  return { toast, show, dismiss }
}

// ---------- האפליקציה ----------

export default function App() {
  const { tasks, trash, lists, notes, prefs, sync, user } = useStore()
  const [view, setViewState] = useState<View>(parseHash)
  const [query, setQuery] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [composing, setComposing] = useState(false)
  // עריכת פתק: note = null → פריט חדש
  const [noteEdit, setNoteEdit] = useState<{ board: NoteBoard; note: Note | null; preset?: Partial<Note> } | null>(null)
  const [drawer, setDrawer] = useState(false)
  const { canInstall, install } = useInstallPrompt()
  const { toast, show, dismiss } = useToasts()

  useEffect(() => {
    const onHash = () => setViewState(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = useCallback((v: View) => {
    setQuery(null)
    setDrawer(false)
    if (location.hash !== viewHash(v)) location.hash = viewHash(v)
    setViewState(v)
  }, [])

  // רשימה שנמחקה (גם ממכשיר אחר) – חוזרים ל"היום"
  const listMissing = view.kind === 'list' && !lists.some((l) => l.id === view.id)
  useEffect(() => {
    if (listMissing) go({ kind: 'calendar', date: today() })
  }, [listMissing, go])

  const active: View = useMemo(() => (query !== null ? { kind: 'search', q: query } : view), [query, view])
  const sections = useMemo(() => sectionsFor(active, tasks, dateWithHoliday), [active, tasks])

  // תזכורות: בדיקה כל 30 שניות, וגם מיד כשמשימות משתנות
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks
  useEffect(() => checkReminders(tasks), [tasks])
  useEffect(() => {
    const id = setInterval(() => checkReminders(tasksRef.current), 30_000)
    return () => clearInterval(id)
  }, [])
  const c = useMemo(() => counts(tasks), [tasks])
  const marks = useMemo(() => dayMarks(tasks), [tasks])
  const breaks = useMemo(() => breakDays(notes), [notes])

  // בחירת יום בלוח השנה מחליפה את הכתובת בלי להוסיף צעד להיסטוריה
  const selectDay = useCallback((date: string) => {
    const v: View = { kind: 'calendar', date }
    history.replaceState(history.state, '', viewHash(v))
    setViewState(v)
  }, [])
  const listById = useMemo(() => Object.fromEntries(lists.map((l) => [l.id, l])), [lists])
  const title = viewTitle(active, lists)

  useEffect(() => {
    document.title = `${title} · משימות`
  }, [title])

  const onToggle = (t: Task) => {
    const undo = toggleTask(t.id)
    if (t.done) return
    const msg = t.repeat ? `הושלמה · הבאה ${toDateLabel(nextOccurrence(t.due ?? today(), t.repeat))}` : 'המשימה הושלמה'
    show(msg, { label: 'ביטול', run: undo })
  }

  const onPostpone = (t: Task) => {
    const undo = postponeTask(t.id)
    show('נדחתה ליום הבא', { label: 'ביטול', run: undo })
  }

  const onDeleted = useCallback(
    (t: Task) => show('המשימה עברה לסל המחזור', { label: 'ביטול', run: () => restoreTask(t.id) }),
    [show],
  )
  /** מחיקה בהחלקה ימינה (בכל המסכים) – לסל המחזור, עם ביטול */
  const onSwipeDelete = (t: Task) => {
    deleteTask(t.id)
    onDeleted(t)
  }
  // גרירת משימה לתאריך אחר (בלוח השנה ובמסך "בקרוב")
  const dnd = useDateDrag((task, date) => {
    const prev = task.due
    updateTask(task.id, { due: date })
    show(`הועברה ${toDateLabel(date)}`, { label: 'ביטול', run: () => updateTask(task.id, { due: prev }) })
  })
  const canDrag = active.kind === 'calendar' || active.kind === 'upcoming'

  const onNoteDeleted = (n: Note) => show('הפריט נמחק', { label: 'ביטול', run: () => restoreNote(n.id) })
  const noteBoard: NoteBoard | null = active.kind === 'notes' && active.board && active.board !== 'someday' ? active.board : null

  const closeEditor = useCallback(() => setEditing(null), [])
  const closeSettings = useCallback(() => setSettingsOpen(false), [])
  const openSettings = () => {
    setDrawer(false)
    setSettingsOpen(true)
  }

  const sidebar = (
    <nav className="nav" aria-label="ניווט">
      <div className="brand">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={28} height={28} />
        <span>משימות</span>
      </div>
      <NavItem icon={<GridCalendarIcon />} label="לוח שנה" active={active.kind === 'calendar'} onClick={() => go({ kind: 'calendar', date: today() })} />
      <NavItem icon={<SunIcon />} label="היום" count={c.today} danger={c.overdue > 0} active={active.kind === 'today'} onClick={() => go({ kind: 'today' })} />
      <NavItem icon={<NoteIcon />} label="פתקים" active={active.kind === 'notes'} onClick={() => go({ kind: 'notes', board: null })} />
      <NavItem icon={<ChartIcon />} label="סיכום" active={active.kind === 'stats'} onClick={() => go({ kind: 'stats' })} />
      <NavItem icon={<CheckCircleIcon />} label="הושלמו" active={active.kind === 'done'} onClick={() => go({ kind: 'done' })} />

      <div className="nav-head">רשימות</div>
      {lists.map((l) => (
        <NavItem
          key={l.id}
          icon={<i className="dot" style={{ background: l.color }} />}
          label={l.name}
          count={c.byList[l.id]}
          active={active.kind === 'list' && active.id === l.id}
          onClick={() => go({ kind: 'list', id: l.id })}
        />
      ))}
      <button
        className="nav-item add"
        onClick={() => {
          const name = prompt('שם הרשימה החדשה')?.trim()
          if (name) go({ kind: 'list', id: addList(name).id })
        }}
      >
        <span className="nav-icon">
          <PlusIcon width={18} height={18} />
        </span>
        <span className="nav-label">רשימה חדשה</span>
      </button>

      <div className="nav-foot">
        <NavItem icon={<TrashIcon width={18} height={18} />} label="סל מחזור" count={trash.length} active={active.kind === 'trash'} onClick={() => go({ kind: 'trash' })} />
        <button className="nav-item" onClick={openSettings}>
          <span className="nav-icon">
            <SettingsIcon width={18} height={18} />
          </span>
          <span className="nav-label">הגדרות</span>
        </button>
        <SyncBadge status={sync} signedIn={!!user} onClick={openSettings} />
      </div>
    </nav>
  )

  return (
    <div className="app">
      <aside className="sidebar">{sidebar}</aside>

      {drawer && (
        <div className="drawer-backdrop" onClick={() => setDrawer(false)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="main">
        <header className="topbar">
          {query === null ? (
            <>
              <button className="icon-btn mobile-only" onClick={() => setDrawer(true)} aria-label="תפריט">
                <MenuIcon />
              </button>
              {active.kind === 'notes' && active.board && (
                <button className="icon-btn" onClick={() => go({ kind: 'notes', board: null })} aria-label="חזרה לפתקים">
                  <ChevronIcon className="flip" />
                </button>
              )}
              <div className="titles">
                <h1>
                  {active.kind === 'notes' && active.board && <span aria-hidden="true">{boardMeta(active.board).emoji}</span>}
                  {active.kind === 'list' && <i className="dot big" style={{ background: listById[active.id]?.color }} />}
                  {title}
                </h1>
                {active.kind === 'today' && (
                  <span className="subtitle">
                    {fullDateLabel(today()).replace('היום · ', '')} · {hebrewDate(today())}
                    {holidayOn(today()) && <span className="holiday-chip">{holidayOn(today())}</span>}
                  </span>
                )}
              </div>
              <span className="spacer" />
              {active.kind === 'list' && listById[active.id] && <ListMenu id={active.id} name={title} color={listById[active.id].color} />}
              <button className="icon-btn" onClick={() => setQuery('')} aria-label="חיפוש">
                <SearchIcon />
              </button>
              <button className="icon-btn mobile-only" onClick={openSettings} aria-label="הגדרות">
                <SettingsIcon />
              </button>
            </>
          ) : (
            <div className="search">
              <SearchIcon width={18} height={18} className="muted" />
              <input
                autoFocus
                type="search"
                placeholder="חיפוש משימות…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setQuery(null)}
              />
              <button className="icon-btn" onClick={() => setQuery(null)} aria-label="סגירת חיפוש">
                <XIcon />
              </button>
            </div>
          )}
        </header>

        <div className="content">
          {active.kind === 'calendar' && (
            <>
              <Calendar selected={active.date} marks={marks} onSelect={selectDay} dropOver={dnd.over} breaks={breaks} />
              <h2 className="day-title">
                {fullDateLabel(active.date)}
                <span className="heb-date">{hebrewDateFull(active.date)}</span>
                {holidayOn(active.date) && <span className="holiday-chip">{holidayOn(active.date)}</span>}
                {breaks.has(active.date) && (
                  <span className="holiday-chip pill-chip">
                    הפסקה · יום {breaks.get(active.date)!.day} מתוך {breaks.get(active.date)!.length}
                  </span>
                )}
              </h2>
            </>
          )}

          {active.kind === 'stats' ? (
            <StatsView tasks={tasks} onOpen={(x) => setEditing(x.id)} />
          ) : active.kind === 'trash' ? (
            <TrashView trash={trash} toast={(m) => show(m)} />
          ) : active.kind === 'notes' && !active.board ? (
            <NotesHome tasks={tasks} notes={notes} prefs={prefs} onOpen={(b) => go({ kind: 'notes', board: b })} />
          ) : noteBoard ? (
            <NoteBoardView
              board={noteBoard}
              notes={notes}
              prefs={prefs}
              onEdit={(n) => setNoteEdit({ board: noteBoard, note: n })}
              onAdd={(preset) => setNoteEdit({ board: noteBoard, note: null, preset })}
              onDelete={(n) => {
                deleteNote(n.id)
                onNoteDeleted(n)
              }}
              toast={(m) => show(m)}
            />
          ) : sections.every((s) => !s.tasks.length) ? (
            <Empty view={active} />
          ) : (
            sections.map((s) => (
              <TaskSection key={s.key} title={s.title} tone={s.tone} count={s.tasks.length} collapsible={s.collapsible} date={s.date} dropOver={!!s.date && s.date === dnd.over}>
                <ul className="tasks">
                  {s.tasks.map((t) => (
                    <TaskItem
                      key={t.id}
                      task={t}
                      list={t.list_id ? listById[t.list_id] : undefined}
                      showList={active.kind !== 'list'}
                      hideToday={active.kind === 'today'}
                      hideDue={active.kind === 'calendar'}
                      dragProps={canDrag && !t.done ? dnd.bind(t) : undefined}
                      dragging={dnd.dragging === t.id}
                      onToggle={onToggle}
                      onPostpone={onPostpone}
                      swipeRight="delete"
                      onDelete={onSwipeDelete}
                      onOpen={(x) => setEditing(x.id)}
                    />
                  ))}
                </ul>
              </TaskSection>
            ))
          )}
        </div>
      </main>

      <nav className="bottombar" aria-label="ניווט מהיר">
        <TabBtn icon={<GridCalendarIcon />} label="לוח שנה" active={active.kind === 'calendar'} onClick={() => go({ kind: 'calendar', date: today() })} />
        <TabBtn icon={<SunIcon />} label="היום" badge={c.today} danger={c.overdue > 0} active={active.kind === 'today'} onClick={() => go({ kind: 'today' })} />
        <TabBtn icon={<NoteIcon />} label="פתקים" active={active.kind === 'notes'} onClick={() => go({ kind: 'notes', board: null })} />
        <TabBtn icon={<ChartIcon />} label="סיכום" active={active.kind === 'stats'} onClick={() => go({ kind: 'stats' })} />
        <TabBtn icon={<MenuIcon />} label="רשימות" active={active.kind === 'list' || active.kind === 'done'} onClick={() => setDrawer(true)} />
      </nav>

      {!['done', 'search', 'stats', 'trash'].includes(active.kind) && !(active.kind === 'notes' && !active.board) && !composing && !noteEdit && (
        <button
          className="fab"
          onClick={() => (noteBoard ? setNoteEdit({ board: noteBoard, note: null }) : setComposing(true))}
          aria-label={noteBoard === 'pills' ? 'התחלתי חפיסה' : noteBoard ? 'פריט חדש' : 'משימה חדשה'}
        >
          <PlusIcon width={26} height={26} strokeWidth={2.5} />
        </button>
      )}
      {dnd.ghost}
      {composing && <Composer view={active} lists={lists} onClose={() => setComposing(false)} />}

      {noteEdit && (
        <NoteEditor board={noteEdit.board} note={noteEdit.note} preset={noteEdit.preset} notes={notes} onClose={() => setNoteEdit(null)} onDeleted={onNoteDeleted} />
      )}
      {editing && (
        <TaskEditor
          taskId={editing}
          onClose={closeEditor}
          onDeleted={onDeleted}
          onDuplicated={(n, undo) => show(`נוצרו ${n} משימות`, { label: 'ביטול', run: undo })}
        />
      )}
      {settingsOpen && (
        <Settings onClose={closeSettings} canInstall={canInstall} onInstall={install} toast={(m) => show(m)} />
      )}

      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <span>{toast.text}</span>
          {toast.action && (
            <button
              onClick={() => {
                toast.action!.run()
                dismiss()
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- רכיבים קטנים ----------

interface NavItemProps {
  icon: ReactNode
  label: string
  count?: number
  active: boolean
  danger?: boolean
  onClick: () => void
}

function NavItem({ icon, label, count, active, danger, onClick }: NavItemProps) {
  return (
    <button className={`nav-item${active ? ' active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}>
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
      {!!count && <span className={`count${danger ? ' danger' : ''}`}>{count}</span>}
    </button>
  )
}

interface TabBtnProps {
  icon: ReactNode
  label: string
  badge?: number
  danger?: boolean
  active: boolean
  onClick: () => void
}

function TabBtn({ icon, label, badge, danger, active, onClick }: TabBtnProps) {
  return (
    <button className={`tab${active ? ' active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}>
      <span className="tab-icon">
        {icon}
        {!!badge && <span className={`badge${danger ? ' danger' : ''}`}>{badge > 99 ? '99+' : badge}</span>}
      </span>
      <span>{label}</span>
    </button>
  )
}

function SyncBadge({ status, signedIn, onClick }: { status: SyncStatus; signedIn: boolean; onClick: () => void }) {
  if (!supabase) return null
  return (
    <button className={`sync-badge s-${status}`} onClick={onClick} title={SYNC_LABEL[status]}>
      <CloudIcon width={16} height={16} />
      <span>{signedIn ? SYNC_LABEL[status] : 'התחברו לסנכרון'}</span>
    </button>
  )
}

interface SectionProps {
  date?: string
  dropOver?: boolean
  title?: string
  tone?: 'danger'
  count: number
  collapsible?: boolean
  children: ReactNode
}

function TaskSection({ date, dropOver, title, tone, count, collapsible, children }: SectionProps) {
  const [open, setOpen] = useState(!collapsible)
  const cls = `section${dropOver ? ' drop-over' : ''}`
  if (!title) return <section className={cls} data-date={date}>{children}</section>
  return (
    <section className={cls} data-date={date}>
      <h2 className={`section-title${tone ? ` ${tone}` : ''}`}>
        {collapsible ? (
          <button className="collapse" onClick={() => setOpen(!open)} aria-expanded={open}>
            <ChevronIcon width={16} height={16} className={open ? 'rot' : ''} />
            {title} <span className="muted">{count}</span>
          </button>
        ) : (
          <>
            {title} <span className="muted">{count}</span>
          </>
        )}
      </h2>
      {open && children}
    </section>
  )
}

function ListMenu({ id, name, color }: { id: string; name: string; color: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="menu-wrap">
      <button className="icon-btn" onClick={() => setOpen(!open)} aria-label="אפשרויות רשימה" aria-expanded={open}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="menu" role="menu">
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false)
                const n = prompt('שם חדש לרשימה', name)?.trim()
                if (n) updateList(id, { name: n })
              }}
            >
              שינוי שם
            </button>
            <div className="menu-colors">
              {LIST_COLORS.map((col) => (
                <button
                  key={col}
                  aria-label="בחירת צבע"
                  className={col === color ? 'on' : ''}
                  style={{ background: col }}
                  onClick={() => updateList(id, { color: col })}
                />
              ))}
            </div>
            <button
              role="menuitem"
              className="danger"
              onClick={() => {
                setOpen(false)
                if (confirm(`למחוק את הרשימה "${name}"? המשימות שבה יישארו ויעברו ל"ללא רשימה".`)) deleteList(id)
              }}
            >
              מחיקת רשימה
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Empty({ view }: { view: View }) {
  const text: Record<View['kind'], [string, string]> = {
    today: ['אין משימות להיום', 'יום פנוי! לחצו על + כדי להוסיף משימה.'],
    upcoming: ['אין משימות מתוכננות', 'משימות עם תאריך עתידי יופיעו כאן.'],
    calendar: ['אין משימות ביום הזה', 'לחצו על + כדי להוסיף משימה לתאריך הזה.'],
    all: ['אין משימות פתוחות', 'לחצו על + כדי להוסיף משימה.'],
    done: ['עוד לא הושלמו משימות', 'משימות שתסמנו כבוצעו יופיעו כאן.'],
    list: ['הרשימה ריקה', 'לחצו על + כדי להוסיף את המשימה הראשונה.'],
    search: ['לא נמצאו משימות', 'נסו מילת חיפוש אחרת.'],
    stats: ['', ''],
    trash: ['', ''],
    notes: ['אין רעיונות כרגע', 'דברים שרוצים לעשות "מתישהו", בלי תאריך. כשמחליטים על יום – נותנים תאריך והמשימה עוברת ללוח השנה.'],
  }
  const [h, p] = view.kind === 'search' && !view.q.trim() ? ['חיפוש', 'הקלידו כדי לחפש בכותרות ובהערות.'] : text[view.kind]
  return (
    <div className="empty">
      <CheckCircleIcon width={48} height={48} />
      <h3>{h}</h3>
      <p>{p}</p>
    </div>
  )
}

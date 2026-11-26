import { useState, type FormEvent, type ReactNode } from 'react'
import { addMonths, fullDateLabel, today } from '../dates'
import { BellIcon, CalendarIcon, ChevronIcon, CopyIcon, SettingsIcon, TrashIcon } from '../icons'
import { ARCHIVE_OPTIONS, CAR_LEAD_OPTIONS, CAR_TYPES, archiveDays, archived, carStatus, expiryLabel, giftcardTotal, BOARDS, LEAD_OPTIONS, agoLabel, bookingStatus, everyMonthsLabel, prefKey, treatmentTypes, type BookingPrefs, boardMeta, formatMoney, isTreatment, lastTreatment, notesOf, pendingRefunds, shortDateLabel, upcomingTreatments, waitingLabel, type TreatmentBoard } from '../notes'
import { addNote, connectPack, deleteNote, disconnectPack, setArchiveDays, setBookingInterval, setBookingLead, setCarLead, updateNote } from '../store'
import { BREAK_DAYS, MAX_CHAIN, PILL_DAYS, packStarts, pillState, timeline, upcomingBreaks } from '../pills'
import type { Board, Note, NoteBoard, Task } from '../types'
import { Sheet } from './Sheet'
import { useSwipeDelete } from './useSwipeDelete'

// ---------- מסך הלוחות ----------

/** כרטיס לכל לוח, עם שורת סיכום קצרה */
export function NotesHome({ tasks, notes, prefs, onOpen }: { tasks: Task[]; notes: Note[]; prefs: BookingPrefs; onOpen: (b: Board) => void }) {
  const summary = (b: Board): string | { hot: string; bell?: boolean; moon?: boolean } => {
    if (b === 'someday') {
      const n = tasks.filter((t) => !t.done && !t.due).length
      return n === 1 ? 'רעיון אחד' : n ? `${n} רעיונות` : 'ריק'
    }
    const items = notesOf(notes, b)
    const open = items.filter((n) => n.status < 2)
    if (b === 'shopping') return open.length ? `${open.length} לקנות` : 'ריק'
    if (b === 'books') return open.length ? (open.length === 1 ? 'ספר אחד לקרוא' : `${open.length} ספרים לקרוא`) : items.length ? 'קראת הכול 🎉' : 'ריק'
    if (b === 'car') {
      const st = carStatus(notes, prefs)
      const due = st.filter((s) => s.due)
      if (due.length) return { hot: `לחדש ${due.map((s) => s.note.title).join(', ')}`, bell: true }
      return st[0] ? `${st[0].note.title} · ${expiryLabel(st[0].note.date!)}` : 'ריק'
    }
    if (b === 'packages') {
      if (!open.length) return items.length ? 'הכול הגיע' : 'ריק'
      const onWay = open.filter((n) => n.status === 1).length
      return onWay ? `${open.length} ממתינות · ${onWay} בדרך` : `${open.length} ממתינות`
    }
    if (b === 'pills') {
      const s = pillState(notes)
      if (!s) return packStarts(notes).length ? 'החפיסה עוד לא התחילה' : 'ריק'
      if (s.current.kind === 'break') return { hot: `הפסקה · חפיסה חדשה ${agoLabel(s.next!.start)}`, moon: true }
      return s.next?.kind === 'break' ? `כדור ${s.day}/${s.length} · הפסקה ${agoLabel(s.next.start)}` : `כדור ${s.day}/${s.length} · מחוברת לחפיסה הבאה`
    }
    if (b === 'refunds') {
      const gifts = giftcardTotal(notes)
      const giftText = gifts ? `גיפטקארדים ${formatMoney(gifts)}` : ''
      const pending = open.filter((n) => !n.kind)
      if (!pending.length) return giftText || (items.length ? 'הכול התקבל' : 'ריק')
      const sum = pendingRefunds(notes)
      return [sum ? `ממתינים לך ${formatMoney(sum)}` : `${pending.length} ממתינים`, giftText].filter(Boolean).join(' · ')
    }
    const due = bookingStatus(notes, prefs, b as TreatmentBoard).filter((s) => s.due)
    if (due.length) return { hot: `לקבוע תור ${due.map((s) => s.type).join(', ')}`, bell: true }
    const next = upcomingTreatments(notes, b as TreatmentBoard)[0]
    if (next?.date) return { hot: `תור ${next.title} · ${dayWhen(next.date)}` }
    const last = lastTreatment(notes, b as TreatmentBoard)
    if (!last.length) return 'ריק'
    const recent = [...last].sort((a, c) => c.date.localeCompare(a.date))[0]
    return `${recent.title} · ${agoLabel(recent.date)}`
  }

  return (
    <div className="boards">
      {BOARDS.map((b) => (
        <button key={b.id} className="board-card" onClick={() => onOpen(b.id)}>
          <span className="board-emoji" aria-hidden="true">
            {b.emoji}
          </span>
          <span className="board-text">
            <b>{b.label}</b>
            <BoardSummary value={summary(b.id)} />
          </span>
          <ChevronIcon width={18} height={18} className="flip muted" />
        </button>
      ))}
    </div>
  )
}

function BoardSummary({ value }: { value: string | { hot: string; bell?: boolean; moon?: boolean } }) {
  if (typeof value === 'string') return <span>{value}</span>
  return (
    <span className={`hot${value.bell ? ' bell' : ''}${value.moon ? ' moon' : ''}`}>
      {value.moon ? '🌙' : value.bell ? <BellIcon width={13} height={13} /> : <CalendarIcon width={13} height={13} />} {value.hot}
    </span>
  )
}

/** "היום", "מחר", "בעוד 8 ימים" */
function dayWhen(iso: string): string {
  return agoLabel(iso)
}

// ---------- לוח ----------

interface BoardProps {
  board: NoteBoard
  notes: Note[]
  prefs: BookingPrefs
  onEdit: (n: Note, preset?: Partial<Note>) => void
  onAdd: (preset: Partial<Note>) => void
  onDelete: (n: Note) => void
  toast: (msg: string) => void
}

export function NoteBoardView({ board, notes, prefs, onEdit, onAdd, onDelete, toast }: BoardProps) {
  const meta = boardMeta(board)
  const items = notesOf(notes, board)

  if (board === 'pills') return <PillsBoard notes={notes} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} />
  if (board === 'car') return <CarBoard notes={notes} prefs={prefs} onEdit={onEdit} onDelete={onDelete} toast={toast} />
  if (isTreatment(board)) return <TreatmentBoardView board={board} items={items} notes={notes} prefs={prefs} onEdit={onEdit} onAdd={onAdd} onDelete={onDelete} />

  const open = items.filter((n) => n.status < 2)
  const gifts = items.filter((n) => n.kind === 'giftcard')
  const usedGifts = items.filter((n) => n.kind === 'giftcard_used').sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const archiveAfter = board === 'shopping' ? archiveDays(prefs, 'shopping') : 0
  const done = items
    .filter((n) => n.status >= 2 && !n.kind.startsWith('giftcard') && !archived(n.updated_at, archiveAfter))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  const tools =
    board === 'shopping' ? (
      <ArchiveTools board="shopping" prefs={prefs} />
    ) : board === 'books' && open.length > 0 ? (
      <div className="board-tools">
        <button className="btn small ghost" onClick={() => shareBooks(open, toast)}>
          📤 שליחת רשימת הקריאה
        </button>
      </div>
    ) : null

  if (!items.length)
    return (
      <>
        {tools}
        <BoardEmpty board={board} />
      </>
    )

  const row = (n: Note) => <NoteRow key={n.id} note={n} onEdit={onEdit} onDelete={onDelete} toast={toast} />
  const pending = open.filter((n) => !n.kind)
  return (
    <>
      {tools}
      {board === 'refunds' && (pending.length > 0 || gifts.length > 0) && (
        <div className="board-summary">
          {pending.length > 0 && (
            <span>
              ממתינים לך <b>{formatMoney(pendingRefunds(notes))}</b>
              <span className="muted"> · {pending.length === 1 ? 'החזר אחד' : `${pending.length} החזרים`}</span>
            </span>
          )}
          {gifts.length > 0 && (
            <span>
              🎁 בגיפטקארדים <b>{formatMoney(giftcardTotal(notes))}</b>
            </span>
          )}
        </div>
      )}
      {open.length > 0 ? <ul className="notes">{open.map(row)}</ul> : gifts.length === 0 && <p className="muted board-clear">אין פריטים פתוחים 🎉</p>}
      {gifts.length > 0 && (
        <section className="section">
          <h2 className="section-title">
            🎁 גיפטקארדים <span className="muted">{gifts.length}</span>
          </h2>
          <ul className="notes">{gifts.map(row)}</ul>
        </section>
      )}
      {done.length > 0 && (
        <Collapsible title={meta.doneTitle ?? 'הסתיימו'} count={done.length}>
          <ul className="notes">{done.map(row)}</ul>
        </Collapsible>
      )}
      {usedGifts.length > 0 && (
        <Collapsible title="גיפטקארדים שנוצלו" count={usedGifts.length}>
          <ul className="notes">{usedGifts.map(row)}</ul>
        </Collapsible>
      )}
    </>
  )
}

/** שליחת רשימת הספרים שעוד לא נקראו – בתפריט השיתוף של הטלפון (וואטסאפ, הודעה…), או העתקה */
function shareBooks(open: Note[], toast: (m: string) => void) {
  const text = ['📚 ספרים שאני רוצה לקרוא:', ...open.map((n) => `• ${n.title}${n.source ? ` – ${n.source}` : ''}`)].join('\n')
  if (navigator.share) {
    navigator.share({ text }).catch(() => {})
    return
  }
  navigator.clipboard?.writeText(text).then(
    () => toast('הרשימה הועתקה – אפשר להדביק בהודעה'),
    () => toast('לא הצלחתי להעתיק'),
  )
}

/** כפתור "הגדרות" ללוח עם ארכיון (לקנות, יום אחד) */
export function ArchiveTools({ board, prefs }: { board: 'shopping' | 'someday'; prefs: BookingPrefs }) {
  const [open, setOpen] = useState(false)
  const days = archiveDays(prefs, board)
  return (
    <div className="board-tools">
      <button className="btn small ghost" onClick={() => setOpen(true)}>
        <SettingsIcon width={16} height={16} /> הגדרות
      </button>
      {open && (
        <Sheet
          title={`הגדרות · ${boardMeta(board).label}`}
          onClose={() => setOpen(false)}
          footer={
            <>
              <span className="spacer" />
              <button className="btn primary" onClick={() => setOpen(false)}>
                סיום
              </button>
            </>
          }
        >
          <label className="field">
            <span className="label">{board === 'shopping' ? 'פריטים שנקנו יוצאים מהרשימה' : 'רעיונות שבוצעו יוצאים מהרשימה'}</span>
            <select value={days} onChange={(e) => setArchiveDays(board, Number(e.target.value))}>
              {ARCHIVE_OPTIONS.map(([d, l]) => (
                <option key={d} value={d}>
                  {l}
                </option>
              ))}
            </select>
            <span className="hint">
              {board === 'shopping'
                ? 'עד אז הם מופיעים בחלק המקופל "נקנו".'
                : 'עד אז הם מופיעים בחלק המקופל "הושלמו". הם תמיד נשארים במסך "הושלמו".'}
            </span>
          </label>
        </Sheet>
      )}
    </div>
  )
}

function NoteRow({ note, onEdit, onDelete, toast }: { note: Note; onEdit: (n: Note) => void; onDelete: (n: Note) => void; toast: (m: string) => void }) {
  const meta = boardMeta(note.board)
  const swipe = useSwipeDelete(() => onDelete(note))
  const gift = note.kind === 'giftcard' || note.kind === 'giftcard_used'
  const isDone = note.status >= 2 && (!gift || note.kind === 'giftcard_used')
  const checkable = note.board === 'shopping' || note.board === 'books'
  const details: ReactNode[] = []
  if ((note.board === 'refunds' || note.board === 'car') && note.amount !== null) details.push(<b key="a">{formatMoney(note.amount)}</b>)
  if (note.source) details.push(<span key="s">{gift ? `📍 ${note.source}` : note.source}</span>)
  if (note.date && note.board === 'car') {
    const soon = note.date >= today() && note.date <= addMonths(today(), 1)
    details.push(
      <span key="d" className={note.date < today() ? 'expired' : soon ? 'soon' : undefined}>
        {expiryLabel(note.date)}
      </span>,
    )
  } else if (note.date && !gift) {
    const label =
      note.board === 'packages'
        ? isDone
          ? `הוזמנה ${shortDateLabel(note.date)}`
          : waitingLabel(note.date)
        : note.board === 'refunds'
          ? `ביקשתי ${agoLabel(note.date)}`
          : shortDateLabel(note.date)
    details.push(
      <span key="d" className={note.board === 'packages' && !isDone ? 'waiting' : undefined}>
        {label}
      </span>,
    )
  }
  if (note.notes) details.push(<span key="n">{note.notes}</span>)

  return (
    <li className={`note${isDone ? ' is-done' : ''}${swipe.swiping ? ' swiping' : ''}`} {...swipe.handlers}>
      {swipe.bg}
      <div className="note-row" style={swipe.rowStyle}>
      {checkable && (
        <button
          className="check"
          role="checkbox"
          aria-checked={isDone}
          aria-label={isDone ? `להחזיר לרשימה: ${note.title}` : note.board === 'books' ? `קראתי: ${note.title}` : `נקנה: ${note.title}`}
          onClick={() => updateNote(note.id, { status: isDone ? 0 : 2 })}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path d="m5 12 5 5 9-10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      <button className="note-body" onClick={() => onEdit(note)}>
        <span className="note-title">{note.title}</span>
        {details.length > 0 && <span className="note-meta">{details}</span>}
      </button>
      {note.tracking && (
        <button
          className="icon-btn small"
          aria-label={`העתקת מספר המעקב ${note.tracking}`}
          title={note.tracking}
          onClick={() => {
            navigator.clipboard?.writeText(note.tracking).then(
              () => toast('מספר המעקב הועתק'),
              () => toast(note.tracking),
            )
          }}
        >
          <CopyIcon width={16} height={16} />
        </button>
      )}
      {note.kind === 'giftcard' && (
        <button className="status s1" onClick={() => updateNote(note.id, { kind: 'giftcard_used' })} aria-label={`סימון שהגיפטקארד ${note.title} נוצל`}>
          🎁 נוצל?
        </button>
      )}
      {note.kind === 'giftcard_used' && (
        <button className="status" onClick={() => updateNote(note.id, { kind: 'giftcard' })} aria-label="החזרה לגיפטקארדים זמינים">
          נוצל
        </button>
      )}
      {meta.statuses && !gift && (
        <button
          className={`status s${note.status}`}
          onClick={() => updateNote(note.id, { status: (note.status + 1) % 3 })}
          aria-label={`מצב: ${meta.statuses[note.status]}. לחיצה מעבירה ל${meta.statuses[(note.status + 1) % 3]}`}
        >
          {meta.statuses[note.status]}
        </button>
      )}
      </div>
    </li>
  )
}

// ---------- רכב ----------

function CarBoard({ notes, prefs, onEdit, onDelete, toast }: { notes: Note[]; prefs: BookingPrefs; onEdit: (n: Note, preset?: Partial<Note>) => void; onDelete: (n: Note) => void; toast: (m: string) => void }) {
  const [settings, setSettings] = useState(false)
  const items = notesOf(notes, 'car')
  const status = carStatus(notes, prefs)
  const noDate = items.filter((n) => !n.date)
  const tools = (
    <div className="board-tools">
      <button className="btn small ghost" onClick={() => setSettings(true)}>
        <BellIcon width={16} height={16} /> התראה לפני פקיעת תוקף
      </button>
    </div>
  )
  const sheet = settings && (
    <Sheet
      title="התראות · רכב"
      onClose={() => setSettings(false)}
      footer={
        <>
          <span className="spacer" />
          <button className="btn primary" onClick={() => setSettings(false)}>
            סיום
          </button>
        </>
      }
    >
      <label className="field">
        <span className="label">מתי להזכיר לחדש</span>
        <select value={prefs.carLead ?? 30} onChange={(e) => setCarLead(Number(e.target.value))}>
          {CAR_LEAD_OPTIONS.map(([d, l]) => (
            <option key={d} value={d}>
              {l}
            </option>
          ))}
        </select>
        <span className="hint">כשמגיע הזמן, תופיע משימה "לחדש…" במסך היום (עד שתעדכני תאריך תוקף חדש), וגם התראה בלוח הזה.</span>
      </label>
    </Sheet>
  )
  if (!items.length)
    return (
      <>
        {tools}
        <BoardEmpty board="car" />
        {sheet}
      </>
    )
  return (
    <>
      {tools}
      {sheet}
      {status
        .filter((s) => s.due)
        .map((s) => (
          <div key={s.note.id} className={`book-due${s.expired ? ' expired' : ''}`}>
            <span className="next-label">
              <BellIcon width={15} height={15} /> {s.expired ? 'פג תוקף' : 'מתקרב מועד החידוש'}
            </span>
            <b>{s.note.title}</b>
            <span className="next-when">{expiryLabel(s.note.date!)}</span>
            <button className="btn small primary" onClick={() => onEdit(s.note, { date: addMonths(s.note.date!, 12) })}>
              חידשתי
            </button>
          </div>
        ))}
      <ul className="notes">
        {[...status.map((s) => s.note), ...noDate].map((n) => (
          <NoteRow key={n.id} note={n} onEdit={onEdit} onDelete={onDelete} toast={toast} />
        ))}
      </ul>
    </>
  )
}

interface TreatmentProps {
  board: TreatmentBoard
  items: Note[]
  notes: Note[]
  prefs: BookingPrefs
  onEdit: (n: Note) => void
  onAdd: (preset: Partial<Note>) => void
  onDelete: (n: Note) => void
}

function TreatmentBoardView({ board, items, notes, prefs, onEdit, onAdd, onDelete }: TreatmentProps) {
  const [settings, setSettings] = useState(false)
  const status = bookingStatus(notes, prefs, board)
  const tools = (
    <div className="board-tools">
      <button className="btn small ghost" onClick={() => setSettings(true)}>
        <BellIcon width={16} height={16} /> תזכורות לקביעת תור
      </button>
    </div>
  )
  const sheet = settings && <BookingSettings board={board} notes={notes} prefs={prefs} onClose={() => setSettings(false)} />
  if (!items.length)
    return (
      <>
        {tools}
        <BoardEmpty board={board} />
        {sheet}
      </>
    )
  const last = lastTreatment(notes, board)
  const upcoming = upcomingTreatments(notes, board)
  const past = items.filter((n) => !upcoming.includes(n)).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  return (
    <>
      {tools}
      {sheet}
      {status
        .filter((s) => s.due)
        .map((s) => (
          <div key={s.type} className="book-due">
            <span className="next-label">
              <BellIcon width={15} height={15} /> הגיע הזמן לקבוע תור
            </span>
            <b>{s.type}</b>
            <span className="next-when">
              התור האחרון {agoLabel(s.last)} · מומלץ {everyMonthsLabel(s.months)}
            </span>
            <button className="btn small primary" onClick={() => onAdd({ title: s.type, date: s.next > today() ? s.next : today() })}>
              קביעת תור
            </button>
          </div>
        ))}
      {upcoming.map((n, i) => (
        <button key={n.id} className="next-appt" onClick={() => onEdit(n)}>
          <span className="next-label">
            <CalendarIcon width={15} height={15} /> {i === 0 ? 'התור הבא' : 'תור נוסף'}
          </span>
          <b>{n.title}</b>
          <span className="next-when">
            {fullDateLabel(n.date!).replace(/^(היום|מחר) · /, '')}
            {n.time && ` · ${n.time}`}
          </span>
          <span className="next-chip">{agoLabel(n.date!)}</span>
        </button>
      ))}
      {last.length > 0 && (
        <div className="hair-last">
          {last.map((h) => (
            <div key={h.title} className="tile">
              <span>{h.title}</span>
              <b>{agoLabel(h.date)}</b>
              <span>{shortDateLabel(h.date)}</span>
            </div>
          ))}
        </div>
      )}
      {past.length > 0 && (
        <>
          <h2 className="section-title">
            תורים קודמים <span className="muted">{past.length}</span>
          </h2>
          <ul className="notes">
            {past.map((n) => (
              <TreatmentRow key={n.id} note={n} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function TreatmentRow({ note, onEdit, onDelete }: { note: Note; onEdit: (n: Note) => void; onDelete: (n: Note) => void }) {
  const swipe = useSwipeDelete(() => onDelete(note))
  return (
    <li className={`note${swipe.swiping ? ' swiping' : ''}`} {...swipe.handlers}>
      {swipe.bg}
      <div className="note-row" style={swipe.rowStyle}>
        <button className="note-body" onClick={() => onEdit(note)}>
          <span className="note-title">{note.title}</span>
          {note.notes && <span className="note-meta">{note.notes}</span>}
        </button>
        {note.date && (
          <span className="note-date">
            {shortDateLabel(note.date)}
            <span className="muted">{agoLabel(note.date)}</span>
          </span>
        )}
      </div>
    </li>
  )
}

// ---------- גלולות ----------

const dayMonth = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short' })
/** "5–11 בדצמ׳", "30 בינו׳ – 5 בפבר׳" (בלי שנה – התחזית היא לחודשים הקרובים) */
const rangeLabel = (a: string, b: string) => {
  const fa = dayMonth.format(new Date(a + 'T12:00'))
  const fb = dayMonth.format(new Date(b + 'T12:00'))
  return a.slice(0, 7) === b.slice(0, 7) ? `${Number(a.slice(8))}–${fb}` : `${fa} – ${fb}`
}

function PillsBoard({ notes, onAdd, onEdit, onDelete }: { notes: Note[]; onAdd: (p: Partial<Note>) => void; onEdit: (n: Note) => void; onDelete: (n: Note) => void }) {
  const packs = packStarts(notes)
  const s = pillState(notes)

  if (!packs.length) {
    return (
      <div className="empty">
        <div className="empty-emoji" aria-hidden="true">
          💊
        </div>
        <h3>גלולות</h3>
        <p>
          {PILL_DAYS} כדורים ו-{BREAK_DAYS} ימי הפסקה. מספיק לרשום מתי התחלת את החפיסה הנוכחית – משם הכול מחושב לבד.
        </p>
        <button className="btn primary" style={{ marginTop: 16 }} onClick={() => onAdd({ title: 'חפיסה', date: today() })}>
          מתי התחלתי את החפיסה?
        </button>
      </div>
    )
  }

  const breaks = upcomingBreaks(notes, 8)
  const history = timeline(notes, today()).filter((x) => x.kind === 'pack' && !x.projected && x.start <= today()).reverse()
  const overChain = s && s.current.kind === 'pack' && s.current.chain > MAX_CHAIN

  return (
    <>
      {s ? (
        <div className={`pill-card${s.current.kind === 'break' ? ' on-break' : ''}`}>
          <span className="next-label">{s.current.kind === 'break' ? '🌙 הפסקה' : s.current.chain > 1 ? `💊 חפיסה ${s.current.chain} ברצף` : '💊 חפיסה'}</span>
          <b>
            {s.current.kind === 'break' ? `יום ${s.day} מתוך ${s.length}` : `כדור ${s.day} מתוך ${s.length}`}
          </b>
          <div className="pill-track" aria-hidden="true">
            {Array.from({ length: s.length }, (_, i) => (
              <i key={i} className={i < s.day ? 'on' : ''} />
            ))}
          </div>
          {s.next && (
            <span className="next-when">
              {s.next.kind === 'break'
                ? `הפסקה מתחילה ${fullDateLabel(s.next.start).replace(/^(היום|מחר) · /, '')} · ${agoLabel(s.next.start)}`
                : s.current.kind === 'break'
                  ? `חפיסה חדשה ${fullDateLabel(s.next.start).replace(/^(היום|מחר) · /, '')} · ${agoLabel(s.next.start)}`
                  : `מחוברת: החפיסה הבאה מתחילה מיד, ${fullDateLabel(s.next.start).replace(/^(היום|מחר) · /, '')}`}
            </span>
          )}
        </div>
      ) : (
        <div className="pill-card">
          <span className="next-label">💊 חפיסה</span>
          <b>מתחילה {agoLabel(packs[0].date!)}</b>
        </div>
      )}

      {overChain && <p className="pill-warn">⚠️ חיברת כבר {s!.current.chain} חפיסות ברצף – יותר מ-{MAX_CHAIN}. אחרי החפיסה הזו צריך הפסקה.</p>}

      {s?.current.kind === 'pack' && (
        <div className="pill-actions">
          {s.connected ? (
            <button className="btn small" onClick={disconnectPack}>
              ביטול החיבור – לעשות הפסקה
            </button>
          ) : s.canConnect ? (
            <button className="btn small" onClick={connectPack}>
              לחבר חפיסה (בלי הפסקה)
            </button>
          ) : (
            <span className="hint">
              זו החפיסה ה-{s.current.chain} ברצף – אחריה הפסקה (מקסימום {MAX_CHAIN})
            </span>
          )}
        </div>
      )}

      <section className="stats-card pill-forecast">
        <h2>ההפסקות הבאות</h2>
        <ul>
          {breaks.map((b) => (
            <li key={b.start}>
              <span>{rangeLabel(b.start, b.end)}</span>
              <span className="muted">{b.start <= today() ? 'עכשיו' : agoLabel(b.start)}</span>
            </li>
          ))}
        </ul>
        <p className="hint">התחזית מניחה הפסקה אחרי כל חפיסה. חיבור חפיסות מעדכן אותה.</p>
      </section>

      <h2 className="section-title">
        חפיסות שהתחילו <span className="muted">{history.length}</span>
      </h2>
      <ul className="notes">
        {history.map((p) => {
          const note = notes.find((n) => n.id === p.noteId)
          return note ? (
            <PillRow key={p.start} seg={p} note={note} onEdit={onEdit} onDelete={onDelete} />
          ) : null
        })}
      </ul>
      <p className="hint">החפיסות הבאות נרשמות לבד. אם התחלת חפיסה בתאריך אחר מהמתוכנן, לחצי על + ורשמי את התאריך.</p>
    </>
  )
}

function PillRow({ seg, note, onEdit, onDelete }: { seg: { start: string; end: string; chain: number }; note: Note; onEdit: (n: Note) => void; onDelete: (n: Note) => void }) {
  const swipe = useSwipeDelete(() => onDelete(note))
  return (
    <li className={`note${swipe.swiping ? ' swiping' : ''}`} {...swipe.handlers}>
      {swipe.bg}
      <div className="note-row" style={swipe.rowStyle}>
        <button className="note-body" onClick={() => onEdit(note)}>
          <span className="note-title">{seg.chain > 1 ? `חפיסה מחוברת (${seg.chain} ברצף)` : 'חפיסה'}</span>
          <span className="note-meta">{rangeLabel(seg.start, seg.end)}</span>
        </button>
        <span className="note-date">
          {shortDateLabel(seg.start)}
          <span className="muted">{agoLabel(seg.start)}</span>
        </span>
      </div>
    </li>
  )
}

// ---------- הגדרות תזכורות ללוח תורים ----------

function BookingSettings({ board, notes, prefs, onClose }: { board: TreatmentBoard; notes: Note[]; prefs: BookingPrefs; onClose: () => void }) {
  const status = new Map(bookingStatus(notes, prefs, board).map((s) => [s.type, s]))
  return (
    <Sheet
      title={`תזכורות · ${boardMeta(board).label}`}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn primary" onClick={onClose}>
            סיום
          </button>
        </>
      }
    >
      <p className="hint">
        לכל סוג טיפול בוחרים כל כמה זמן קובעים תור. כשהמועד מתקרב ועוד לא קבעת תור, תופיע משימה "לקבוע תור" במסך היום, וגם תזכורת בלוח הזה.
      </p>
      {treatmentTypes(notes, board).map((type) => {
        const months = prefs.intervals[prefKey(board, type)] ?? 0
        const s = status.get(type)
        return (
          <label key={type} className="field book-pref">
            <span className="book-pref-row">
              <span className="book-pref-name">{type}</span>
              <select value={months} onChange={(e) => setBookingInterval(board, type, Number(e.target.value) || null)}>
                <option value={0}>בלי תזכורת</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {everyMonthsLabel(m)}
                  </option>
                ))}
              </select>
            </span>
            {months > 0 && (
              <span className="hint">
                {s
                  ? s.booked
                    ? 'כבר קבעת תור 👍'
                    : `התור האחרון ${shortDateLabel(s.last)} · הבא מומלץ ב-${shortDateLabel(s.next)}`
                  : 'עוד אין תור קודם – התזכורת תתחיל אחרי שתרשמי תור'}
              </span>
            )}
          </label>
        )
      })}
      <label className="field">
        <span className="label">מתי להזכיר</span>
        <select value={prefs.lead[board] ?? 14} onChange={(e) => setBookingLead(board, Number(e.target.value))}>
          {LEAD_OPTIONS.map(([d, l]) => (
            <option key={d} value={d}>
              {l}
            </option>
          ))}
        </select>
      </label>
    </Sheet>
  )
}

function Collapsible({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="section">
      <h2 className="section-title">
        <button className="collapse" onClick={() => setOpen(!open)} aria-expanded={open}>
          <ChevronIcon width={16} height={16} className={open ? 'rot' : ''} />
          {title} <span className="muted">{count}</span>
        </button>
      </h2>
      {open && children}
    </section>
  )
}

const EMPTY: Record<NoteBoard, string> = {
  shopping: 'דברים שצריך או רוצים לקנות, בלי תאריך.',
  packages: 'כל חבילה שהזמנת: מאיפה, מספר מעקב, וכמה ימים היא כבר בדרך.',
  refunds: 'כסף שאמור לחזור אלייך – עד שרואים את הזיכוי בבנק.',
  hair: 'מתי היה התור האחרון לגוונים, לתלתלים או לתספורת.',
  lashes: 'מתי היה התור האחרון להרמת ריסים.',
  pills: '',
  books: 'ספרים שאת רוצה לקרוא. מסמנים מה קראת, ואפשר לשלוח את הרשימה בהודעה.',
  car: 'טסט וביטוחים: תאריך התוקף של כל אחד, והתראה לפני שהוא פג.',
}

function BoardEmpty({ board }: { board: NoteBoard }) {
  const meta = boardMeta(board)
  return (
    <div className="empty">
      <div className="empty-emoji" aria-hidden="true">
        {meta.emoji}
      </div>
      <h3>{meta.label}</h3>
      <p>{EMPTY[board]}</p>
      <p>לחצי על + כדי להוסיף.</p>
    </div>
  )
}

// ---------- הוספה ועריכה ----------

interface EditorProps {
  board: NoteBoard
  note: Note | null // null = פריט חדש
  preset?: Partial<Note> // ערכים התחלתיים (פריט חדש מ"קביעת תור", או תאריך חדש ב"חידשתי")
  notes: Note[]
  onClose: () => void
  onDeleted: (n: Note) => void
}

export function NoteEditor({ board, note, preset, notes, onClose, onDeleted }: EditorProps) {
  const meta = boardMeta(board)
  const t = today()
  const [f, setF] = useState(() => ({
    title: note?.title ?? preset?.title ?? (board === 'pills' ? 'חפיסה' : ''),
    source: note?.source ?? '',
    tracking: note?.tracking ?? '',
    amount: note?.amount !== null && note?.amount !== undefined ? String(note.amount) : '',
    date: preset?.date ?? note?.date ?? (board === 'shopping' || board === 'books' || board === 'car' ? '' : t),
    kind: note?.kind ?? '',
    time: note?.time ?? '',
    status: note?.status ?? 0,
    notes: note?.notes ?? '',
  }))
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }))

  const save = (e?: FormEvent) => {
    e?.preventDefault()
    const title = f.title.trim()
    if (!title || (board === 'pills' && !f.date)) return
    const amount = f.amount.trim() ? Number(f.amount.replace(/[^\d.]/g, '')) : null
    const fields = {
      title,
      source: f.source.trim(),
      tracking: f.tracking.trim(),
      amount: amount !== null && Number.isFinite(amount) ? amount : null,
      date: f.date || null,
      time: isTreatment(board) && f.date ? f.time || null : null,
      status: f.kind === 'giftcard' ? 2 : f.status,
      kind: board === 'refunds' ? (f.kind === 'giftcard' && note?.kind === 'giftcard_used' ? 'giftcard_used' : f.kind) : '',
      notes: f.notes.trim(),
    }
    if (note) updateNote(note.id, fields)
    else addNote(board, fields)
    onClose()
  }

  const types = isTreatment(board) ? treatmentTypes(notes, board) : board === 'car' ? CAR_TYPES : []
  const gift = board === 'refunds' && f.kind === 'giftcard'

  return (
    <Sheet
      title={note ? meta.label : `${meta.label} · חדש`}
      onClose={onClose}
      footer={
        <>
          {note && (
            <button
              className="btn danger ghost"
              onClick={() => {
                deleteNote(note.id)
                onDeleted(note)
                onClose()
              }}
            >
              <TrashIcon width={18} height={18} /> מחיקה
            </button>
          )}
          <span className="spacer" />
          <button className="btn primary" onClick={() => save()} disabled={!f.title.trim()}>
            {note ? 'שמירה' : 'הוספה'}
          </button>
        </>
      }
    >
      <form className="note-form" onSubmit={save}>
        {board === 'pills' ? (
          <label className="field">
            <span className="label">היום של הכדור הראשון בחפיסה</span>
            <input type="date" className="date-input" value={f.date} onChange={(e) => set({ date: e.target.value })} />
            <span className="hint">מכאן הכול מחושב: {PILL_DAYS} ימי כדורים, {BREAK_DAYS} ימי הפסקה, וחוזר.</span>
          </label>
        ) : (
        <label className="field">
          <span className="label">{meta.titleLabel}</span>
          <input
            className="text-input"
            autoFocus={!note}
            value={f.title}
            onChange={(e) => set({ title: e.target.value })}
            enterKeyHint="done"
            placeholder={board === 'packages' ? 'למשל: עלי אקספרס, שיין, אמזון' : undefined}
          />
        </label>
        )}

        {types.length > 0 && (
          <div className="chips">
            {types.map((h) => (
              <button type="button" key={h} className={`chip${f.title.trim() === h ? ' on' : ''}`} onClick={() => set({ title: h })}>
                {h}
              </button>
            ))}
          </div>
        )}

        {board === 'packages' && (
          <>
            <label className="field">
              <span className="label">מה הזמנתי (לא חובה)</span>
              <input className="text-input" value={f.source} onChange={(e) => set({ source: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">מספר מעקב</span>
              <input className="text-input" dir="ltr" value={f.tracking} onChange={(e) => set({ tracking: e.target.value })} />
            </label>
          </>
        )}

        {board === 'refunds' && (
          <div className="field">
            <span className="label">איך הכסף חוזר</span>
            <div className="segmented">
              <button type="button" className={`seg${!gift ? ' on' : ''}`} onClick={() => set({ kind: '' })}>
                זיכוי (כרטיס / בנק)
              </button>
              <button type="button" className={`seg${gift ? ' on' : ''}`} onClick={() => set({ kind: 'giftcard' })}>
                🎁 גיפטקארד
              </button>
            </div>
          </div>
        )}

        {gift && (
          <label className="field">
            <span className="label">איפה הגיפטקארד נמצא</span>
            <input className="text-input" value={f.source} onChange={(e) => set({ source: e.target.value })} placeholder="למשל: בארנק, במגירה, באפליקציה" />
            <span className="hint">גיפטקארד נחשב כבר "התקבל".</span>
          </label>
        )}

        {board === 'books' && (
          <label className="field">
            <span className="label">סופר/ת (לא חובה)</span>
            <input className="text-input" value={f.source} onChange={(e) => set({ source: e.target.value })} />
          </label>
        )}

        {board === 'car' && (
          <>
            <label className="field">
              <span className="label">בתוקף עד</span>
              <input type="date" className="date-input" value={f.date} onChange={(e) => set({ date: e.target.value })} />
            </label>
            <div className="field-row">
              <label className="field">
                <span className="label">חברה / סוכן (לא חובה)</span>
                <input className="text-input" value={f.source} onChange={(e) => set({ source: e.target.value })} />
              </label>
              <label className="field">
                <span className="label">עלות ₪ (לא חובה)</span>
                <input className="text-input" inputMode="decimal" dir="ltr" value={f.amount} onChange={(e) => set({ amount: e.target.value })} />
              </label>
            </div>
          </>
        )}

        {board === 'refunds' && (
          <label className="field">
            <span className="label">סכום (₪)</span>
            <input className="text-input" inputMode="decimal" dir="ltr" value={f.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="0" />
          </label>
        )}

        {isTreatment(board) ? (
          <>
            <div className="field-row">
              <label className="field">
                <span className="label">תאריך התור</span>
                <input type="date" className="date-input" value={f.date} onChange={(e) => set({ date: e.target.value })} />
              </label>
              <label className="field">
                <span className="label">שעה (לא חובה)</span>
                <input type="time" className="date-input" value={f.time} onChange={(e) => set({ time: e.target.value })} />
              </label>
            </div>
            {f.date >= today() && <span className="hint">תור עתידי נכנס גם ללוח השנה, ומתעדכן שם כשמשנים אותו כאן.</span>}
          </>
        ) : (
          (board === 'packages' || (board === 'refunds' && !gift)) && (
            <label className="field">
              <span className="label">{board === 'packages' ? 'תאריך ההזמנה' : 'מתי ביקשתי'}</span>
              <input type="date" className="date-input" value={f.date} onChange={(e) => set({ date: e.target.value })} />
            </label>
          )
        )}

        {meta.statuses && !gift && (
          <div className="field">
            <span className="label">מצב</span>
            <div className="segmented">
              {meta.statuses.map((s, i) => (
                <button type="button" key={s} className={`seg${f.status === i ? ' on' : ''}`} onClick={() => set({ status: i })}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {board !== 'shopping' && board !== 'pills' && board !== 'books' && (
          <label className="field">
            <span className="label">הערות</span>
            <textarea className="notes" rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
          </label>
        )}
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}

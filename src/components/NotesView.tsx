import { useState, type FormEvent, type ReactNode } from 'react'
import { fullDateLabel, today } from '../dates'
import { CalendarIcon, ChevronIcon, CopyIcon, TrashIcon } from '../icons'
import { BOARDS, TREATMENT_TYPES, agoLabel, boardMeta, formatMoney, isTreatment, lastTreatment, notesOf, pendingRefunds, shortDateLabel, upcomingTreatments, waitingLabel, type TreatmentBoard } from '../notes'
import { addNote, deleteNote, updateNote } from '../store'
import type { Board, Note, NoteBoard, Task } from '../types'
import { Sheet } from './Sheet'
import { useSwipeDelete } from './useSwipeDelete'

// ---------- מסך הלוחות ----------

/** כרטיס לכל לוח, עם שורת סיכום קצרה */
export function NotesHome({ tasks, notes, onOpen }: { tasks: Task[]; notes: Note[]; onOpen: (b: Board) => void }) {
  const summary = (b: Board): string | { hot: string } => {
    if (b === 'someday') {
      const n = tasks.filter((t) => !t.done && !t.due).length
      return n === 1 ? 'רעיון אחד' : n ? `${n} רעיונות` : 'ריק'
    }
    const items = notesOf(notes, b)
    const open = items.filter((n) => n.status < 2)
    if (b === 'shopping') return open.length ? `${open.length} לקנות` : 'ריק'
    if (b === 'packages') {
      if (!open.length) return items.length ? 'הכול הגיע' : 'ריק'
      const onWay = open.filter((n) => n.status === 1).length
      return onWay ? `${open.length} ממתינות · ${onWay} בדרך` : `${open.length} ממתינות`
    }
    if (b === 'refunds') {
      if (!open.length) return items.length ? 'הכול התקבל' : 'ריק'
      const sum = pendingRefunds(notes)
      return sum ? `ממתינים לך ${formatMoney(sum)}` : `${open.length} ממתינים`
    }
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

function BoardSummary({ value }: { value: string | { hot: string } }) {
  if (typeof value === 'string') return <span>{value}</span>
  return (
    <span className="hot">
      <CalendarIcon width={13} height={13} /> {value.hot}
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
  onEdit: (n: Note) => void
  onDelete: (n: Note) => void
  toast: (msg: string) => void
}

export function NoteBoardView({ board, notes, onEdit, onDelete, toast }: BoardProps) {
  const meta = boardMeta(board)
  const items = notesOf(notes, board)

  if (isTreatment(board)) return <TreatmentBoardView board={board} items={items} notes={notes} onEdit={onEdit} onDelete={onDelete} />

  const open = items.filter((n) => n.status < 2)
  const done = items.filter((n) => n.status >= 2).sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  if (!items.length) return <BoardEmpty board={board} />

  const row = (n: Note) => <NoteRow key={n.id} note={n} onEdit={onEdit} onDelete={onDelete} toast={toast} />
  return (
    <>
      {board === 'refunds' && open.length > 0 && (
        <div className="board-summary">
          ממתינים לך <b>{formatMoney(pendingRefunds(notes))}</b>
          <span className="muted"> · {open.length === 1 ? 'החזר אחד' : `${open.length} החזרים`}</span>
        </div>
      )}
      {open.length > 0 ? <ul className="notes">{open.map(row)}</ul> : <p className="muted board-clear">אין פריטים פתוחים 🎉</p>}
      {done.length > 0 && (
        <Collapsible title={meta.doneTitle ?? 'הסתיימו'} count={done.length}>
          <ul className="notes">{done.map(row)}</ul>
        </Collapsible>
      )}
    </>
  )
}

function NoteRow({ note, onEdit, onDelete, toast }: { note: Note; onEdit: (n: Note) => void; onDelete: (n: Note) => void; toast: (m: string) => void }) {
  const meta = boardMeta(note.board)
  const swipe = useSwipeDelete(() => onDelete(note))
  const isDone = note.status >= 2
  const details: ReactNode[] = []
  if (note.board === 'refunds' && note.amount !== null) details.push(<b key="a">{formatMoney(note.amount)}</b>)
  if (note.source) details.push(<span key="s">{note.source}</span>)
  if (note.date) {
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
      {note.board === 'shopping' && (
        <button
          className="check"
          role="checkbox"
          aria-checked={isDone}
          aria-label={isDone ? `להחזיר לרשימה: ${note.title}` : `נקנה: ${note.title}`}
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
      {meta.statuses && (
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

interface TreatmentProps {
  board: TreatmentBoard
  items: Note[]
  notes: Note[]
  onEdit: (n: Note) => void
  onDelete: (n: Note) => void
}

function TreatmentBoardView({ board, items, notes, onEdit, onDelete }: TreatmentProps) {
  if (!items.length) return <BoardEmpty board={board} />
  const last = lastTreatment(notes, board)
  const upcoming = upcomingTreatments(notes, board)
  const past = items.filter((n) => !upcoming.includes(n)).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  return (
    <>
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
  notes: Note[]
  onClose: () => void
  onDeleted: (n: Note) => void
}

export function NoteEditor({ board, note, notes, onClose, onDeleted }: EditorProps) {
  const meta = boardMeta(board)
  const t = today()
  const [f, setF] = useState(() => ({
    title: note?.title ?? '',
    source: note?.source ?? '',
    tracking: note?.tracking ?? '',
    amount: note?.amount !== null && note?.amount !== undefined ? String(note.amount) : '',
    date: note?.date ?? (board === 'shopping' ? '' : t),
    time: note?.time ?? '',
    status: note?.status ?? 0,
    notes: note?.notes ?? '',
  }))
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }))

  const save = (e?: FormEvent) => {
    e?.preventDefault()
    const title = f.title.trim()
    if (!title) return
    const amount = f.amount.trim() ? Number(f.amount.replace(/[^\d.]/g, '')) : null
    const fields = {
      title,
      source: f.source.trim(),
      tracking: f.tracking.trim(),
      amount: amount !== null && Number.isFinite(amount) ? amount : null,
      date: f.date || null,
      time: isTreatment(board) && f.date ? f.time || null : null,
      status: f.status,
      notes: f.notes.trim(),
    }
    if (note) updateNote(note.id, fields)
    else addNote(board, fields)
    onClose()
  }

  const types = isTreatment(board) ? [...new Set([...TREATMENT_TYPES[board], ...notesOf(notes, board).map((n) => n.title.trim()).filter(Boolean)])] : []

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
          board !== 'shopping' && (
            <label className="field">
              <span className="label">{board === 'packages' ? 'תאריך ההזמנה' : 'מתי ביקשתי'}</span>
              <input type="date" className="date-input" value={f.date} onChange={(e) => set({ date: e.target.value })} />
            </label>
          )
        )}

        {meta.statuses && (
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

        {board !== 'shopping' && (
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

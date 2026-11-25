import { useState, type FormEvent } from 'react'
import { supabase } from '../supabase'
import { clearCompleted, exportJSON, importJSON, signIn, signOut, signUp, syncNow, useStore, type SyncStatus } from '../store'
import { Sheet } from './Sheet'
import { ACCENTS, useAccent } from '../accent'

interface Props {
  onClose: () => void
  canInstall: boolean
  onInstall: () => void
  toast: (msg: string) => void
}

export const SYNC_LABEL: Record<SyncStatus, string> = {
  local: 'שמירה במכשיר בלבד',
  'signed-out': 'לא מחובר – שמירה במכשיר בלבד',
  syncing: 'מסנכרן…',
  synced: 'מסונכרן',
  offline: 'אין חיבור – השינויים יסונכרנו כשהרשת תחזור',
  error: 'שגיאת סנכרון',
}

export function Settings({ onClose, canInstall, onInstall, toast }: Props) {
  const store = useStore()
  const [accent, setAccent] = useAccent()
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const standalone = matchMedia('(display-mode: standalone)').matches

  return (
    <Sheet title="הגדרות" onClose={onClose}>
      <section className="settings-group">
        <h3>סנכרון בין מכשירים</h3>
        {!supabase ? (
          <p className="muted">
            המשימות נשמרות כרגע רק בדפדפן הזה. כדי לסנכרן בין הטלפון למחשב, צריך לחבר פרויקט Supabase חינמי – ההוראות
            נמצאות בקובץ README.
          </p>
        ) : store.user ? (
          <>
            <p>
              מחובר כ־<b dir="ltr">{store.user.email}</b>
            </p>
            <p className={`sync-line s-${store.sync}`}>
              {SYNC_LABEL[store.sync]}
              {store.syncError && store.sync === 'error' && <span className="muted"> ({store.syncError})</span>}
            </p>
            <div className="row">
              <button className="btn" onClick={() => void syncNow()} disabled={store.sync === 'syncing'}>
                סנכרן עכשיו
              </button>
              <button
                className="btn ghost"
                onClick={async () => {
                  if (!confirm('להתנתק? המשימות יימחקו מהמכשיר הזה וישארו שמורות בחשבון.')) return
                  await signOut()
                  toast('התנתקת')
                }}
              >
                התנתקות
              </button>
            </div>
          </>
        ) : (
          <AuthForm toast={toast} />
        )}
      </section>

      <section className="settings-group">
        <h3>התקנה כאפליקציה</h3>
        {standalone ? (
          <p className="muted">האפליקציה מותקנת ופועלת במצב אפליקציה ✓</p>
        ) : canInstall ? (
          <button className="btn primary" onClick={onInstall}>
            התקנה על המכשיר
          </button>
        ) : isIOS ? (
          <p className="muted">
            באייפון: פתחו את האתר ב־Safari, לחצו על כפתור השיתוף <b>⎙</b> ובחרו <b>"הוספה למסך הבית"</b>.
          </p>
        ) : (
          <p className="muted">
            בתפריט הדפדפן (⋮) בחרו <b>"התקנת אפליקציה"</b> או <b>"הוספה למסך הבית"</b>.
          </p>
        )}
      </section>

      <section className="settings-group">
        <h3>צבע</h3>
        <div className="swatches" role="radiogroup" aria-label="צבע הדגשה">
          {ACCENTS.map((a) => (
            <button key={a.id} role="radio" aria-checked={accent === a.id} className={`swatch${accent === a.id ? ' on' : ''}`} onClick={() => setAccent(a.id)}>
              <i style={{ background: a.color }} />
              {a.name}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-group">
        <h3>נתונים</h3>
        <div className="row wrap">
          <button
            className="btn"
            onClick={() => {
              const blob = new Blob([exportJSON()], { type: 'application/json' })
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = `tasks-backup-${new Date().toISOString().slice(0, 10)}.json`
              a.click()
              setTimeout(() => URL.revokeObjectURL(a.href), 1000)
            }}
          >
            ייצוא גיבוי
          </button>
          <label className="btn">
            ייבוא גיבוי
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                try {
                  const n = importJSON(await f.text())
                  toast(`יובאו ${n} משימות`)
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'הייבוא נכשל')
                }
              }}
            />
          </label>
          <button
            className="btn ghost danger"
            onClick={() => {
              const n = store.tasks.filter((t) => t.done).length
              if (!n) return toast('אין משימות שהושלמו')
              if (confirm(`למחוק ${n} משימות שהושלמו?`)) {
                clearCompleted()
                toast('המשימות שהושלמו נמחקו')
              }
            }}
          >
            מחיקת משימות שהושלמו
          </button>
        </div>
      </section>
    </Sheet>
  )
}

function AuthForm({ toast }: { toast: (m: string) => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      if (mode === 'in') {
        await signIn(email.trim(), password)
        toast('התחברת – המשימות מסתנכרנות')
      } else {
        const r = await signUp(email.trim(), password)
        if (r === 'confirm-email') setInfo('נשלח אליך מייל אישור. אחרי האישור חזרו לכאן והתחברו.')
        else toast('החשבון נוצר – המשימות מסתנכרנות')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="auth" onSubmit={submit}>
      <p className="muted">התחברו כדי לראות את אותן משימות בטלפון ובמחשב. משימות שכבר יצרתם כאן יועלו לחשבון.</p>
      <input type="email" required dir="ltr" autoComplete="email" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label='דוא"ל' />
      <input
        type="password"
        required
        minLength={6}
        dir="ltr"
        autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
        placeholder="סיסמה"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-label="סיסמה"
      />
      {error && <p className="error">{error}</p>}
      {info && <p className="info">{info}</p>}
      <div className="row">
        <button className="btn primary" disabled={busy}>
          {busy ? '…' : mode === 'in' ? 'התחברות' : 'יצירת חשבון'}
        </button>
        <button type="button" className="btn link" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'אין לי חשבון – הרשמה' : 'יש לי חשבון – התחברות'}
        </button>
      </div>
    </form>
  )
}

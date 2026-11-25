/**
 * תזכורות מקומיות: כל 30 שניות בודקים אם הגיע זמן התזכורת של משימה, ומציגים התראה של המערכת.
 * עובד כל עוד האפליקציה פתוחה (גם ברקע, בלשונית או כאפליקציה מותקנת).
 * תזכורות כשהאפליקציה סגורה לגמרי דורשות Web Push מהשרת – יתווסף עם הפריסה.
 */
import type { Task } from './types'

const SENT_KEY = 'task-manager:reminded'
const LATE_LIMIT = 60 * 60_000 // לא מציגים תזכורת שאיחרה ביותר משעה (למשל אחרי שהמחשב היה כבוי)

export const notificationsSupported = typeof window !== 'undefined' && 'Notification' in window

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported ? Notification.permission : 'unsupported'
}

export async function requestNotifications(): Promise<boolean> {
  if (!notificationsSupported) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  return (await Notification.requestPermission()) === 'granted'
}

/** מתי התזכורת אמורה לצאת (ms), או null */
export function reminderAt(t: Task): number | null {
  if (t.remind === null || !t.due || !t.time || t.done || t.deleted) return null
  const [y, m, d] = t.due.split('-').map(Number)
  const [hh, mm] = t.time.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm).getTime() - t.remind * 60_000
}

function readSent(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) || '{}')
  } catch {
    return {}
  }
}

async function show(t: Task) {
  const body = t.remind === 0 ? `עכשיו · ${t.time}` : `ב-${t.time}`
  const opts: NotificationOptions = { body, icon: `${import.meta.env.BASE_URL}pwa-192x192.png`, tag: t.id, lang: 'he', dir: 'rtl' }
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) return reg.showNotification(t.title, opts)
  } catch {
    /* נופלים להתראה רגילה */
  }
  new Notification(t.title, opts)
}

/** בודק את כל המשימות ומציג תזכורות שהגיע זמנן. מפתח הזיכרון כולל את הזמן – שינוי שעה יוצר תזכורת חדשה */
export function checkReminders(tasks: Task[]) {
  if (!notificationsSupported || Notification.permission !== 'granted') return
  const now = Date.now()
  const sent = readSent()
  let changed = false
  for (const t of tasks) {
    const at = reminderAt(t)
    if (at === null || at > now || now - at > LATE_LIMIT) continue
    const key = `${t.id}@${at}`
    if (sent[key]) continue
    sent[key] = now
    changed = true
    void show(t)
  }
  if (changed) {
    // ניקוי רשומות ישנות (מעל שבוע)
    for (const [k, v] of Object.entries(sent)) if (now - v > 7 * 86_400_000) delete sent[k]
    try {
      localStorage.setItem(SENT_KEY, JSON.stringify(sent))
    } catch {
      /* ignore */
    }
  }
}

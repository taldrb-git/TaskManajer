const pad = (n: number) => String(n).padStart(2, '0')

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function today(): string {
  return toISODate(new Date())
}

/** מספר הימים מ-from עד to (to מאוחר יותר → חיובי) */
export function diffDays(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number)
  const [y2, m2, d2] = to.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}

/** המופע הבא של משימה חוזרת אחרי התאריך iso */
export function nextOccurrence(iso: string, repeat: 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'): string {
  const [y, m, d] = iso.split('-').map(Number)
  switch (repeat) {
    case 'daily':
      return addDays(iso, 1)
    case 'weekdays': {
      // ימי חול בישראל: ראשון–חמישי. אחרי חמישי – ראשון
      let next = addDays(iso, 1)
      while ([5, 6].includes(new Date(next + 'T00:00').getDay())) next = addDays(next, 1)
      return next
    }
    case 'weekly':
      return addDays(iso, 7)
    case 'biweekly':
      return addDays(iso, 14)
    case 'monthly': {
      const last = new Date(y, m + 1, 0).getDate() // 31 בינואר → 28/29 בפברואר
      return toISODate(new Date(y, m, Math.min(d, last)))
    }
    case 'yearly': {
      const last = new Date(y + 1, m, 0).getDate()
      return toISODate(new Date(y + 1, m - 1, Math.min(d, last)))
    }
  }
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return toISODate(new Date(y, m - 1, d + days))
}

const weekday = new Intl.DateTimeFormat('he-IL', { weekday: 'long' })
const dayMonth = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short' })
const full = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })

function parse(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** תווית קצרה לתאריך יעד: "היום", "מחר", "יום שלישי", "12 בנוב׳" */
export function dueLabel(iso: string): string {
  const t = today()
  if (iso === t) return 'היום'
  if (iso === addDays(t, 1)) return 'מחר'
  if (iso === addDays(t, -1)) return 'אתמול'
  if (iso > t && iso <= addDays(t, 6)) return weekday.format(parse(iso))
  return dayMonth.format(parse(iso))
}

export function fullDateLabel(iso: string): string {
  const t = today()
  const base = full.format(parse(iso))
  if (iso === t) return `היום · ${base}`
  if (iso === addDays(t, 1)) return `מחר · ${base}`
  return base
}

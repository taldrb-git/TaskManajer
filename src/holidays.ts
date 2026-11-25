/**
 * חגים ישראליים ותאריך עברי – מחושבים מלוח השנה העברי המובנה בדפדפן (Intl, calendar: hebrew).
 * בלי ספרייה חיצונית ובלי אינטרנט.
 */
import { addDays } from './dates'

const parts = new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' })
const hebrewFullFmt = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' })

const parse = (iso: string) => new Date(iso + 'T12:00:00')
const weekday = (iso: string) => parse(iso).getDay()

/** יום וחודש עבריים (שמות חודשים באנגלית, לחישוב): { day: 15, month: 'Nisan', leap } */
function heb(iso: string): { day: number; month: string } {
  const p = parts.formatToParts(parse(iso))
  return { day: Number(p.find((x) => x.type === 'day')?.value), month: p.find((x) => x.type === 'month')?.value ?? '' }
}

const is = (iso: string, day: number, ...months: string[]) => {
  const h = heb(iso)
  return h.day === day && months.includes(h.month)
}

/** מספר בגימטריה: 15 → ט״ו, 787 → תשפ״ז, 9 → ט׳ */
export function gematria(n: number): string {
  const letters: [number, string][] = [
    [400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'],
    [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א'],
  ]
  let out = ''
  let rest = n % 1000
  while (rest > 0) {
    if (rest === 15) { out += 'טו'; break }
    if (rest === 16) { out += 'טז'; break }
    const [v, l] = letters.find(([v]) => v <= rest)!
    out += l
    rest -= v
  }
  return out.length === 1 ? `${out}׳` : `${out.slice(0, -1)}״${out.slice(-1)}`
}

/** "כסלו" → "בכסלו" (לפעמים הדפדפן כבר מוסיף את הב׳) */
const withB = (m: string) => (m.startsWith('ב') ? m : `ב${m}`)

function hebrewParts(iso: string) {
  const p = hebrewFullFmt.formatToParts(parse(iso))
  return {
    day: Number(p.find((x) => x.type === 'day')?.value),
    month: withB(p.find((x) => x.type === 'month')?.value ?? ''),
    year: Number(p.find((x) => x.type === 'year')?.value),
  }
}

/** תאריך עברי קצר: "ט׳ בכסלו" */
export function hebrewDate(iso: string): string {
  const h = hebrewParts(iso)
  return `${gematria(h.day)} ${h.month}`
}

/** תאריך עברי מלא: "ט׳ בכסלו תשפ״ז" */
export function hebrewDateFull(iso: string): string {
  const h = hebrewParts(iso)
  return `${gematria(h.day)} ${h.month} ${gematria(h.year)}`
}

const cache = new Map<string, string | null>()

/** שם החג / המועד ביום הזה, או null */
export function holidayOn(iso: string): string | null {
  if (cache.has(iso)) return cache.get(iso)!
  const r = compute(iso)
  cache.set(iso, r)
  return r
}

function compute(iso: string): string | null {
  const { day, month } = heb(iso)
  const wd = weekday(iso)

  switch (month) {
    case 'Tishri':
      if (day === 1 || day === 2) return 'ראש השנה'
      if (day === 3 && wd !== 6) return 'צום גדליה'
      if (day === 4 && wd === 0) return 'צום גדליה' // נדחה מהשבת
      if (day === 9) return 'ערב יום כיפור'
      if (day === 10) return 'יום כיפור'
      if (day === 14) return 'ערב סוכות'
      if (day === 15) return 'סוכות'
      if (day >= 16 && day <= 20) return 'חול המועד סוכות'
      if (day === 21) return 'הושענא רבה'
      if (day === 22) return 'שמחת תורה'
      break
    case 'Kislev':
      if (day >= 25) return 'חנוכה'
      break
    case 'Tevet': {
      // חנוכה: 8 ימים מכ״ה בכסלו – נגמר ב-ב׳ או ג׳ בטבת, לפי אורך כסלו
      for (let k = 1; k <= 7; k++) if (is(addDays(iso, -k), 25, 'Kislev')) return 'חנוכה'
      if (day === 10) return 'עשרה בטבת'
      break
    }
    case 'Shevat':
      if (day === 15) return 'ט״ו בשבט'
      break
    case 'Adar':
    case 'Adar II':
      if (day === 14) return 'פורים'
      if (day === 15) return 'שושן פורים'
      if (day === 13 && wd !== 6) return 'תענית אסתר'
      if (day === 11 && wd === 4) return 'תענית אסתר' // מוקדם לחמישי כשי״ג בשבת
      break
    case 'Nisan':
      if (day === 14) return 'ערב פסח'
      if (day === 15) return 'פסח'
      if (day >= 16 && day <= 20) return 'חול המועד פסח'
      if (day === 21) return 'שביעי של פסח'
      // יום השואה: כ״ז בניסן; שישי → חמישי, ראשון → שני
      if ((day === 27 && wd !== 5 && wd !== 0) || (day === 26 && wd === 4) || (day === 28 && wd === 1)) return 'יום השואה'
      break
    case 'Iyar': {
      const atz = independenceDay(iso)
      if (atz === 'atzmaut') return 'יום העצמאות'
      if (atz === 'zikaron') return 'יום הזיכרון'
      if (day === 18) return 'ל״ג בעומר'
      if (day === 28) return 'יום ירושלים'
      break
    }
    case 'Sivan':
      if (day === 5) return 'ערב שבועות'
      if (day === 6) return 'שבועות'
      break
    case 'Tamuz':
      if ((day === 17 && wd !== 6) || (day === 18 && wd === 0)) return 'י״ז בתמוז'
      break
    case 'Av':
      if ((day === 9 && wd !== 6) || (day === 10 && wd === 0)) return 'תשעה באב'
      if (day === 15) return 'ט״ו באב'
      break
    case 'Elul':
      if (day === 29) return 'ערב ראש השנה'
      break
  }
  return null
}

/**
 * יום העצמאות (ה׳ באייר) ויום הזיכרון (יום לפניו), עם ההזזות:
 * ה׳ באייר בשישי → חמישי (ד׳ באייר); בשבת → חמישי (ג׳ באייר); בשני → שלישי (ו׳ באייר).
 */
function independenceDay(iso: string): 'atzmaut' | 'zikaron' | null {
  // מחפשים את ה׳ באייר בטווח של כמה ימים סביב התאריך
  for (let k = -3; k <= 3; k++) {
    const d = addDays(iso, k)
    if (!is(d, 5, 'Iyar')) continue
    const wd = weekday(d)
    const shift = wd === 5 ? -1 : wd === 6 ? -2 : wd === 1 ? 1 : 0
    const atz = addDays(d, shift)
    if (iso === atz) return 'atzmaut'
    if (iso === addDays(atz, -1)) return 'zikaron'
  }
  return null
}

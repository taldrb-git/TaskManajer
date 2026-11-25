import { useEffect, useRef, useState } from 'react'

/* זיהוי דיבור מובנה בדפדפן (Web Speech API) – חינמי, עובד ב-Chrome, Edge ו-Safari */

interface RecognitionResult {
  isFinal: boolean
  0: { transcript: string }
}
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<RecognitionResult> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

const Ctor: (new () => Recognition) | undefined =
  typeof window !== 'undefined'
    ? ((window as unknown as Record<string, unknown>).SpeechRecognition ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as
        | (new () => Recognition)
        | undefined
    : undefined

export const speechSupported = !!Ctor

const ERRORS: Record<string, string> = {
  'not-allowed': 'אין הרשאה למיקרופון – אפשרו אותה בהגדרות הדפדפן',
  'service-not-allowed': 'אין הרשאה למיקרופון – אפשרו אותה בהגדרות הדפדפן',
  'no-speech': 'לא נשמע דיבור, נסו שוב',
  'audio-capture': 'לא נמצא מיקרופון',
  network: 'זיהוי הדיבור דורש חיבור לאינטרנט',
}

/** הקלטה אחת בעברית. onText נקרא תוך כדי דיבור (final=false) ובסוף (final=true) */
export function useSpeech(onText: (text: string, final: boolean) => void) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<Recognition | null>(null)
  const cb = useRef(onText)
  cb.current = onText

  useEffect(() => () => rec.current?.abort(), [])

  const start = () => {
    if (!Ctor || listening) return
    const r = new Ctor()
    r.lang = 'he-IL'
    r.interimResults = true
    r.continuous = false
    r.onresult = (e) => {
      let text = ''
      let final = false
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript
        if (e.results[i].isFinal) final = true
      }
      cb.current(text.trim(), final)
    }
    r.onerror = (e) => {
      if (e.error !== 'aborted') setError(ERRORS[e.error] ?? 'זיהוי הדיבור נכשל')
    }
    r.onend = () => setListening(false)
    rec.current = r
    setError(null)
    setListening(true)
    r.start()
  }

  const stop = () => rec.current?.stop()

  return { listening, error, start, stop }
}

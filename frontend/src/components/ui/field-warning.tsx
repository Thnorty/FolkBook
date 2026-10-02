import { useEffect, useReducer, useState } from 'react'
import { createPortal } from 'react-dom'
import { onWarning, validityText, type Field, type Warning } from '@/lib/fieldWarnings'

const WIDTH = 288 // max-w-72
const GUTTER = 16

const isField = (target: EventTarget | null): target is Field =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement

/**
 * Our own bubbles in place of the browser's validation popups, for every form, plus
 * any `warnAt` (lib/fieldWarnings). Mount once. Forms keep plain `required`,
 * `minLength` and so on.
 */
export function FieldWarnings() {
  const [warning, setWarning] = useState<Warning | null>(null)
  const [, redraw] = useReducer((count: number) => count + 1, 0)

  useEffect(() => {
    // A submit fires `invalid` on every failing field; point at the first one only.
    let pointed = false
    const onInvalid = (event: Event) => {
      event.preventDefault() // no browser popup
      if (!isField(event.target) || pointed) return
      pointed = true
      setTimeout(() => (pointed = false))
      event.target.focus()
      setWarning({ field: event.target, text: validityText(event.target) })
    }
    const stopListening = onWarning(setWarning)
    document.addEventListener('invalid', onInvalid, true)
    return () => {
      stopListening()
      document.removeEventListener('invalid', onInvalid, true)
    }
  }, [])

  useEffect(() => {
    if (!warning) return
    const { field } = warning
    const clear = () => setWarning(null)
    field.setAttribute('aria-invalid', 'true')
    // Gone once you act on it: typing, selecting (for "select some words") or leaving.
    field.addEventListener('input', clear)
    field.addEventListener('select', clear)
    field.addEventListener('blur', clear)
    // A click or tap anywhere, or Esc, moves on too (and a closing dialog takes it along).
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && clear()
    document.addEventListener('pointerdown', clear, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', redraw, true)
    window.addEventListener('resize', redraw)
    return () => {
      document.removeEventListener('pointerdown', clear, true)
      document.removeEventListener('keydown', onKey, true)
      field.removeAttribute('aria-invalid')
      field.removeEventListener('input', clear)
      field.removeEventListener('select', clear)
      field.removeEventListener('blur', clear)
      window.removeEventListener('scroll', redraw, true)
      window.removeEventListener('resize', redraw)
    }
  }, [warning])

  if (!warning?.field.isConnected) return null
  const box = (warning.anchor ?? warning.field).getBoundingClientRect()
  const left = Math.max(GUTTER, Math.min(box.left, window.innerWidth - GUTTER - WIDTH))
  return createPortal(
    <div
      role="alert"
      style={{ top: box.bottom + 8, left }}
      className="pointer-events-none fixed z-50 max-w-72 animate-fade-in rounded-card bg-inverse px-3 py-2 text-md text-on-inverse shadow-float"
    >
      <span
        aria-hidden
        style={{ left: Math.max(12, Math.min(box.left - left + 12, WIDTH - 24)) }}
        className="absolute -top-1 size-2.5 rotate-45 bg-inverse"
      />
      {warning.text}
    </div>,
    document.body,
  )
}

import { formatDay } from './dates'

export type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
export type Warning = { field: HTMLElement; text: string }

let show: ((warning: Warning) => void) | undefined

/** Point at a field with a short warning in our own bubble: "Select some words first." */
export function warnAt(field: HTMLElement, text: string) {
  show?.({ field, text })
}

/** For <FieldWarnings>, which shows them. Returns how to stop listening. */
export function onWarning(listener: (warning: Warning) => void): () => void {
  show = listener
  return () => {
    show = undefined
  }
}

/** Why a field doesn't pass, in our words rather than the browser's. */
export function validityText(field: Field): string {
  const { validity } = field
  if (validity.customError) return field.validationMessage
  if (validity.valueMissing) {
    return field instanceof HTMLSelectElement ? 'Pick one first.' : 'Fill this in first.'
  }
  if (validity.typeMismatch && field.type === 'email') {
    return "That doesn't look like an email address."
  }
  if (validity.tooShort && !(field instanceof HTMLSelectElement)) {
    return `Use at least ${field.minLength} characters.`
  }
  if (validity.rangeOverflow && field instanceof HTMLInputElement && field.type === 'date') {
    return `Pick ${formatDay(field.max)} or earlier.`
  }
  return field.validationMessage
}

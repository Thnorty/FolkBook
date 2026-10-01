/** A birthday as the form holds it: what was typed, as text. */
export type BirthdayValue = { day: string; month: string; year: string }

/** The birthday as the API takes it; nothing until both day and month are set. */
export function birthdayInput({ day, month, year }: BirthdayValue) {
  return Number(day) && Number(month)
    ? { day: Number(day), month: Number(month), year: Number(year) || null }
    : null
}

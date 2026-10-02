import { describe, expect, it } from 'vitest'
import { validityText } from './fieldWarnings'

function input(attributes: Record<string, string>, value = '') {
  const field = document.createElement('input')
  for (const [name, attribute] of Object.entries(attributes)) field.setAttribute(name, attribute)
  field.value = value
  return field
}

describe('validityText', () => {
  it('says what to fix in our own words', () => {
    expect(validityText(input({ required: '' }))).toBe('Fill this in first.')
    expect(validityText(input({ type: 'email' }, 'ela@'))).toBe(
      "That doesn't look like an email address.",
    )
    expect(validityText(input({ type: 'date', max: '2026-09-22' }, '2026-09-30'))).toMatch(
      /^Pick .*2026 or earlier\.$/,
    )
  })

  it("passes on a form's own message", () => {
    const field = input({})
    field.setCustomValidity("The passwords don't match.")
    expect(validityText(field)).toBe("The passwords don't match.")
  })
})

import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('keeps a text size and a text color together', () => {
    expect(cn('text-input text-ink')).toBe('text-input text-ink')
    expect(cn('text-md text-on-accent')).toBe('text-md text-on-accent')
  })

  it('lets a later class replace a conflicting one', () => {
    expect(cn('text-md', 'text-input')).toBe('text-input')
    expect(cn('text-ink', 'text-danger')).toBe('text-danger')
    expect(cn('shadow-paper', 'shadow-note')).toBe('shadow-note')
    expect(cn('rounded-card', 'rounded-tab')).toBe('rounded-tab')
  })
})

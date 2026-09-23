import { describe, expect, it } from 'vitest'
import { safeRedirect } from './redirect'

describe('safeRedirect', () => {
  it.each([
    ['/people', '/people'],
    ['/spaces/abc?tab=members', '/spaces/abc?tab=members'],
    ['https://evil.example', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'], // browsers read /\ like //
    ['javascript:alert(1)', '/'],
    [undefined, '/'],
  ])('%s → %s', (target, expected) => {
    expect(safeRedirect(target)).toBe(expected)
  })
})

import { describe, expect, it } from 'vitest'
import { validateGraphSearch } from './search'

describe('validateGraphSearch', () => {
  it('keeps a route or a focus, never both', () => {
    expect(validateGraphSearch({ how: 'tom', focus: 'emma', x: 1 })).toEqual({ how: 'tom' })
    expect(validateGraphSearch({ focus: 'emma' })).toEqual({ focus: 'emma' })
  })

  it('drops anything that isn’t a name', () => {
    expect(validateGraphSearch({ how: 3, focus: '' })).toEqual({})
    expect(validateGraphSearch({ how: '', focus: ['emma'] })).toEqual({})
  })
})

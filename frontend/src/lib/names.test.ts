import { describe, expect, it } from 'vitest'
import { fold, initials } from './names'

describe('initials', () => {
  it('takes the first and last names, in any script case', () => {
    expect(initials('Emma Yılmaz')).toBe('EY')
    expect(initials('Ela')).toBe('E')
    expect(initials('şükrü öztürk')).toBe('ŞÖ')
    expect(initials('Anna Maria van der Berg')).toBe('AB')
  })
})

describe('fold', () => {
  it('ignores case and accents, Turkish letters included', () => {
    expect(fold('Ayşe YILMAZ')).toBe('ayse yilmaz')
    expect(fold('Şükrü Öztürk')).toBe(fold('sukru ozturk'))
  })
})

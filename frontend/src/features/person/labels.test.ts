import { describe, expect, it } from 'vitest'
import { step } from '@/test/familyTree'
import { relationChainLabel } from './labels'

describe('relationChainLabel', () => {
  it('joins the steps, in the words their pronouns give', () => {
    expect(relationChainLabel([step('grandparent', 'she'), step('cousin', 'he')])).toBe(
      "grandmother's cousin",
    )
  })

  it('stays neutral without pronouns', () => {
    expect(relationChainLabel([step('grandparent'), step('cousin')])).toBe("grandparent's cousin")
  })

  it('says former when the last step ended', () => {
    expect(relationChainLabel([step('sibling_in_law', 'she', { former: true })])).toBe(
      'former sister-in-law',
    )
  })

  it('says relative past what has words, and nothing for the tree’s own person', () => {
    expect(relationChainLabel([step('relative')])).toBe('relative')
    expect(relationChainLabel([])).toBe('')
  })
})

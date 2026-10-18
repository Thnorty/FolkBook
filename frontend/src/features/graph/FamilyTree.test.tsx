import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ELAS_TREE } from '@/test/familyTree'
import { FamilyTree } from './FamilyTree'

const ALL = { formerPartners: true, inLaws: true }

function draw(selected: string | null = null) {
  const onSelect = vi.fn()
  const onAddParent = vi.fn()
  render(
    <FamilyTree
      data={ELAS_TREE}
      toggles={ALL}
      selected={selected}
      onSelect={onSelect}
      onAddParent={onAddParent}
    />,
  )
  return { onSelect, onAddParent, tree: screen.getByRole('region', { name: 'Family tree' }) }
}

const translateOf = (tree: HTMLElement) => {
  const moving = tree.querySelector<HTMLElement>('[data-tree-view]')!
  const [, x, y] = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(moving.style.transform)!
  return [Number(x), Number(y)]
}

const scaleOf = (tree: HTMLElement) => {
  const moving = tree.querySelector<HTMLElement>('[data-tree-view]')!
  return Number(/scale\(([\d.]+)\)/.exec(moving.style.transform)?.[1])
}

describe('FamilyTree', () => {
  it('shows each person as a button with how they’re related', async () => {
    const { onSelect, tree } = draw()

    await userEvent.click(within(tree).getByRole('button', { name: 'Leyla Demir, grandmother' }))
    expect(onSelect).toHaveBeenCalledWith('leyla')
    expect(within(tree).getByRole('button', { name: 'Ela Demir, Me' })).toBeInTheDocument()
    expect(
      within(tree).getByRole('button', { name: 'Zeynep Demir, sister-in-law' }),
    ).toBeInTheDocument()
  })

  it('marks the open person', () => {
    const { tree } = draw('can')
    expect(within(tree).getByRole('button', { name: 'Can Demir, brother' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('offers missing parents as slots', async () => {
    const { onAddParent, tree } = draw()

    const slots = within(tree).getAllByRole('button', { name: 'Add parent of Nilgün Aksoy' })
    expect(slots).toHaveLength(2)
    await userEvent.click(slots[0])
    expect(onAddParent).toHaveBeenCalledWith('nilgun')
  })

  it('names its rows and explains its lines', () => {
    const { tree } = draw()
    expect(within(tree).getByText('Grandparents')).toBeInTheDocument()
    expect(within(tree).getByText('Your generation')).toBeInTheDocument()
    const legend = within(tree).getByRole('list', { name: 'Legend' })
    for (const words of [
      'parent · partner',
      'former',
      'missing — click to add',
      'step · adoptive',
    ]) {
      expect(within(legend).getByText(words)).toBeInTheDocument()
    }
  })

  it('pans by dragging, even from someone, without opening them', () => {
    const { onSelect, tree } = draw()
    const leyla = within(tree).getByRole('button', { name: 'Leyla Demir, grandmother' })
    const before = translateOf(tree)

    fireEvent.pointerDown(leyla, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(tree, { pointerId: 1, clientX: 160, clientY: 130 })
    fireEvent.pointerUp(tree, { pointerId: 1, clientX: 160, clientY: 130 })
    fireEvent.click(leyla)

    expect(translateOf(tree)).toEqual([before[0] + 60, before[1] + 30])
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.click(leyla) // a plain click still opens them
    expect(onSelect).toHaveBeenCalledWith('leyla')
  })

  it('zooms with two fingers', () => {
    const { tree } = draw()
    const start = scaleOf(tree)

    fireEvent.pointerDown(tree, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerDown(tree, { pointerId: 2, clientX: 200, clientY: 100 })
    fireEvent.pointerMove(tree, { pointerId: 2, clientX: 250, clientY: 100 })

    expect(scaleOf(tree)).toBeCloseTo(start * 1.5)
  })

  it('zooms a little with each wheel turn, and keeps the page still', () => {
    const { tree } = draw()
    const start = scaleOf(tree)

    const wheel = new WheelEvent('wheel', { deltaY: -10, bubbles: true, cancelable: true })
    act(() => {
      tree.dispatchEvent(wheel)
    })

    expect(wheel.defaultPrevented).toBe(true)
    expect(scaleOf(tree)).toBeGreaterThan(start)
    expect(scaleOf(tree)).toBeLessThan(start * 1.05)
  })

  it('zooms in and out, and fits', async () => {
    const { tree } = draw()
    const start = scaleOf(tree)

    await userEvent.click(within(tree).getByRole('button', { name: 'Zoom in' }))
    expect(scaleOf(tree)).toBeGreaterThan(start)
    await userEvent.click(within(tree).getByRole('button', { name: 'Zoom out' }))
    await userEvent.click(within(tree).getByRole('button', { name: 'Zoom out' }))
    expect(scaleOf(tree)).toBeLessThan(start)
    await userEvent.click(within(tree).getByRole('button', { name: 'Fit' }))
    expect(scaleOf(tree)).toBe(start)
  })
})

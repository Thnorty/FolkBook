import { render, screen, within } from '@testing-library/react'
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

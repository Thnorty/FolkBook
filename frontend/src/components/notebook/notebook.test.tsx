import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PersonCard } from './PersonCard'
import { SpaceChip, SpaceTab } from './spaces'
import { StickyNote } from './StickyNote'
import { TimelineItem } from './TimelineItem'

describe('PersonCard', () => {
  it('shows the name, how you met, spaces and meta', () => {
    render(
      <PersonCard
        id="1"
        name="Emma Yılmaz"
        detail="University, Istanbul · 2015"
        spaces={[
          { id: 's1', name: 'Friends', color: 'sage' },
          { id: 's2', name: 'Hackathon 2026', color: 'plum', shared: true },
        ]}
        meta="10 days ago"
      />,
    )

    const card = screen.getByRole('article', { name: 'Emma Yılmaz' })
    expect(within(card).getByText('University, Istanbul · 2015')).toBeInTheDocument()
    expect(within(card).getByText('10 days ago')).toBeInTheDocument()
    // Each space is there twice: a ribbon for phones and a chip for wider screens.
    // CSS shows one of them (jsdom renders both).
    const [friends, hackathon] = within(card).getAllByRole('listitem')
    expect(within(friends).getAllByText('Friends')).toHaveLength(2)
    expect(within(hackathon).getAllByText(/Hackathon 2026/)).toHaveLength(2)
    expect(within(hackathon).getAllByText(/shared/)).toHaveLength(2)
  })

  it('leaves out what it has no data for', () => {
    render(<PersonCard id="1" name="Oskar" />)

    expect(screen.queryByRole('list', { name: 'Spaces' })).not.toBeInTheDocument()
  })

  it('shows the photo when there is one', () => {
    render(<PersonCard id="1" name="Oskar" photoUrl="/media/oskar.jpg" />)

    expect(screen.getByRole('article').querySelector('img')).toHaveAttribute(
      'src',
      '/media/oskar.jpg',
    )
  })
})

describe('spaces', () => {
  it('tells screen readers a space is shared', () => {
    render(<SpaceChip name="Climbing club" color="teal" shared />)

    expect(screen.getByText('(shared)')).toHaveClass('sr-only')
  })

  it('marks the active tab and reports clicks', async () => {
    const onSelect = vi.fn()
    render(
      <>
        <SpaceTab name="Family" color="clay" active />
        <SpaceTab name="Work" color="ochre" onSelect={onSelect} />
      </>,
    )

    expect(screen.getByRole('button', { name: 'Family' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Work' }))
    expect(onSelect).toHaveBeenCalledOnce()
  })
})

describe('StickyNote', () => {
  it('keeps the same tilt for the same note', () => {
    const { rerender } = render(<StickyNote seed="aid-1">Peanut allergy</StickyNote>)
    const first = screen.getByText('Peanut allergy').parentElement!.style.rotate

    rerender(<StickyNote seed="aid-1">Peanut allergy — always ask</StickyNote>)

    expect(first).not.toBe('')
    expect(screen.getByText('Peanut allergy — always ask').parentElement!.style.rotate).toBe(first)
  })
})

describe('TimelineItem', () => {
  it('shows the date as a machine-readable time', () => {
    render(
      <ol>
        <TimelineItem date="2026-09-12" kind="Coffee" title="Coffee at Kronotrop">
          Showed me the drawings.
        </TimelineItem>
      </ol>,
    )

    const item = screen.getByRole('listitem')
    expect(item.querySelector('time')).toHaveAttribute('datetime', '2026-09-12')
    expect(within(item).getByText(/Coffee$/)).toBeInTheDocument()
    expect(within(item).getByText('Coffee at Kronotrop')).toBeInTheDocument()
    expect(within(item).getByText('Showed me the drawings.')).toBeInTheDocument()
  })
})

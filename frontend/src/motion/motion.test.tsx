import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { AnimatePresence } from 'motion/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { setAppearance } from '@/lib/appearance'
import { InkUnderline } from './InkUnderline'
import { MotionProvider } from './MotionProvider'
import { PhotoDrop } from './PhotoDrop'
import { StickAndPeel } from './StickAndPeel'
import { useReducedMotion } from './useReducedMotion'

afterEach(() => {
  setAppearance({ motion: 'system' })
  localStorage.clear()
})

function Notes({ children }: { children?: ReactNode }) {
  return (
    <MotionProvider>
      <ul>
        <AnimatePresence>{children}</AnimatePresence>
      </ul>
    </MotionProvider>
  )
}

function Reduced() {
  return <p>{useReducedMotion() ? 'reduced' : 'full'}</p>
}

describe('reduced motion', () => {
  it('turns on with the in-app setting', () => {
    render(<Reduced />)
    expect(screen.getByText('full')).toBeInTheDocument()

    act(() => setAppearance({ motion: 'reduce' }))

    expect(screen.getByText('reduced')).toBeInTheDocument()
  })

  it('draws the ink underline from nothing, or shows it drawn when reduced', () => {
    const { container, unmount } = render(
      <MotionProvider>
        <InkUnderline />
      </MotionProvider>,
    )
    expect((container.firstElementChild as HTMLElement).style.transform).toBe('scaleX(0)')
    unmount()

    act(() => setAppearance({ motion: 'reduce' }))
    const reduced = render(
      <MotionProvider>
        <InkUnderline />
      </MotionProvider>,
    )
    expect((reduced.container.firstElementChild as HTMLElement).style.transform).not.toBe(
      'scaleX(0)',
    )
  })

  it('drops a sticky note on from a tilt, or fades it in when reduced', () => {
    const { unmount } = render(
      <Notes>
        <StickAndPeel>Arda</StickAndPeel>
      </Notes>,
    )
    expect(screen.getByRole('listitem').style.transform).toContain('rotate(-10deg)')
    unmount()

    act(() => setAppearance({ motion: 'reduce' }))
    render(
      <Notes>
        <StickAndPeel>Arda</StickAndPeel>
      </Notes>,
    )
    const note = screen.getByRole('listitem')
    expect(note.style.opacity).toBe('0')
    expect(note.style.transform).not.toContain('rotate')
  })

  it('peels a removed sticky note off before it goes', async () => {
    const { rerender } = render(
      <Notes>
        <StickAndPeel key="arda">Arda</StickAndPeel>
      </Notes>,
    )
    await act(() => import('./features'))
    rerender(<Notes />)

    expect(screen.getByRole('listitem')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('listitem')).not.toBeInTheDocument())
  })

  it('drops a new photo in from a tilt, or fades it in when reduced', () => {
    const photo = (drop: boolean) =>
      render(
        <MotionProvider>
          <PhotoDrop drop={drop}>photo</PhotoDrop>
        </MotionProvider>,
      ).container.firstElementChild as HTMLElement

    expect(photo(false).style.transform).not.toContain('rotate')
    cleanup()
    expect(photo(true).style.transform).toContain('rotate(-12deg)')
    cleanup()

    act(() => setAppearance({ motion: 'reduce' }))
    const reduced = photo(true)
    expect(reduced.style.opacity).toBe('0')
    expect(reduced.style.transform).not.toContain('rotate')
  })
})

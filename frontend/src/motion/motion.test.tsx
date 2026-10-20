import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { AnimatePresence } from 'motion/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { setAppearance } from '@/lib/appearance'
import { FallingLetters } from './FallingLetters'
import { InkUnderline } from './InkUnderline'
import { MotionProvider } from './MotionProvider'
import { PaperConfetti } from './PaperConfetti'
import { PhotoDrop } from './PhotoDrop'
import { Stamp } from './Stamp'
import { RollingNumber } from './RollingNumber'
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

  it('presses a stamp on from bigger than life, or fades it in when reduced', () => {
    const stamp = () =>
      render(
        <MotionProvider>
          <Stamp>Logged</Stamp>
        </MotionProvider>,
      ).getByText('Logged')

    expect(stamp().style.transform).toContain('scale(1.5)')
    cleanup()

    act(() => setAppearance({ motion: 'reduce' }))
    const reduced = stamp()
    expect(reduced.style.opacity).toBe('0')
    expect(reduced.style.transform).not.toContain('scale')
  })

  it('rolls a count up to its new value, the old one hidden from screen readers', async () => {
    const count = (value: number) => (
      <MotionProvider>
        <RollingNumber value={value} />
      </MotionProvider>
    )
    const { rerender } = render(count(2))
    expect(screen.getByText('2').style.transform).not.toContain('translate')
    await act(() => import('./features'))

    rerender(count(3))
    expect(screen.getByText('3').style.transform).toContain('translateY(100%)')
    expect(screen.getByText('2')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('3')).not.toHaveAttribute('aria-hidden')
    await waitFor(() => expect(screen.queryByText('2')).not.toBeInTheDocument())

    rerender(count(1))
    expect(screen.getByText('1').style.transform).toContain('translateY(-100%)')
  })

  it('swaps a count with a fade when motion is reduced', async () => {
    act(() => setAppearance({ motion: 'reduce' }))
    const count = (value: number) => (
      <MotionProvider>
        <RollingNumber value={value} />
      </MotionProvider>
    )
    const { rerender } = render(count(2))
    await act(() => import('./features'))
    rerender(count(3))
    expect(screen.getByText('3').style.opacity).toBe('0')
    expect(screen.getByText('3').style.transform).not.toContain('translate')
  })

  it('drops the letters of a word off the line, or fades them in place when reduced', () => {
    const letters = () =>
      render(
        <MotionProvider>
          <FallingLetters text="zoe" />
        </MotionProvider>,
      )
    const { unmount } = letters()
    // They start upright on the line and fall from there.
    expect(screen.getByText('z').style.transform).not.toContain('rotate')
    unmount()

    act(() => setAppearance({ motion: 'reduce' }))
    letters()
    expect(screen.getByText('z').style.opacity).toBe('0')
    expect(screen.getByText('z').style.transform).not.toContain('translate')
  })

  it('shows letters typed afterwards already fallen, without dropping them again', () => {
    const letters = (text: string) => (
      <MotionProvider>
        <FallingLetters text={text} />
      </MotionProvider>
    )
    const { rerender } = render(letters('zo'))
    rerender(letters('zoe'))
    expect(screen.getByText('e').style.transform).toContain('rotate')
  })

  it('lets paper fall on a birthday, but none when reduced', () => {
    const paper = () =>
      render(
        <MotionProvider>
          <PaperConfetti seed="emma" />
        </MotionProvider>,
      ).container.querySelectorAll('[data-confetti] > span')

    expect(paper().length).toBeGreaterThan(0)
    cleanup()

    act(() => setAppearance({ motion: 'reduce' }))
    expect(paper()).toHaveLength(0)
  })
})

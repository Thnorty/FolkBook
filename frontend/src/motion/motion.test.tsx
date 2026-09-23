import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { setAppearance } from '@/lib/appearance'
import { InkUnderline } from './InkUnderline'
import { MotionProvider } from './MotionProvider'
import { useReducedMotion } from './useReducedMotion'

afterEach(() => {
  setAppearance({ motion: 'system' })
  localStorage.clear()
})

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
})

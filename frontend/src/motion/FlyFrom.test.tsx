import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setAppearance } from '@/lib/appearance'
import { FlyFrom } from './FlyFrom'

const card = new DOMRect(100, 300, 44, 44)

afterEach(() => {
  setAppearance({ motion: 'system' })
  localStorage.clear()
  vi.restoreAllMocks()
})

function measureAs(rect: DOMRect) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect)
}

describe('FlyFrom', () => {
  it('flies a copy above the page, then shows the real content', async () => {
    measureAs(new DOMRect(900, 100, 112, 140))
    const { unmount } = render(
      <FlyFrom from={card}>
        <p>Emma</p>
      </FlyFrom>,
    )

    // The copy travels above everything (the panel would clip it); screen readers skip it.
    const copy = document.querySelector<HTMLElement>('[data-flying]')!
    expect(copy).toBeInTheDocument()
    expect(copy).toHaveAttribute('aria-hidden', 'true')
    expect(copy.style.position).toBe('fixed')
    expect(
      screen.getByText('Emma', { selector: ':not([data-flying] *)' }).parentElement,
    ).toHaveStyle({ visibility: 'hidden' })

    unmount()
    expect(document.querySelector('[data-flying]')).toBeNull()
  })

  it('lands: the copy goes and the real content shows', async () => {
    measureAs(new DOMRect(900, 100, 112, 140))
    render(
      <FlyFrom from={card}>
        <p>Emma</p>
      </FlyFrom>,
    )

    await act(() => new Promise((resolve) => setTimeout(resolve, 600)))

    expect(document.querySelector('[data-flying]')).toBeNull()
    expect(screen.getByText('Emma').parentElement).not.toHaveStyle({ visibility: 'hidden' })
  })

  it('does not fly with reduced motion, or without a starting point', () => {
    measureAs(new DOMRect(900, 100, 112, 140))
    setAppearance({ motion: 'reduce' })
    const { unmount } = render(
      <FlyFrom from={card}>
        <p>Emma</p>
      </FlyFrom>,
    )
    expect(document.querySelector('[data-flying]')).toBeNull()
    unmount()

    setAppearance({ motion: 'system' })
    render(
      <FlyFrom>
        <p>Emma</p>
      </FlyFrom>,
    )
    expect(document.querySelector('[data-flying]')).toBeNull()
  })
})

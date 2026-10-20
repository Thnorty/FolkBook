import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MotionProvider } from '@/motion/MotionProvider'
import { FormDialog } from './form-dialog'

function Sheet({ onClose }: { onClose: () => void }) {
  return (
    <MotionProvider>
      <FormDialog
        small
        title="Log with Emma"
        formId="log"
        submitLabel="Save"
        busy={false}
        onClose={onClose}
      >
        <form id="log">
          <textarea aria-label="Note" />
        </form>
      </FormDialog>
    </MotionProvider>
  )
}

/** Press on `from`, move the pointer down by `by` pixels, let go. */
async function dragDown(from: HTMLElement, by: number) {
  const at = {
    clientX: 100,
    clientY: 100,
    pageX: 100,
    pageY: 100,
    pointerId: 1,
    isPrimary: true,
    button: 0,
  }
  fireEvent.pointerDown(from, at)
  for (let step = 1; step <= 4; step++) {
    const y = 100 + (by * step) / 4
    fireEvent.pointerMove(window, { ...at, clientY: y, pageY: y })
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
  }
  fireEvent.pointerUp(window, { ...at, clientY: 100 + by, pageY: 100 + by })
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
}

describe('FormDialog on a phone', () => {
  it('closes when the sheet is dragged down by its title', async () => {
    const onClose = vi.fn()
    render(<Sheet onClose={onClose} />)
    await act(() => import('@/motion/features'))

    await dragDown(screen.getByRole('heading', { name: 'Log with Emma' }), 300)

    expect(onClose).toHaveBeenCalled()
  })

  it("doesn't start a drag from inside the form", async () => {
    const onClose = vi.fn()
    render(<Sheet onClose={onClose} />)
    await act(() => import('@/motion/features'))

    await dragDown(screen.getByRole('textbox', { name: 'Note' }), 300)

    expect(onClose).not.toHaveBeenCalled()
  })
})

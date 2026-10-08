import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { isApplePlatform, shortcutLabel, useShortcut, type Shortcut } from './shortcuts'

const apple = { platform: 'MacIntel' } as Navigator
const windows = { platform: 'Win32' } as Navigator

describe('shortcut labels', () => {
  it('use symbols on Apple devices and words elsewhere', () => {
    expect(isApplePlatform(apple)).toBe(true)
    expect(isApplePlatform(windows)).toBe(false)
    expect(shortcutLabel({ key: 'k', mod: true }, true)).toBe('⌘K')
    expect(shortcutLabel({ key: 'n', shift: true }, true)).toBe('⇧N')
    expect(shortcutLabel({ key: 'k', mod: true }, false)).toBe('Ctrl+K')
    expect(shortcutLabel({ key: 'n', shift: true }, false)).toBe('Shift+N')
    expect(shortcutLabel({ key: 'n' }, false)).toBe('N')
    expect(shortcutLabel({ key: 'Enter', mod: true }, false)).toBe('Ctrl+Enter')
    expect(shortcutLabel({ key: 'Enter', mod: true }, true)).toBe('⌘Enter')
    expect(shortcutLabel({ key: 'ArrowRight', mod: true }, false)).toBe('Ctrl+→')
  })
})

function Harness({
  shortcut,
  action,
  whileTyping,
}: {
  shortcut: Shortcut
  action: () => void
  whileTyping?: boolean
}) {
  useShortcut(shortcut, action, { whileTyping })
  return (
    <>
      <input aria-label="Name" />
      <div role="dialog" aria-label="Open dialog">
        <button>OK</button>
      </div>
    </>
  )
}

describe('useShortcut', () => {
  // jsdom reports a non-Apple platform, so the command key is Ctrl here.
  it('runs on its key and not on others', () => {
    const action = vi.fn()
    render(<Harness shortcut={{ key: 'n' }} action={action} />)

    fireEvent.keyDown(window, { key: 'n' })
    fireEvent.keyDown(window, { key: 'N', shiftKey: true })
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'm' })

    expect(action).toHaveBeenCalledOnce()
  })

  it('tells N and Shift+N apart', () => {
    const action = vi.fn()
    render(<Harness shortcut={{ key: 'n', shift: true }} action={action} />)

    fireEvent.keyDown(window, { key: 'n' })
    fireEvent.keyDown(window, { key: 'N', shiftKey: true })

    expect(action).toHaveBeenCalledOnce()
  })

  it('ignores plain letters typed into a field', () => {
    const action = vi.fn()
    render(<Harness shortcut={{ key: 'n' }} action={action} />)

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name' }), { key: 'n' })

    expect(action).not.toHaveBeenCalled()
  })

  it('still runs Ctrl shortcuts from a field, instead of the browser default', () => {
    const action = vi.fn()
    render(<Harness shortcut={{ key: 'k', mod: true }} action={action} />)

    const event = fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name' }), {
      key: 'k',
      ctrlKey: true,
    })

    expect(action).toHaveBeenCalledOnce()
    expect(event).toBe(false) // default prevented
  })

  it('leaves plain keys pressed inside a dialog to the dialog', () => {
    const plain = vi.fn()
    const withCtrl = vi.fn()
    render(<Harness shortcut={{ key: '1' }} action={plain} />)
    render(<Harness shortcut={{ key: 'k', mod: true }} action={withCtrl} />)
    const [ok] = screen.getAllByRole('button', { name: 'OK' })

    fireEvent.keyDown(ok, { key: '1' })
    fireEvent.keyDown(ok, { key: 'k', ctrlKey: true })

    expect(plain).not.toHaveBeenCalled()
    expect(withCtrl).toHaveBeenCalledOnce() // e.g. Ctrl+K closes the palette from inside it
  })

  it('can leave a Ctrl shortcut to the field being typed in', () => {
    const action = vi.fn()
    render(
      <Harness shortcut={{ key: 'ArrowRight', mod: true }} action={action} whileTyping={false} />,
    )

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name' }), {
      key: 'ArrowRight',
      ctrlKey: true,
    })
    expect(action).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true })
    expect(action).toHaveBeenCalledOnce()
  })
})

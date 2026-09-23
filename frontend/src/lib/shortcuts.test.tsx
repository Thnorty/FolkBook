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
  })
})

function Harness({ shortcut, action }: { shortcut: Shortcut; action: () => void }) {
  useShortcut(shortcut, action)
  return <input aria-label="Name" />
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
})

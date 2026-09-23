import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyAppearance, setAppearance, useAppearance } from './appearance'

const KEY = 'folkbook.appearance'
const root = document.documentElement

afterEach(() => {
  setAppearance({ theme: 'system', motion: 'system' })
  localStorage.clear()
  vi.restoreAllMocks()
})

function Show() {
  const { theme, motion } = useAppearance()
  return <p>{`${theme} ${motion}`}</p>
}

describe('appearance', () => {
  it('follows the device until something is chosen', () => {
    applyAppearance()

    expect(root.dataset.theme).toBeUndefined()
    expect(root.dataset.motion).toBeUndefined()
  })

  it('applies a choice to the page, remembers it, and updates what shows it', () => {
    render(<Show />)

    act(() => setAppearance({ theme: 'dark', motion: 'reduce' }))

    expect(root.dataset.theme).toBe('dark')
    expect(root.dataset.motion).toBe('reduce')
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ theme: 'dark', motion: 'reduce' })
    expect(screen.getByText('dark reduce')).toBeInTheDocument()
  })

  it('restores the saved choice on the next visit', () => {
    localStorage.setItem(KEY, JSON.stringify({ theme: 'light', motion: 'reduce' }))

    applyAppearance()

    expect(root.dataset.theme).toBe('light')
    expect(root.dataset.motion).toBe('reduce')
  })

  it('ignores saved values it does not know', () => {
    localStorage.setItem(KEY, JSON.stringify({ theme: 'neon', motion: 42 }))
    applyAppearance()
    expect(root.dataset.theme).toBeUndefined()

    localStorage.setItem(KEY, 'not json')
    applyAppearance()
    expect(root.dataset.motion).toBeUndefined()
  })

  it('still works when the browser blocks storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    applyAppearance()
    setAppearance({ theme: 'dark' })

    expect(root.dataset.theme).toBe('dark')
  })
})

describe('status bar color', () => {
  function addMetas() {
    for (const scheme of ['light', 'dark']) {
      const meta = document.createElement('meta')
      meta.name = 'theme-color'
      meta.dataset.scheme = scheme
      meta.media = `(prefers-color-scheme: ${scheme})`
      document.head.append(meta)
    }
    return [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')]
  }

  it('follows the picked theme, and the OS again on System', () => {
    const [light, dark] = addMetas()

    setAppearance({ theme: 'dark' })
    expect([light.media, dark.media]).toEqual(['not all', 'all'])

    setAppearance({ theme: 'system' })
    expect([light.media, dark.media]).toEqual([
      '(prefers-color-scheme: light)',
      '(prefers-color-scheme: dark)',
    ])
    light.remove()
    dark.remove()
  })
})

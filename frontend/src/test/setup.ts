import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom lacks pointer capture (toast swipes, Radix menus), scrollIntoView and
// ResizeObserver (the command palette list).
Element.prototype.setPointerCapture ??= () => {}
Element.prototype.releasePointerCapture ??= () => {}
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.scrollIntoView ??= () => {}
// …and object URLs for picked photos (Vitest's own can't read jsdom's File).
URL.createObjectURL = () => 'blob:test'
URL.revokeObjectURL = () => {}
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

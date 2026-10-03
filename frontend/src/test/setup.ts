import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { toast } from 'sonner'
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

// Whole-app tests wait for pages that load lazily (the graph); on a busy machine with
// every file running at once that can pass the default 1s.
configure({ asyncUtilTimeout: 3000 })

afterEach(() => {
  toast.dismiss() // toasts live outside React, so one test's would show up in the next
  cleanup()
  vi.unstubAllGlobals()
})

// jsdom has no WebGL, and loading three.js takes seconds: the graph canvas becomes a
// list of its nodes (buttons) and lines, which is what tests check anyway.
vi.mock('reagraph', async () => {
  const React = await import('react')
  type Node = { id: string; label: string }
  type Edge = { id: string; source: string; target: string; label?: string; dashed?: boolean }
  return {
    GraphCanvas: React.forwardRef(function FakeCanvas(
      props: {
        nodes: Node[]
        edges: Edge[]
        onNodeClick: (node: Node) => void
        onEdgeClick: (edge: Edge) => void
      },
      ref,
    ) {
      React.useImperativeHandle(ref, () => ({ zoomIn() {}, zoomOut() {}, fitNodesInView() {} }))
      return React.createElement(
        'div',
        { 'aria-label': 'Network' },
        props.nodes.map((node) =>
          React.createElement(
            'button',
            {
              key: node.id,
              onClick: () => props.onNodeClick(node),
            },
            node.label,
          ),
        ),
        React.createElement(
          'ul',
          { 'aria-label': 'Lines' },
          props.edges.map((edge) =>
            React.createElement(
              'li',
              { key: edge.id },
              React.createElement(
                'button',
                { onClick: () => props.onEdgeClick(edge) },
                [`${edge.source}–${edge.target}`, edge.label, edge.dashed && '(dashed)']
                  .filter(Boolean)
                  .join(' '),
              ),
            ),
          ),
        ),
      )
    }),
  }
})

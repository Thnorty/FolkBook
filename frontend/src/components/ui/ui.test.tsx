import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './button'
import { CheckboxField } from './checkbox-field'
import { CopyLink } from './copy-link'
import { Input } from './input'
import { Label } from './label'
import { notify } from '@/lib/notify'
import { Toaster } from './toast'

describe('Button', () => {
  it('is a button by default and can style a link instead', () => {
    render(
      <>
        <Button>Log interaction</Button>
        <Button asChild variant="secondary">
          <a href="/people">People</a>
        </Button>
      </>,
    )

    expect(screen.getByRole('button', { name: 'Log interaction' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'People' })).toHaveAttribute('href', '/people')
  })
})

describe('Input', () => {
  it('is labelled by its Label', () => {
    render(
      <>
        <Label htmlFor="name">Name</Label>
        <Input id="name" />
      </>,
    )

    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument()
  })
})

describe('notify', () => {
  it('shows the message and runs the action, then closes', async () => {
    const undo = vi.fn()
    render(<Toaster />)

    act(() => {
      notify({
        title: 'Tom Bergqvist torn out',
        description: '1 connection went with him.',
        action: { label: 'Undo', onClick: undo },
      })
    })

    expect(await screen.findByText('Tom Bergqvist torn out')).toBeInTheDocument()
    expect(screen.getByText('1 connection went with him.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledOnce()
  })

  it('closes with the X button without running the action', async () => {
    const undo = vi.fn()
    render(<Toaster />)

    act(() => {
      notify({ title: 'Saved', action: { label: 'Undo', onClick: undo } })
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Close' }))

    await waitFor(() => expect(screen.queryByText('Saved')).not.toBeInTheDocument())
    expect(undo).not.toHaveBeenCalled()
  })
})

describe('CopyLink', () => {
  it('copies the link and says so', async () => {
    const user = userEvent.setup()
    render(<CopyLink link="https://folk.example/i/abc" label="Invite link" />)

    await user.click(screen.getByRole('button', { name: 'Copy the link' }))

    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe('https://folk.example/i/abc')
  })

  it('selects the link when there is no clipboard', async () => {
    // Browsers have no clipboard on plain-HTTP pages, as on a server at home.
    const user = userEvent.setup()
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    try {
      render(<CopyLink link="http://folk.home/i/abc" label="Invite link" />)

      await user.click(screen.getByRole('button', { name: 'Copy the link' }))

      const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'Invite link' })
      expect([field.selectionStart, field.selectionEnd]).toEqual([0, field.value.length])
      expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeInTheDocument()
    } finally {
      if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard)
    }
  })
})

describe('CheckboxField', () => {
  it('ticks with its label, and says more under it', async () => {
    const changes: boolean[] = []
    render(
      <CheckboxField
        checked={false}
        onChange={(checked) => changes.push(checked)}
        note="Off by default."
      >
        Include my private notes
      </CheckboxField>,
    )

    await userEvent.click(screen.getByText('Include my private notes'))

    expect(changes).toEqual([true])
    expect(screen.getByRole('checkbox', { name: /Include my private notes/ })).not.toBeChecked()
    expect(screen.getByText('Off by default.')).toBeInTheDocument()
  })
})

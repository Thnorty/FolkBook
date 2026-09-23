import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './button'
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
})

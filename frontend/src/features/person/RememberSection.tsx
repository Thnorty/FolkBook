import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pin, PinOff, Plus, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { StickyNote, type NoteColor } from '@/components/notebook/StickyNote'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ProfileSection } from './ProfileSection'
import { addMemoryAid, memoryAidsQuery, pinMemoryAid, removeMemoryAid } from './queries'

const COLORS: NoteColor[] = ['yellow', 'pink', 'green', 'blue']
const PROMPTS = ["kids' names?", 'allergies?', 'favourite team?']
// A note's small round buttons: shown on hover or focus, always on touch screens.
const NOTE_BUTTON =
  'flex size-7 cursor-pointer items-center justify-center rounded-full bg-card text-ink-soft opacity-0 shadow-photo group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100'

/**
 * "Remember": the small facts on sticky notes, pinned ones first (with a tack). A pinned
 * note is also the hint on their keep-in-touch nudge on Today. Always private to you.
 */
export function RememberSection({ personId }: { personId: string }) {
  const queryClient = useQueryClient()
  const aids = useQuery(memoryAidsQuery(personId)).data ?? []
  const [adding, setAdding] = useState(false)
  const add = useMutation({
    mutationFn: (text: string) => addMemoryAid(queryClient, personId, text),
    onSuccess: () => setAdding(false),
  })
  const remove = useMutation({
    mutationFn: (aidId: string) => removeMemoryAid(queryClient, personId, aidId),
  })
  const pin = useMutation({
    mutationFn: ({ aidId, pinned }: { aidId: string; pinned: boolean }) =>
      pinMemoryAid(queryClient, personId, aidId, pinned),
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = String(new FormData(event.currentTarget).get('text')).trim()
    if (text) add.mutate(text)
  }

  return (
    <ProfileSection
      title="Remember"
      meta="private to you"
      action={
        !adding && (
          <Button variant="ghost" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            Add
          </Button>
        )
      }
    >
      {aids.length === 0 && !adding && (
        <div className="flex flex-col gap-3">
          <div aria-hidden className="flex flex-wrap gap-2">
            {PROMPTS.map((prompt) => (
              <span
                key={prompt}
                className="rounded-tab border border-dashed border-line-strong px-3 py-1 type-hand text-ink-soft"
              >
                {prompt}
              </span>
            ))}
          </div>
          <p className="type-small text-ink-soft">
            The small stuff you&apos;d be embarrassed to forget goes on sticky notes.
          </p>
        </div>
      )}

      {(aids.length > 0 || adding) && (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {aids.map((aid, index) => (
            <li key={aid.id} className="group relative">
              {aid.pinned && (
                // A tack holding the note up.
                <Pin
                  aria-hidden
                  className="absolute -top-2.5 left-1/2 z-10 size-5 -translate-x-1/2 rotate-12 fill-danger text-danger drop-shadow-sm"
                />
              )}
              <StickyNote seed={aid.id} color={COLORS[index % COLORS.length]}>
                {aid.pinned && <span className="sr-only">Pinned: </span>}
                {aid.text}
              </StickyNote>
              <div className="absolute -top-2 -right-2 flex gap-1">
                <Tooltip content={aid.pinned ? 'Unpin' : 'Pin to the top'}>
                  <button
                    type="button"
                    aria-label={`Pin “${aid.text}”`}
                    aria-pressed={aid.pinned}
                    onClick={() => pin.mutate({ aidId: aid.id, pinned: !aid.pinned })}
                    className={cn(NOTE_BUTTON, 'hover:text-ink')}
                  >
                    {aid.pinned ? (
                      <PinOff aria-hidden className="size-3.5" />
                    ) : (
                      <Pin aria-hidden className="size-3.5" />
                    )}
                  </button>
                </Tooltip>
                <button
                  type="button"
                  aria-label={`Remove “${aid.text}”`}
                  onClick={() => remove.mutate(aid.id)}
                  className={cn(NOTE_BUTTON, 'hover:text-danger')}
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
          {adding && (
            <li>
              <form onSubmit={submit} className="flex flex-col gap-2">
                <textarea
                  name="text"
                  aria-label="New sticky note"
                  autoFocus
                  required
                  maxLength={300}
                  rows={3}
                  placeholder="Arda is allergic to peanuts"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      event.currentTarget.form?.requestSubmit()
                    }
                    if (event.key === 'Escape') setAdding(false)
                  }}
                  className="w-full resize-none bg-note-yellow px-3.5 pt-3 pb-3.5 type-hand text-note-ink shadow-note outline-none placeholder:text-note-ink/50 focus-visible:ring-3 focus-visible:ring-focus-glow"
                />
                {add.error && <p className="type-small text-danger">{add.error.message}</p>}
                <div className="flex gap-2">
                  <Button type="submit" disabled={add.isPending}>
                    Stick it
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </li>
          )}
        </ul>
      )}
    </ProfileSection>
  )
}

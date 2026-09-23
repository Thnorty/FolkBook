import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { InkUnderline } from '@/motion/InkUnderline'
import { ProfileSection } from './ProfileSection'
import { noteQuery, saveNote } from './queries'

/** Free-form notes about someone. Private to you; one page of them per person. */
export function NotesSection({ personId, firstName }: { personId: string; firstName: string }) {
  const queryClient = useQueryClient()
  const note = useQuery(noteQuery(personId)).data
  const [editing, setEditing] = useState(false)
  const [saves, setSaves] = useState(0)
  const save = useMutation({
    mutationFn: (body: string) => saveNote(queryClient, personId, body),
    onSuccess: () => {
      setEditing(false)
      setSaves((count) => count + 1)
    },
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    save.mutate(String(new FormData(event.currentTarget).get('body')).trim())
  }

  const body = note?.body ?? ''

  return (
    <ProfileSection
      title="Notes"
      meta="private to you"
      action={
        !editing &&
        body && (
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )
      }
    >
      {editing ? (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <textarea
            name="body"
            aria-label={`Notes about ${firstName}`}
            defaultValue={body}
            autoFocus
            rows={6}
            onKeyDown={(event) => event.key === 'Escape' && setEditing(false)}
            className="w-full rounded-card border border-line-input bg-card px-3 py-2.5 type-body outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-focus-glow"
          />
          {save.error && <p className="type-small text-danger">{save.error.message}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending}>
              Save
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : body ? (
        <div>
          <p className="whitespace-pre-line">{body}</p>
          {saves > 0 && <InkUnderline key={saves} className="mt-2 w-16" />}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="type-small text-ink-soft">
            Anything worth remembering about {firstName}? Plans, worries, a book they recommended.
          </p>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Write a note
          </Button>
        </div>
      )}
    </ProfileSection>
  )
}

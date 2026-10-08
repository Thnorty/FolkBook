import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UsersRound } from 'lucide-react'
import { useMotionValue, useTransform } from 'motion/react'
import * as m from 'motion/react-m'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '@/api/errors'
import { Polaroid } from '@/components/notebook/Polaroid'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Label } from '@/components/ui/label'
import type { Person } from '@/features/people/queries'
import { addMemoryAid, personQuery, updatePerson } from '@/features/person/queries'
import { useConnectionForm } from '@/features/person/useConnectionForm'
import { SharedSpaceConfirm } from '@/features/spaces/SharedSpaceConfirm'
import { canAddPeople, spacesQuery, type Space } from '@/features/spaces/queries'
import { useSharedSpaceConfirmed } from '@/features/spaces/useSharedSpaceConfirmed'
import { isWideScreen } from '@/lib/media'
import { notify } from '@/lib/notify'
import { useShortcut } from '@/lib/shortcuts'
import { DURATION, EASE, REDUCED_TRANSITION } from '@/motion/tokens'
import { useReducedMotion } from '@/motion/useReducedMotion'
import { swipeOf } from './swipe'

const QUICK_SPACES = 4
const SAVE = { key: 'Enter', mod: true }
const SKIP = { key: 'ArrowRight', mod: true }

type FillInCardProps = {
  person: Person
  onSaved: () => void
  onSkipped: () => void
}

/** One person (screens 4v, 4w): how do you know them, a space, a friend, a memory aid. */
export function FillInCard({ person, onSaved, onSkipped }: FillInCardProps) {
  const queryClient = useQueryClient()
  const { openConnect } = useConnectionForm()
  const detail = useQuery(personQuery(person.id)).data
  const quick = useQuickSpaces()
  const firstName = person.name.split(' ')[0]
  const [howWeMet, setHowWeMet] = useState('')
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null)
  const [aid, setAid] = useState<string | null>(null)
  const [askFor, setAskFor] = useState<Space | null>(null)
  const [confirmedShared, dontAskAgain] = useSharedSpaceConfirmed()
  const fieldId = useId()
  const reduced = useReducedMotion()
  // Swiping is for phones; with reduced motion there are only the buttons and keys.
  const swipeable = !reduced && !isWideScreen()
  const x = useMotionValue(0)
  const tilt = useTransform(x, [-200, 200], [-6, 6])

  // Their spaces as they are now (the queue was read when the mode opened).
  const theirs = new Set((detail ?? person).spaces.map((space) => space.id))
  const spaces = picked ?? theirs
  const spacesChanged = picked !== null && !sameSet(picked, theirs)
  const changed = Boolean(howWeMet.trim() || spacesChanged || aid?.trim())

  const save = useMutation({
    mutationFn: async () => {
      if (howWeMet.trim() || spacesChanged) {
        await updatePerson(person.id, {
          ...(howWeMet.trim() && { how_we_met: howWeMet.trim() }),
          ...(spacesChanged && { space_ids: [...spaces] }),
        })
      }
      if (aid?.trim()) await addMemoryAid(queryClient, person.id, aid.trim())
    },
    onSuccess: onSaved,
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404) {
        notify({ title: `${person.name} isn't in your book any more` })
        onSkipped()
      }
    },
  })

  const toggle = (space: Space) => {
    const on = spaces.has(space.id)
    if (!on && space.member_count > 0 && !confirmedShared.includes(space.id)) {
      setAskFor(space)
      return
    }
    const next = new Set(spaces)
    if (on) next.delete(space.id)
    else next.add(space.id)
    setPicked(next)
  }
  const friendOf = () => openConnect(person.id, 'friend')
  const submit = () => {
    if (changed && !save.isPending) save.mutate()
  }
  // Not while a save is on its way: that save moves on by itself.
  const skip = () => {
    if (!save.isPending) onSkipped()
  }
  const card = useRef<HTMLFieldSetElement>(null)
  // A new card takes the focus, so the keys and screen readers start from it.
  useEffect(() => card.current?.focus(), [])

  useShortcut(SAVE, submit)
  // In a field Ctrl/⌘+→ moves the cursor by a word; it skips only from outside one.
  useShortcut(SKIP, skip, { whileTyping: false })
  // 1–4 pick a space, 5 is Friend of… (only while not typing).
  useShortcut({ key: '1' }, () => quick[0] && toggle(quick[0]))
  useShortcut({ key: '2' }, () => quick[1] && toggle(quick[1]))
  useShortcut({ key: '3' }, () => quick[2] && toggle(quick[2]))
  useShortcut({ key: '4' }, () => quick[3] && toggle(quick[3]))
  useShortcut({ key: '5' }, friendOf)

  const contact = detail?.contact_methods[0]?.value
  const source = [detail?.from_import && `From ${detail.from_import.file_name}`, contact]
    .filter(Boolean)
    .join(' · ')

  return (
    <m.form
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        submit()
      }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? REDUCED_TRANSITION : { duration: DURATION.card, ease: EASE }}
      style={swipeable ? { x, rotate: tilt } : undefined}
      drag={swipeable ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.6}
      onDragEnd={(_, { offset, velocity }) => {
        const swipe = swipeOf(offset.x, velocity.x)
        if (swipe === 'skip') skip()
        else if (swipe === 'save') submit()
      }}
      className="flex touch-pan-y flex-col gap-5 rounded-card border border-line bg-card p-5 shadow-note"
    >
      <div className="flex items-center gap-4">
        <Polaroid seed={person.id} photoUrl={person.photo?.thumbnail_url} />
        <div className="min-w-0">
          <p className="font-serif text-2xl">{person.name}</p>
          {source && <p className="type-meta text-ink-faint">{source}</p>}
        </div>
      </div>
      <fieldset
        ref={card}
        tabIndex={-1}
        aria-label={`Fill in ${firstName}`}
        className="flex flex-col gap-3 outline-none"
      >
        <Label
          htmlFor={`${fieldId}-input`}
          className="mb-0 font-serif text-xl font-normal tracking-normal text-ink normal-case"
        >
          How do you know {firstName}?
        </Label>
        <Input
          id={`${fieldId}-input`}
          value={howWeMet}
          onChange={(event) => setHowWeMet(event.target.value)}
          placeholder="Stockholm office, the 2024 offsite"
          autoComplete="off"
        />
        <div className="flex flex-wrap gap-2">
          {quick.map((space) => (
            <Choice
              key={space.id}
              type="checkbox"
              name="spaces"
              checked={spaces.has(space.id)}
              onChange={() => toggle(space)}
            >
              <span data-space={space.color} className="mr-2 size-2 rounded-full bg-space" />
              {space.name}
              {space.member_count > 0 && (
                <>
                  <UsersRound aria-hidden className="ml-1.5 size-3" />
                  <span className="sr-only"> (shared)</span>
                </>
              )}
            </Choice>
          ))}
          <Button type="button" variant="secondary" className="rounded-full" onClick={friendOf}>
            Friend of…
          </Button>
        </div>
        {aid === null ? (
          <Button
            type="button"
            variant="ghost"
            className="self-start px-0"
            onClick={() => setAid('')}
          >
            + add a memory aid
          </Button>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-aid`}>Memory aid</Label>
            <Input
              id={`${fieldId}-aid`}
              value={aid}
              onChange={(event) => setAid(event.target.value)}
              autoFocus
            />
          </div>
        )}
      </fieldset>
      {save.error && !(save.error instanceof ApiError && save.error.status === 404) && (
        <p role="alert" className="type-small text-danger">
          {save.error.message}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={skip} disabled={save.isPending}>
          Skip
        </Button>
        <Button type="submit" disabled={!changed || save.isPending}>
          Save &amp; next
        </Button>
      </div>
      {swipeable && (
        <p aria-hidden className="flex justify-between type-meta text-ink-faint md:hidden">
          <span>← Swipe to skip</span>
          <span>Swipe to save →</span>
        </p>
      )}
      <p className="hidden type-meta text-ink-faint md:block">
        <Kbd shortcut={SAVE} /> save &amp; next · <Kbd shortcut={SKIP} /> skip ·{' '}
        <Kbd shortcut={{ key: '1' }} />–<Kbd shortcut={{ key: '5' }} /> pick a quick answer
      </p>
      {askFor && (
        <SharedSpaceConfirm
          space={askFor}
          personName={person.name}
          onCancel={() => setAskFor(null)}
          onConfirm={(remember) => {
            if (remember) dontAskAgain(askFor.id)
            setPicked(new Set(spaces).add(askFor.id))
            setAskFor(null)
          }}
        />
      )}
    </m.form>
  )
}

/** Up to four spaces you can add people to, the busiest first. */
function useQuickSpaces(): Space[] {
  const spaces = useQuery(spacesQuery).data?.items ?? []
  return spaces
    .filter(canAddPeople)
    .sort((a, b) => b.people_count - a.people_count)
    .slice(0, QUICK_SPACES)
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((item) => b.has(item))
}

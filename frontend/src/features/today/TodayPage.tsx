import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Polaroid } from '@/components/notebook/Polaroid'
import { StickyNote } from '@/components/notebook/StickyNote'
import { Button } from '@/components/ui/button'
import { AccessEndedCards } from '@/features/kept/AccessEndedCards'
import { accessEndedQuery } from '@/features/kept/queries'
import { countOf, intervalLabel } from '@/features/person/labels'
import { ProfileSection as Section } from '@/features/person/ProfileSection'
import {
  deleteInteraction,
  keepInTouchQuery,
  logInteraction,
  saveKeepInTouch,
  type KeepInTouchSetting,
} from '@/features/person/queries'
import { usePersonForm } from '@/features/person/usePersonForm'
import { spacesQuery, type Space } from '@/features/spaces/queries'
import { peopleCount } from '@/features/spaces/labels'
import { formatDay, formatRelativeDay, isoDay, isoTime } from '@/lib/dates'
import { notify } from '@/lib/notify'
import {
  birthdaysQuery,
  blanksQuery,
  dueQuery,
  recentQuery,
  rememberQuery,
  type Birthday,
  type Nudge,
} from './queries'
import { useDismissed } from '@/lib/useDismissed'

const SNOOZE_DAYS = 7
const longDate = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone: 'UTC' })

const firstName = (name: string) => name.split(' ')[0]

/** Run a write; if it fails, say so in a toast. */
function attempt(failed: string, write: () => Promise<unknown>) {
  write().catch((error: Error) => notify({ title: failed, description: error.message }))
}

/** The home screen: what's worth your attention today (screens 1e, 1f, 4n, 6g). */
export function TodayPage() {
  const today = isoDay()
  const birthdays = useQuery(birthdaysQuery(today))
  const due = useQuery(dueQuery(today))
  const blanks = useQuery(blanksQuery)
  const recent = useQuery(recentQuery)
  const spaces = useQuery(spacesQuery)
  const ended = useQuery(accessEndedQuery)
  const [skip, setSkip] = useState<string | null>(null)
  const remember = useQuery(rememberQuery(skip))
  const [dismissed, dismiss] = useDismissed('folkbook.today.dismissedSpaces')

  const shared = (spaces.data?.items ?? []).filter(
    (space) => space.role !== 'owner' && !dismissed.includes(space.id),
  )
  const sections = {
    ended: ended.data ?? [],
    birthdays: birthdays.data ?? [],
    due: due.data ?? [],
    remember: remember.data ?? null,
    shared,
    blanks: blanks.data,
    recent: recent.data?.items ?? [],
  }
  const loaded = [birthdays, due, blanks, recent, spaces, remember, ended].every(
    (q) => !q.isPending,
  )
  const empty =
    loaded &&
    sections.ended.length === 0 &&
    sections.birthdays.length === 0 &&
    sections.due.length === 0 &&
    !sections.remember &&
    shared.length === 0 &&
    !sections.blanks?.count &&
    sections.recent.length === 0

  const meta = [
    longDate.format(new Date()),
    sections.birthdays.length > 0 && countOf(sections.birthdays.length, 'birthday'),
    sections.due.length > 0 && countOf(sections.due.length, 'nudge'),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      <PageHeader
        title="Today"
        meta={meta}
        actions={
          // Phones have no Ctrl/⌘+K: search opens as a page.
          <Button asChild variant="ghost" className="md:hidden" aria-label="Search">
            <Link to="/search">
              <Search aria-hidden />
            </Link>
          </Button>
        }
      />
      {empty ? (
        <EmptyToday />
      ) : (
        <div className="mt-6 grid gap-9 lg:grid-cols-2 lg:gap-x-12">
          <div className="flex flex-col gap-9">
            {sections.ended.length > 0 && <AccessEndedCards notices={sections.ended} />}
            {sections.birthdays.length > 0 && (
              <Birthdays birthdays={sections.birthdays} today={today} />
            )}
            {sections.due.length > 0 && <KeepInTouch nudges={sections.due} today={today} />}
            {sections.blanks && sections.blanks.count > 0 && <Blanks blanks={sections.blanks} />}
          </div>
          <div className="flex flex-col gap-9">
            {sections.remember && (
              <Section title="Remember?">
                <StickyNote seed={sections.remember.aid.id}>
                  {sections.remember.aid.text}
                  <Link
                    to="/people/$personId"
                    params={{ personId: sections.remember.person.id }}
                    className="mt-2 block type-meta text-note-ink/70 hover:underline"
                  >
                    {sections.remember.person.name}
                  </Link>
                </StickyNote>
                <Button
                  variant="secondary"
                  className="self-start"
                  onClick={() => setSkip(sections.remember!.aid.id)}
                >
                  Show another
                </Button>
              </Section>
            )}
            {shared.length > 0 && <SharedWithYou spaces={shared} onDismiss={dismiss} />}
            {sections.recent.length > 0 && (
              <Section title="Recently added">
                <ul className="flex flex-col">
                  {sections.recent.map((person) => (
                    <Row key={person.id} personId={person.id} name={person.name}>
                      <span className="type-meta text-ink-faint">
                        {formatRelativeDay(isoDay(0, new Date(person.added_at)))}
                      </span>
                    </Row>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** A person on one line: their name (to their page), and something on the right. */
function Row({
  personId,
  name,
  photoUrl,
  detail,
  children,
}: {
  personId: string
  name: string
  photoUrl?: string | null
  detail?: ReactNode
  children?: ReactNode
}) {
  return (
    <li className="flex items-center gap-3 py-2">
      {photoUrl !== undefined && <Polaroid seed={personId} photoUrl={photoUrl} />}
      <div className="min-w-0 flex-1">
        <Link
          to="/people/$personId"
          params={{ personId }}
          className="font-serif text-lg hover:underline"
        >
          {name}
        </Link>
        {detail && <p className="type-small text-ink-soft">{detail}</p>}
      </div>
      {children}
    </li>
  )
}

function Birthdays({ birthdays, today }: { birthdays: Birthday[]; today: string }) {
  const queryClient = useQueryClient()

  const wish = (birthday: Birthday) =>
    attempt("Couldn't log that", async () => {
      const entry = await logInteraction(queryClient, {
        person_id: birthday.person.id,
        kind: 'message',
        label: 'Birthday wishes',
        occurred_on: today,
        occurred_at: isoTime(),
      })
      notify({
        title: `Logged: birthday wishes to ${firstName(birthday.person.name)}`,
        action: {
          label: 'Undo',
          onClick: () =>
            attempt("Couldn't undo that", () => deleteInteraction(queryClient, entry.id)),
        },
      })
    })

  return (
    <Section title="Birthdays">
      <ul className="flex flex-col">
        {birthdays.map((birthday) => {
          const isToday = birthday.on === today
          const when = isToday ? 'today' : weekday.format(new Date(`${birthday.on}T00:00:00Z`))
          const detail = birthday.turns
            ? `Turns ${birthday.turns} ${isToday ? 'today' : `on ${when}`}`
            : `Birthday ${isToday ? 'today' : `on ${when}`}`
          return (
            <Row
              key={birthday.person.id}
              personId={birthday.person.id}
              name={birthday.person.name}
              photoUrl={birthday.person.photo?.thumbnail_url ?? null}
              detail={detail}
            >
              {isToday ? (
                <Button variant="secondary" onClick={() => wish(birthday)}>
                  Wish
                </Button>
              ) : (
                <span className="type-meta text-ink-faint">{formatDay(birthday.on)}</span>
              )}
            </Row>
          )
        })}
      </ul>
    </Section>
  )
}

/** Change someone's keep-in-touch setting; returns what it was, for Undo. */
async function changeSetting(
  queryClient: QueryClient,
  personId: string,
  change: Partial<KeepInTouchSetting>,
) {
  const { interval_days, snoozed_until, stopped } = await queryClient.fetchQuery(
    keepInTouchQuery(personId),
  )
  const before = { interval_days, snoozed_until, stopped }
  await saveKeepInTouch(queryClient, personId, { ...before, ...change })
  return before
}

function KeepInTouch({ nudges, today }: { nudges: Nudge[]; today: string }) {
  const queryClient = useQueryClient()

  const talked = (nudge: Nudge) =>
    attempt("Couldn't log that", async () => {
      const entry = await logInteraction(queryClient, {
        person_id: nudge.person.id,
        kind: 'custom',
        label: 'Talked',
        occurred_on: today,
        occurred_at: isoTime(),
      })
      notify({
        title: `Logged: talked with ${firstName(nudge.person.name)} today`,
        action: {
          label: 'Undo',
          onClick: () =>
            attempt("Couldn't undo that", () => deleteInteraction(queryClient, entry.id)),
        },
      })
    })

  const change = (nudge: Nudge, title: string, setting: Partial<KeepInTouchSetting>) =>
    attempt("Couldn't change that", async () => {
      const before = await changeSetting(queryClient, nudge.person.id, setting)
      notify({
        title,
        action: {
          label: 'Undo',
          onClick: () =>
            attempt("Couldn't undo that", () =>
              saveKeepInTouch(queryClient, nudge.person.id, before),
            ),
        },
      })
    })

  return (
    <Section
      title="Keep in touch"
      meta={
        <Link to="/settings" className="hover:underline">
          Nudges on · settings
        </Link>
      }
    >
      <ul className="flex flex-col gap-3">
        {nudges.map((nudge) => {
          const first = firstName(nudge.person.name)
          return (
            <li key={nudge.person.id} className="rounded-card border border-line bg-card p-4">
              <Link
                to="/people/$personId"
                params={{ personId: nudge.person.id }}
                className="font-serif text-lg hover:underline"
              >
                {nudge.person.name}
              </Link>
              <p className="type-small text-ink-soft">
                {nudge.last_talked_on
                  ? `Last talked ${formatRelativeDay(nudge.last_talked_on)}`
                  : "You haven't logged talking yet"}{' '}
                · {intervalLabel(nudge.interval_days).toLowerCase()}
              </p>
              {nudge.hint && <p className="mt-1 type-hand text-ink-soft">{nudge.hint}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => talked(nudge)}>We talked</Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    change(nudge, `${first} snoozed for a week`, {
                      snoozed_until: isoDay(-SNOOZE_DAYS),
                    })
                  }
                >
                  Snooze
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    change(nudge, `No more reminders about ${first}`, { stopped: true })
                  }
                >
                  Stop
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

function Blanks({ blanks }: { blanks: { count: number; items: { id: string; name: string }[] } }) {
  const [first] = blanks.items
  return (
    <Section title="Fill in the blanks" meta={`${blanks.count} without details`}>
      <p className="type-small text-ink-soft">
        One question each: how do you know them? {blanks.items.map((p) => p.name).join(', ')}
        {blanks.count > blanks.items.length && '…'}
      </p>
      <div className="flex flex-wrap gap-2">
        {first && (
          <Button asChild variant="secondary">
            <Link to="/people/$personId" params={{ personId: first.id }}>
              Start with {firstName(first.name)} →
            </Link>
          </Button>
        )}
        <Button asChild variant="ghost">
          <Link to="/people" search={{ needs: true }}>
            See all
          </Link>
        </Button>
      </div>
    </Section>
  )
}

function SharedWithYou({
  spaces,
  onDismiss,
}: {
  spaces: Space[]
  onDismiss: (spaceId: string) => void
}) {
  return (
    <Section title="Shared with you">
      <ul className="flex flex-col gap-3">
        {spaces.map((space) => (
          <li
            key={space.id}
            data-space={space.color}
            className="rounded-card border border-line bg-card p-4 shadow-ribbon"
          >
            <p className="font-serif text-lg">{space.name}</p>
            <p className="type-small text-ink-soft">
              {space.owner?.name ?? 'Someone'} shared this space with you ·{' '}
              {peopleCount(space.people_count)}. Your notes and memory aids stay private.
            </p>
            <div className="mt-3 flex gap-2">
              <Button asChild variant="secondary">
                <Link to="/spaces/$spaceId" params={{ spaceId: space.id }}>
                  Open space
                </Link>
              </Button>
              <Button variant="ghost" onClick={() => onDismiss(space.id)}>
                Dismiss
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/** Nothing to show yet (screen 6g). */
function EmptyToday() {
  const { openNew } = usePersonForm()
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <p aria-hidden className="type-hand text-ink-soft">
        nothing to remember yet
      </p>
      <h2 className="mt-3 type-title">Today fills up as your book does</h2>
      <p className="mt-2 max-w-sm text-ink-soft">
        Birthdays, people you haven&apos;t talked to in a while, and anything new in shared spaces
        show up here.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
        <Button onClick={() => openNew()}>Add someone</Button>
        <Button asChild variant="secondary">
          <Link to="/capture">Quick capture</Link>
        </Button>
      </div>
    </div>
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import { PersonCard } from '@/components/notebook/PersonCard'
import { Polaroid } from '@/components/notebook/Polaroid'
import { SpaceChip, SpaceTab, type SpaceColor } from '@/components/notebook/spaces'
import { StickyNote, type NoteColor } from '@/components/notebook/StickyNote'
import { TimelineItem } from '@/components/notebook/TimelineItem'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { notify } from '@/lib/notify'

/*
 * Development-only page (/design) showing every token and core component, in the
 * spirit of design screen 1a. It isn't part of the built app.
 */

const SURFACES = ['paper', 'card', 'ink', 'ink-soft', 'ink-faint', 'accent', 'danger', 'inverse']
const SPACE_COLORS: SpaceColor[] = ['sage', 'ochre', 'clay', 'plum', 'teal', 'slate']
const NOTE_COLORS: NoteColor[] = ['yellow', 'pink', 'green', 'blue']
const THEMES = ['system', 'light', 'dark'] as const

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-5">
      <h2 className="mb-4 type-label text-ink-faint">{title}</h2>
      {children}
    </section>
  )
}

function ThemeSwitch() {
  const [theme, setTheme] = useState<(typeof THEMES)[number]>('system')
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
  }, [theme])
  return (
    <div role="group" aria-label="Theme" className="flex gap-1">
      {THEMES.map((option) => (
        <Button
          key={option}
          variant={theme === option ? 'primary' : 'secondary'}
          aria-pressed={theme === option}
          onClick={() => setTheme(option)}
        >
          {option[0].toUpperCase() + option.slice(1)}
        </Button>
      ))}
    </div>
  )
}

export default function DesignSystem() {
  const [activeSpace, setActiveSpace] = useState<SpaceColor>('sage')

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 md:px-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="type-display">Warm notebook</h1>
          <p className="mt-1 type-meta text-ink-faint">tokens · type · components</p>
        </div>
        <ThemeSwitch />
      </header>

      <Section title="Colors">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-8">
          {SURFACES.map((token) => (
            <div key={token}>
              <div
                className="h-14 rounded-tab border border-line"
                style={{ background: `var(--${token})` }}
              />
              <p className="mt-1.5 text-xs font-medium">{token}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type">
        <div className="flex flex-col gap-3">
          <p className="type-display">Emma Yılmaz</p>
          <p className="type-title">Coffee at Kronotrop</p>
          <p className="type-heading">Şükrü Öztürk</p>
          <p className="type-label text-ink-soft">Remember</p>
          <p className="type-body">Body copy and notes stay in the sans.</p>
          <p className="type-small text-ink-soft">Met at university, Istanbul · 2015</p>
          <p className="type-meta text-ink-faint">12 Sep 2026</p>
          <p className="type-hand">Arda is allergic to peanuts</p>
        </div>
      </Section>

      <Section title="Buttons and inputs">
        <div className="flex flex-wrap items-center gap-2.5">
          <Button>Log interaction</Button>
          <Button variant="secondary">Add connection</Button>
          <Button variant="ghost">Edit</Button>
          <Button variant="danger">Delete</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ds-name">Name</Label>
            <Input id="ds-name" defaultValue="Emma Yılmaz" />
          </div>
          <div>
            <Label htmlFor="ds-met">How we met</Label>
            <Input id="ds-met" placeholder="University, Istanbul · 2015" />
          </div>
          <div>
            <Label htmlFor="ds-email">Email</Label>
            <Input id="ds-email" defaultValue="emma@" aria-invalid />
          </div>
        </div>
      </Section>

      <Section title="People">
        <div className="flex flex-col gap-2">
          <PersonCard
            id="emma"
            name="Emma Yılmaz"
            detail="University, Istanbul · 2015"
            spaces={[
              { id: '1', name: 'Friends', color: 'sage' },
              { id: '2', name: "Uni '15", color: 'slate' },
            ]}
            meta="10 days ago"
          />
          <PersonCard
            id="tom"
            name="Tom Bergqvist"
            detail="Hackathon 2026 · designer"
            spaces={[{ id: '3', name: 'Hackathon 2026', color: 'plum', shared: true }]}
            meta="2 months ago"
          />
        </div>
        <div className="mt-6 flex items-end gap-6">
          <Polaroid seed="a" size="sm" />
          <Polaroid seed="b" size="md" />
          <Polaroid seed="c" size="lg" />
        </div>
      </Section>

      <Section title="Spaces">
        <div
          className="flex flex-wrap items-end gap-0.5 border-b-2 border-space"
          data-space={activeSpace}
        >
          {SPACE_COLORS.map((color) => (
            <SpaceTab
              key={color}
              name={color[0].toUpperCase() + color.slice(1)}
              color={color}
              shared={color === 'plum'}
              active={activeSpace === color}
              onSelect={() => setActiveSpace(color)}
            />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {SPACE_COLORS.map((color) => (
            <SpaceChip key={color} name={color} color={color} shared={color === 'plum'} />
          ))}
        </div>
      </Section>

      <Section title="Memory aids and timeline">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {NOTE_COLORS.map((color, i) => (
            <StickyNote key={color} seed={color} color={color}>
              {
                [
                  'Arda, 6 — her kid',
                  'Peanut allergy — always ask',
                  'Loves Murakami',
                  'Moving to Izmir',
                ][i]
              }
            </StickyNote>
          ))}
        </div>
        <ol className="mt-6">
          <TimelineItem date="2026-09-12" kind="Coffee" title="Coffee at Kronotrop">
            Showed me Arda&apos;s dinosaur drawings. She&apos;s changing teams at work in October.
          </TimelineItem>
          <TimelineItem date="2026-08-02" kind="Call" title="Birthday call" />
        </ol>
      </Section>

      <Section title="Toast">
        <div className="flex flex-wrap gap-2.5">
          <Button
            variant="secondary"
            onClick={() =>
              notify({
                title: 'Tom Bergqvist torn out',
                description: '1 connection and 1 memory aid went with him.',
                action: { label: 'Undo', onClick: () => notify({ title: 'Tom is back' }) },
              })
            }
          >
            Show toast with Undo
          </Button>
          <Button variant="secondary" onClick={() => notify({ title: 'Saved' })}>
            Show simple toast
          </Button>
        </div>
      </Section>
    </main>
  )
}

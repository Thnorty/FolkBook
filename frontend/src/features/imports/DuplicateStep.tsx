import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Choice } from './ImportPage'
import type { Contact, ContactMatch } from './queries'
import { WizardBar } from './WizardBar'

const REASONS: Record<ContactMatch['reason'], string> = {
  phone: 'Same phone number',
  email: 'Same email',
  name: 'Same name',
  initial: 'Same first name and initial',
}

type DuplicateStepProps = {
  contact: Contact & { match: ContactMatch }
  fileName: string
  position: number
  total: number
  onChoose: (choice: Choice) => void
  onBack: () => void
}

/** Step 3 (screens 4r, 4u): one possible duplicate at a time. */
export function DuplicateStep({
  contact,
  fileName,
  position,
  total,
  onChoose,
  onBack,
}: DuplicateStepProps) {
  const { match } = contact
  const theirs = new Set([...match.phones, ...match.emails])
  const owner = match.owner.split(' ')[0]
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="type-title">Looks like {contact.name} already exists</h2>
        <p className="type-small text-ink-soft">
          {REASONS[match.reason]}
          {match.sure ? '.' : ', so maybe.'}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Side title="In your book" name={match.person.name}>
          <Field label="Phone" values={match.phones} />
          <Field label="Email" values={match.emails} />
          <Field label="Spaces" values={match.spaces.map((space) => space.name)} />
        </Side>
        <Side title={`From ${fileName}`} name={contact.name}>
          <Field label="Phone" values={contact.phones.map((d) => d.value)} isNew={theirs} />
          <Field label="Email" values={contact.emails.map((d) => d.value)} isNew={theirs} />
          <Field label="Spaces" values={[]} />
        </Side>
      </div>
      <p className="type-small text-ink-soft">
        {match.can_merge
          ? `Merge keeps ${match.person.name} and adds what's new, in blue.`
          : `Shared by ${owner}, so you can't merge into them`}
      </p>
      <WizardBar start={`${position} of ${total} possible duplicates`}>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button variant="secondary" onClick={() => onChoose({ action: 'new' })}>
          Import as new
        </Button>
        <Button variant="secondary" onClick={() => onChoose({ action: 'skip' })}>
          Skip
        </Button>
        {match.can_merge && (
          <Button onClick={() => onChoose({ action: 'merge', into: match.person.id })}>
            Merge
          </Button>
        )}
      </WizardBar>
    </div>
  )
}

function Side({ title, name, children }: { title: string; name: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-card px-4 py-3">
      <p className="type-label text-ink-faint">{title}</p>
      <p className="mt-1 font-serif text-lg">{name}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 type-small">{children}</dl>
    </section>
  )
}

/** One row of the comparison; values the other side lacks are what a merge adds. */
function Field({
  label,
  values,
  isNew,
}: {
  label: string
  values: string[]
  isNew?: ReadonlySet<string>
}) {
  return (
    <>
      <dt className="text-ink-faint">{label}</dt>
      <dd className="min-w-0">
        {values.length === 0
          ? '—'
          : values.map((value) => (
              <span
                key={value}
                className={cn('block truncate', isNew && !isNew.has(value) && 'text-accent')}
              >
                {value}
              </span>
            ))}
      </dd>
    </>
  )
}

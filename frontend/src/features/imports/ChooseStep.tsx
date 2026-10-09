import { Search } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckboxField } from '@/components/ui/checkbox-field'
import { Input } from '@/components/ui/input'
import { fold } from '@/lib/names'
import { ContactRow } from './ContactRow'
import type { Contact, ImportPreview } from './queries'
import { WizardBar } from './WizardBar'

type ChooseStepProps = {
  preview: ImportPreview
  picked: ReadonlySet<number>
  onToggle: (index: number) => void
  onBack: () => void
  onContinue: () => void
}

/** Step 2 (screens 4q, 4u): nothing is ticked; pick who you actually know. */
export function ChooseStep({ preview, picked, onToggle, onBack, onContinue }: ChooseStepProps) {
  const [text, setText] = useState('')
  const [hideKnown, setHideKnown] = useState(false)
  const known = preview.contacts.filter((contact) => contact.match?.by_details).length
  const shown = preview.contacts.filter(
    (contact) => !(hideKnown && contact.match?.by_details) && matches(contact, text),
  )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="type-title">
          {preview.contacts.length} contacts in {preview.file_name}
        </h2>
        <p className="type-small text-ink-soft">
          Select who you actually know. Nothing is checked — your phone knows more people than you
          do.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="relative min-w-0 flex-1 basis-60">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint"
          />
          <Input
            type="search"
            aria-label="Search contacts"
            placeholder={`Search ${preview.contacts.length} contacts`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="pl-9"
          />
        </div>
        {known > 0 && (
          <CheckboxField
            checked={hideKnown}
            onChange={setHideKnown}
            className="type-small text-ink-soft"
          >
            Hide {known} already in your book
          </CheckboxField>
        )}
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-card">
        {shown.map((contact) => (
          <li key={contact.index}>
            <ContactRow
              contact={contact}
              checked={picked.has(contact.index)}
              onToggle={() => onToggle(contact.index)}
            />
          </li>
        ))}
      </ul>
      <WizardBar start={`${picked.size} selected`}>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button disabled={picked.size === 0} onClick={onContinue}>
          Continue with {picked.size}
        </Button>
      </WizardBar>
    </div>
  )
}

function matches(contact: Contact, text: string): boolean {
  const query = fold(text.trim())
  if (!query) return true
  const details = [...contact.phones, ...contact.emails].map((detail) => detail.value)
  return [contact.name, ...details].some((value) => fold(value).includes(query))
}

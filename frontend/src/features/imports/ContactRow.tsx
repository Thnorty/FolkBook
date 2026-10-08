import { initials } from '@/lib/names'
import type { Contact } from './queries'

type ContactRowProps = {
  contact: Contact
  checked: boolean
  onToggle: () => void
}

/** A contact from the file: tick it to bring them in. */
export function ContactRow({ contact, checked, onToggle }: ContactRowProps) {
  const detail = contact.phones[0]?.value ?? contact.emails[0]?.value
  const maybe = contact.match && !contact.match.by_details
  return (
    <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-hover">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="size-4 accent-accent"
      />
      <span
        aria-hidden
        className="flex size-9 flex-none items-center justify-center rounded-full bg-hover type-label text-ink-soft"
      >
        {initials(contact.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{contact.name}</span>
        {detail && <span className="block truncate type-small text-ink-soft">{detail}</span>}
      </span>
      {maybe && <span className="type-meta text-accent">Maybe in your book</span>}
      {contact.match?.by_details && (
        <span className="type-meta text-ink-faint">Already in your book</span>
      )}
    </label>
  )
}

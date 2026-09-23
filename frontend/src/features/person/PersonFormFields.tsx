import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import type { components } from '@/api/schema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label, labelClass } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/* The "More details" fields of the person form: birthday, contact details, tags. */

export type BirthdayValue = { day: string; month: string; year: string }
export type ContactValue = components['schemas']['ContactMethodIn']

const SELECT =
  'h-11 rounded-card border border-line-input bg-card px-2.5 text-input text-ink outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-focus-glow md:h-10'

const monthNames = [...Array(12)].map((_, i) =>
  new Intl.DateTimeFormat(undefined, { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2000, i, 1)),
  ),
)

export function BirthdayFields({
  value,
  onChange,
}: {
  value: BirthdayValue
  onChange: (value: BirthdayValue) => void
}) {
  return (
    <fieldset>
      <legend className={labelClass}>Birthday</legend>
      <div className="flex gap-2">
        <Input
          aria-label="Day"
          type="number"
          inputMode="numeric"
          min={1}
          max={31}
          placeholder="Day"
          value={value.day}
          onChange={(event) => onChange({ ...value, day: event.target.value })}
          className="w-20"
        />
        <select
          aria-label="Month"
          value={value.month}
          onChange={(event) => onChange({ ...value, month: event.target.value })}
          className={cn(SELECT, 'flex-1')}
        >
          <option value="">Month</option>
          {monthNames.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <Input
          aria-label="Year (optional)"
          type="number"
          inputMode="numeric"
          min={1900}
          max={new Date().getFullYear()}
          placeholder="Year (optional)"
          value={value.year}
          onChange={(event) => onChange({ ...value, year: event.target.value })}
          className="w-36"
        />
      </div>
    </fieldset>
  )
}

const KINDS: { value: ContactValue['kind']; label: string; placeholder: string }[] = [
  { value: 'phone', label: 'Phone', placeholder: '+46 70 555 12 90' },
  { value: 'email', label: 'Email', placeholder: 'tom@example.com' },
  { value: 'social', label: 'Social', placeholder: '@tom.designs' },
  { value: 'other', label: 'Other', placeholder: 'Anything else' },
]

export function ContactFields({
  value,
  onChange,
}: {
  value: ContactValue[]
  onChange: (value: ContactValue[]) => void
}) {
  const change = (index: number, patch: Partial<ContactValue>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={labelClass}>Contact</legend>
      {value.map((item, index) => (
        <div key={index} className="flex gap-2">
          <select
            aria-label={`Contact ${index + 1} kind`}
            value={item.kind}
            onChange={(event) =>
              change(index, { kind: event.target.value as ContactValue['kind'] })
            }
            className={cn(SELECT, 'w-28')}
          >
            {KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </select>
          <Input
            aria-label={`Contact ${index + 1}`}
            value={item.value}
            placeholder={KINDS.find((kind) => kind.value === item.kind)?.placeholder}
            onChange={(event) => change(index, { value: event.target.value })}
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            aria-label={`Remove contact ${index + 1}`}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            <X aria-hidden />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        className="self-start"
        onClick={() => onChange([...value, { kind: 'phone', label: '', value: '' }])}
      >
        <Plus aria-hidden />
        {value.length ? 'Add another' : 'Add a phone, email or handle'}
      </Button>
    </fieldset>
  )
}

export function TagInput({
  value,
  onChange,
}: {
  value: string[]
  onChange: (tags: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const tag = draft.trim().replace(/,$/, '')
    if (tag && !value.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      onChange([...value, tag])
    }
    setDraft('')
  }

  return (
    <div>
      <Label htmlFor="person-tags">Tags</Label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-card border border-line-input bg-card p-1.5 focus-within:border-accent focus-within:ring-3 focus-within:ring-focus-glow">
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full bg-hover py-0.5 pr-1 pl-2.5 text-sm"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={() => onChange(value.filter((existing) => existing !== tag))}
              className="flex size-6 cursor-pointer items-center justify-center rounded-full text-ink-soft hover:text-ink"
            >
              <X aria-hidden className="size-3" />
            </button>
          </span>
        ))}
        <input
          id="person-tags"
          value={draft}
          placeholder={value.length ? '' : 'designer, climbing…'}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={add}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault()
              add()
            } else if (event.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
          className="h-8 min-w-24 flex-1 bg-transparent px-1.5 text-input outline-none placeholder:text-ink-faint"
        />
      </div>
    </div>
  )
}

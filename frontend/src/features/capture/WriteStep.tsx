import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useRef, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { CheckboxField } from '@/components/ui/checkbox-field'
import { Kbd } from '@/components/ui/kbd'
import { selectClass } from '@/components/ui/select'
import { Tooltip } from '@/components/ui/tooltip'
import { captureAiLine } from '@/features/ai/copy'
import type { AiSettings } from '@/features/ai/queries'
import { usePersonForm } from '@/features/person/usePersonForm'
import { canAddPeople, spacesQuery } from '@/features/spaces/queries'
import { AI_OFF, HINT, PHRASES, PROVIDERS, SUGGEST } from './copy'

/** As long as the server reads. */
const MAX_TEXT = 4000

type WriteStepProps = {
  ai: AiSettings
  text: string
  onText: (text: string) => void
  spaceId: string | null
  onSpace: (spaceId: string | null) => void
  onSuggest: () => void
}

/** Write what happened (screens 2d, 2e), or why there's no AI to read it (2j). */
export function WriteStep({ ai, text, onText, spaceId, onSpace, onSuggest }: WriteStepProps) {
  const { openNew } = usePersonForm()
  const spaces = (useQuery(spacesQuery).data?.items ?? []).filter(canAddPeople)
  const box = useRef<HTMLTextAreaElement>(null)
  const aiLine = captureAiLine(ai)

  const insert = (phrase: string) => {
    const field = box.current
    const start = field?.selectionStart ?? text.length
    const end = field?.selectionEnd ?? text.length
    const before = text.slice(0, start)
    const spaced = before && !/\s$/.test(before) ? ` ${phrase}` : phrase
    onText(before + spaced + text.slice(end))
    requestAnimationFrame(() => {
      field?.focus()
      field?.setSelectionRange(start + spaced.length, start + spaced.length)
    })
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSuggest()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-card border border-line bg-card shadow-photo">
        <label htmlFor="capture-text" className="sr-only">
          What happened?
        </label>
        <textarea
          id="capture-text"
          ref={box}
          value={text}
          onChange={(event) => onText(event.target.value)}
          required
          maxLength={MAX_TEXT}
          readOnly={!aiLine}
          rows={7}
          autoFocus={Boolean(aiLine)}
          placeholder="Met Tom at the hackathon…"
          className="notebook-lines block w-full resize-y bg-transparent pt-1 pr-4 text-lg text-ink outline-none placeholder:text-ink-faint focus-visible:ring-3 focus-visible:ring-focus-glow focus-visible:ring-inset"
        />
      </div>

      {aiLine ? (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <CheckboxField
              checked={spaceId !== null}
              onChange={(checked) => onSpace(checked ? (spaces[0]?.id ?? null) : null)}
              disabled={spaces.length === 0}
            >
              Put everyone in a space
            </CheckboxField>
            {spaceId !== null && (
              <select
                aria-label="Space"
                value={spaceId}
                onChange={(event) => onSpace(event.target.value)}
                className={`${selectClass} md:w-56`}
              >
                {spaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name}
                  </option>
                ))}
              </select>
            )}
            <span className="type-meta text-ink-faint md:ml-auto">{aiLine}</span>
            <Tooltip content={<Kbd shortcut={SUGGEST} />}>
              <Button type="submit" className="h-12 md:h-9">
                Suggest
              </Button>
            </Tooltip>
          </div>
          <p className="type-small text-ink-soft">
            {HINT}{' '}
            <button
              type="button"
              onClick={() => openNew()}
              className="cursor-pointer underline underline-offset-2 hover:text-ink"
            >
              Use the form instead
            </button>
          </p>
          <div>
            <p className="type-label text-ink-faint">To start with</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PHRASES.map((phrase) => (
                <button
                  key={phrase}
                  type="button"
                  onClick={() => insert(phrase)}
                  className="min-h-11 cursor-pointer rounded-full border border-line-input px-3.5 text-md text-ink-soft hover:border-line-strong hover:text-ink md:min-h-9"
                >
                  {phrase}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <AiOff admin={ai.can_manage_server} />
      )}
    </form>
  )
}

/** Screen 2j: no key of your own, and none from the server. */
function AiOff({ admin }: { admin: boolean }) {
  const { openNew } = usePersonForm()
  return (
    <section
      aria-labelledby="ai-off"
      className="flex flex-col gap-3 rounded-card border border-dashed border-line-strong bg-card p-5"
    >
      <p className="type-label text-ink-faint">AI is off</p>
      <h2 id="ai-off" className="type-title">
        {AI_OFF.title}
      </h2>
      <p className="text-ink-soft">{AI_OFF.body}</p>
      {admin && <p className="text-ink-soft">{AI_OFF.admin}</p>}
      <ul className="flex flex-wrap gap-2" aria-label="Providers">
        {PROVIDERS.map((name) => (
          <li
            key={name}
            className="rounded-full border border-line px-3 py-1 type-small text-ink-soft"
          >
            {name}
          </li>
        ))}
      </ul>
      <Button asChild className="h-12 md:h-9">
        <Link to="/settings/ai">Add a key in Settings →</Link>
      </Button>
      <Button type="button" variant="secondary" className="h-12 md:h-9" onClick={() => openNew()}>
        Fill in the form myself
      </Button>
      <p className="type-small text-ink-faint">{AI_OFF.rest}</p>
    </section>
  )
}

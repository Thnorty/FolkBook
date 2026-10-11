import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import { Input } from '@/components/ui/input'
import { Label, labelClass } from '@/components/ui/label'
import {
  fetchModels,
  removeAi,
  saveAi,
  testAi,
  type AiCheckIn,
  type AiProvider,
  type AiScope,
} from './queries'

type AiProviderFormProps = {
  scope: AiScope
  /** What's saved now, if anything. */
  current: AiProvider | null
  title: string
  note?: ReactNode
  /** Asked before removing it ("Remove your key? …"). */
  removeQuestion: string
}

const PROVIDERS = [
  { value: 'gemini', label: 'Gemini', note: 'Google AI Studio key' },
  {
    value: 'openai_compatible',
    label: 'OpenAI-compatible',
    note: 'Ollama, LM Studio, vLLM, OpenAI…',
  },
] as const

/** One AI provider: yours ("Only for you") or the server's (admins), screens 5n and 5y. */
export function AiProviderForm({
  scope,
  current,
  title,
  note,
  removeQuestion,
}: AiProviderFormProps) {
  const queryClient = useQueryClient()
  const id = (field: string) => `ai-${scope}-${field}`
  const [provider, setProvider] = useState<AiProvider['provider']>(current?.provider ?? 'gemini')
  const [baseUrl, setBaseUrl] = useState(current?.base_url ?? '')
  const [model, setModel] = useState(current?.model ?? '')
  // The stored key stays unless you replace it: then the box shows, and what you type is sent.
  const [replacing, setReplacing] = useState(!current?.key_hint)
  const [key, setKey] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [result, setResult] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  const local = provider === 'openai_compatible'
  const typedKey = replacing && key.trim() !== ''
  const check = (): AiCheckIn => ({
    provider,
    base_url: local ? baseUrl.trim() : '',
    model: model.trim(),
    ...(typedKey ? { key: key.trim() } : { saved: scope }),
  })

  const save = useMutation({
    mutationFn: () =>
      saveAi(queryClient, scope, {
        provider,
        base_url: local ? baseUrl.trim() : '',
        model: model.trim(),
        ...(typedKey && { key: key.trim() }),
      }),
    onSuccess: (settings) => {
      const saved = scope === 'mine' ? settings.mine : settings.server
      setReplacing(!saved?.key_hint)
      setKey('')
    },
  })
  const list = useMutation({
    mutationFn: () => fetchModels(check()),
    onSuccess: (answer) => {
      setModels(answer.models)
      setResult(answer.message ?? `${answer.models.length} models`)
    },
  })
  const test = useMutation({
    mutationFn: () => testAi(check()),
    onSuccess: (answer) => setResult(answer.message),
  })
  const remove = useMutation({
    mutationFn: () => removeAi(queryClient, scope),
    onSuccess: () => {
      setRemoving(false)
      setReplacing(true)
      setModel('')
      setBaseUrl('')
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate()
  }
  const error = save.error ?? list.error ?? test.error ?? remove.error

  return (
    <form aria-label={title} onSubmit={submit} className="flex flex-col gap-4">
      <fieldset>
        <legend className={labelClass}>Provider</legend>
        <div className="flex flex-wrap gap-2">
          {PROVIDERS.map((option) => (
            <Choice
              key={option.value}
              name={id('provider')}
              look="box"
              checked={provider === option.value}
              onChange={() => setProvider(option.value)}
            >
              <span className="flex flex-col items-start py-1">
                <span className="text-ink">{option.label}</span>
                <span className="type-small text-ink-faint">{option.note}</span>
              </span>
            </Choice>
          ))}
        </div>
      </fieldset>

      {local && (
        <div className="max-w-md">
          <Label htmlFor={id('base-url')}>Base URL</Label>
          <Input
            id={id('base-url')}
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="http://192.168.1.20:11434/v1"
            required
            autoComplete="off"
          />
          <p className="mt-1 type-small text-ink-faint">
            The server must speak the OpenAI chat completions API.
          </p>
        </div>
      )}

      <div className="max-w-md">
        <Label htmlFor={replacing ? id('key') : undefined}>API key</Label>
        {current?.key_unreadable && (
          <p className="mb-1 type-small text-danger">
            This key can&apos;t be read anymore (the server&apos;s secret changed). Enter it again.
          </p>
        )}
        {replacing ? (
          <Input
            id={id('key')}
            type="password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            // Not "off", which browsers ignore: this keeps the FolkBook login password out.
            autoComplete="new-password"
          />
        ) : (
          <div className="flex items-center gap-3">
            <span className="font-mono text-ink-soft">•••• {current?.key_hint}</span>
            <Button type="button" variant="ghost" onClick={() => setReplacing(true)}>
              Replace
            </Button>
          </div>
        )}
        <p className="mt-1 type-small text-ink-faint">
          Optional for local servers. Stored encrypted on this server.
        </p>
      </div>

      <div className="max-w-md">
        <Label htmlFor={id('model')}>Model</Label>
        <div className="flex gap-2">
          <Input
            id={id('model')}
            list={id('models')}
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder={local ? 'llama3.1:8b' : 'gemini-2.5-flash'}
            required
            autoComplete="off"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={list.isPending}
            onClick={() => list.mutate()}
          >
            Fetch models
          </Button>
        </div>
        <datalist id={id('models')}>
          {models.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={save.isPending}>
          Save
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={test.isPending}
          onClick={() => test.mutate()}
        >
          Test connection
        </Button>
        {current && !removing && (
          <Button type="button" variant="ghost" onClick={() => setRemoving(true)}>
            Remove
          </Button>
        )}
        <p role="status" className="type-small text-ink-soft">
          {test.isPending ? 'Asking…' : result}
        </p>
      </div>

      {removing && (
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-card p-3">
          <p className="type-small">{removeQuestion}</p>
          <Button
            type="button"
            variant="danger"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            Remove key
          </Button>
          <Button type="button" variant="ghost" onClick={() => setRemoving(false)}>
            Cancel
          </Button>
        </div>
      )}

      {note && <p className="type-small text-ink-soft">{note}</p>}
      {error && <p className="type-small text-danger">{error.message}</p>}
    </form>
  )
}

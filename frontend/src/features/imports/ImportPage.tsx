import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { ChooseStep } from './ChooseStep'
import { DoneStep } from './DoneStep'
import { DuplicateStep } from './DuplicateStep'
import {
  previewImport,
  runImport,
  type Contact,
  type ContactMatch,
  type ImportPreview,
  type ImportResult,
} from './queries'
import { SpaceStep } from './SpaceStep'
import { Stepper } from './Stepper'
import { UploadStep } from './UploadStep'

type Step = 'upload' | 'choose' | 'duplicates' | 'space' | 'done'
const STEP_NUMBER: Record<Step, number> = {
  upload: 0,
  choose: 1,
  duplicates: 2,
  space: 3,
  done: 4,
}

/** What to do with a picked contact that may already be in the book. */
export type Choice = { action: 'new' | 'skip' } | { action: 'merge'; into: string }

type Matched = Contact & { match: ContactMatch }

/**
 * Import contacts (screens 4p–4u). Everything stays here until the last step, which
 * sends the file again with the choices; the server stores nothing before that.
 */
export function ImportPage() {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set())
  const [choices, setChoices] = useState<ReadonlyMap<number, Choice>>(new Map())
  const [duplicate, setDuplicate] = useState(0)
  const [space, setSpace] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  const read = useMutation({
    mutationFn: previewImport,
    onSuccess: (preview, chosen) => {
      setFile(chosen)
      setPreview(preview)
      setPicked(new Set())
      setChoices(new Map())
      setStep('choose')
    },
  })

  const contacts = (preview?.contacts ?? []).filter((contact) => picked.has(contact.index))
  const duplicates = contacts.filter((contact): contact is Matched => contact.match !== null)
  const choiceFor = (contact: Contact): Choice => choices.get(contact.index) ?? { action: 'new' }
  const added = contacts.filter((contact) => choiceFor(contact).action === 'new')
  const merges = duplicates.filter((contact) => choiceFor(contact).action === 'merge')

  const save = useMutation({
    mutationFn: () =>
      runImport(queryClient, file!, {
        picked: contacts.map((contact) => ({ index: contact.index, ...choiceFor(contact) })),
        space: added.length > 0 ? space : null,
      }),
    onSuccess: (done) => {
      setResult(done)
      setStep('done')
    },
  })

  const toggle = (index: number) =>
    setPicked((current) => {
      const next = new Set(current)
      if (!next.delete(index)) next.add(index)
      return next
    })

  const choose = (choice: Choice) => {
    setChoices((current) => new Map(current).set(duplicates[duplicate].index, choice))
    if (duplicate + 1 < duplicates.length) setDuplicate(duplicate + 1)
    else setStep('space')
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-8">
      <PageHeader
        title="Import contacts"
        actions={
          step !== 'done' && (
            <Button asChild variant="ghost">
              <Link to="/people">Cancel</Link>
            </Button>
          )
        }
      />
      <Stepper current={STEP_NUMBER[step]} />
      {step === 'upload' && (
        <UploadStep onFile={read.mutate} busy={read.isPending} error={read.error?.message} />
      )}
      {step === 'choose' && preview && (
        <ChooseStep
          preview={preview}
          picked={picked}
          onToggle={toggle}
          onBack={() => setStep('upload')}
          onContinue={() => {
            setDuplicate(0)
            setStep(duplicates.length > 0 ? 'duplicates' : 'space')
          }}
        />
      )}
      {step === 'duplicates' && preview && duplicates[duplicate] && (
        <DuplicateStep
          key={duplicates[duplicate].index}
          contact={duplicates[duplicate]}
          fileName={preview.file_name}
          position={duplicate + 1}
          total={duplicates.length}
          onChoose={choose}
          onBack={() => (duplicate > 0 ? setDuplicate(duplicate - 1) : setStep('choose'))}
        />
      )}
      {step === 'space' && (
        <SpaceStep
          newPeople={added.map((contact) => contact.name)}
          merges={merges.map((contact) => contact.match)}
          space={space}
          onSpace={setSpace}
          onBack={() => setStep(duplicates.length > 0 ? 'duplicates' : 'choose')}
          onImport={() => save.mutate()}
          busy={save.isPending}
          error={save.error?.message}
        />
      )}
      {step === 'done' && result && (
        <DoneStep result={result} mergedInto={merges.map((contact) => contact.match.person.name)} />
      )}
    </div>
  )
}

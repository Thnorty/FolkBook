import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { ChooseStep } from './ChooseStep'
import { previewImport, type ImportPreview } from './queries'
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

/**
 * Import contacts (screens 4p–4u). Everything stays here until the last step, which
 * sends the file again with the choices; the server stores nothing before that.
 */
export function ImportPage() {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set())
  const read = useMutation({
    mutationFn: previewImport,
    onSuccess: (result, chosen) => {
      setFile(chosen)
      setPreview(result)
      setPicked(new Set())
      setStep('choose')
    },
  })

  const toggle = (index: number) =>
    setPicked((current) => {
      const next = new Set(current)
      if (!next.delete(index)) next.add(index)
      return next
    })

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-8">
      <PageHeader
        title="Import contacts"
        actions={
          <Button asChild variant="ghost">
            <Link to="/people">Cancel</Link>
          </Button>
        }
      />
      <Stepper current={STEP_NUMBER[step]} />
      {step === 'upload' && (
        <UploadStep onFile={read.mutate} busy={read.isPending} error={read.error?.message} />
      )}
      {step === 'choose' && preview && file && (
        <ChooseStep
          preview={preview}
          picked={picked}
          onToggle={toggle}
          onBack={() => setStep('upload')}
          onContinue={() => setStep('duplicates')}
        />
      )}
    </div>
  )
}

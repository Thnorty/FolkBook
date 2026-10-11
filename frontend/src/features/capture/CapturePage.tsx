import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Kbd } from '@/components/ui/kbd'
import { SHORTCUTS } from '@/app/nav'
import { aiSettingsQuery } from '@/features/ai/queries'
import { SharedSpaceConfirm } from '@/features/spaces/SharedSpaceConfirm'
import { spacesQuery } from '@/features/spaces/queries'
import { useSharedSpaceConfirmed } from '@/features/spaces/useSharedSpaceConfirmed'
import { isoDay } from '@/lib/dates'
import { notify } from '@/lib/notify'
import { useShortcut } from '@/lib/shortcuts'
import { SUGGEST } from './copy'
import { saveCapture, suggestCapture, undoCapture, type Saved } from './queries'
import { ReadingStep } from './ReadingStep'
import {
  addItem,
  edit,
  fromDraft,
  resolve,
  toggle,
  toSaveBody,
  undoneTitle,
  type AddKind,
  type Item,
  type Resolved,
  type Review,
} from './review'
import { ReviewStep } from './ReviewStep'
import { SavedStep } from './SavedStep'
import { WriteStep } from './WriteStep'

type Step = 'write' | 'reading' | 'review' | 'saved'

/**
 * Quick capture (screens 2d–2j): write what happened, let the AI read it, review every
 * suggestion, save them all at once, and undo it all while it's fresh. The text and the
 * draft live only in this page; the server keeps nothing until Save.
 */
export function CapturePage() {
  const queryClient = useQueryClient()
  const ai = useQuery(aiSettingsQuery)
  const spaces = useQuery(spacesQuery).data?.items ?? []
  const [step, setStep] = useState<Step>('write')
  const [text, setText] = useState('')
  const [spaceId, setSpaceId] = useState<string | null>(null)
  const [review, setReview] = useState<Review>([])
  const [saved, setSaved] = useState<Saved | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmedShared, dontAskAgain] = useSharedSpaceConfirmed()
  const reading = useRef<AbortController | null>(null)
  const space = spaces.find((item) => item.id === spaceId) ?? null

  const suggest = useMutation({
    mutationFn: (signal: AbortSignal) =>
      suggestCapture({ text, today: isoDay(), space_id: spaceId }, signal),
  })
  const save = useMutation({
    mutationFn: () => saveCapture(queryClient, toSaveBody(review, spaceId)),
    onSuccess: (done) => {
      setSaved(done)
      setStep('saved')
    },
  })
  const undo = useMutation({
    mutationFn: (captureId: string) => undoCapture(queryClient, captureId),
    onSuccess: (undone) => {
      notify({ title: undoneTitle(undone) })
      setSaved(null)
      setStep('write')
    },
  })

  const read = useCallback(() => {
    if (!text.trim()) return
    const controller = new AbortController()
    reading.current = controller
    setStep('reading')
    suggest.mutate(controller.signal, {
      onSuccess: (draft) => {
        if (controller.signal.aborted) return
        setReview(fromDraft(draft))
        setStep('review')
      },
    })
  }, [text, suggest])

  const backToText = useCallback(() => {
    reading.current?.abort()
    suggest.reset()
    save.reset()
    setStep('write')
  }, [suggest, save])

  const saveAll = () => {
    const shared = space && space.member_count > 0 && !confirmedShared.includes(space.id)
    const anyoneNew = toSaveBody(review, spaceId).new_people?.length
    if (shared && anyoneNew) setConfirming(true)
    else save.mutate()
  }

  useShortcut(SUGGEST, read, { enabled: step === 'write' })
  useShortcut({ key: 'Escape' }, backToText, { enabled: step === 'review' })

  const newCount = confirming ? (toSaveBody(review, spaceId).new_people?.length ?? 0) : 0
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 md:px-8">
      <PageHeader
        title="Quick capture"
        meta={
          <span className="hidden md:inline">
            Press <Kbd shortcut={SHORTCUTS.quickCapture} /> anywhere
          </span>
        }
      />
      {!ai.data ? (
        <p className={ai.isError ? 'text-danger' : 'text-ink-soft'}>
          {ai.error?.message ?? 'Loading…'}
        </p>
      ) : step === 'write' ? (
        <WriteStep
          ai={ai.data}
          text={text}
          onText={setText}
          spaceId={spaceId}
          onSpace={setSpaceId}
          onSuggest={read}
        />
      ) : step === 'reading' ? (
        <ReadingStep
          text={text}
          // Cancel resets the request, so a cancelled one never shows as failed.
          error={suggest.error?.message ?? null}
          onCancel={backToText}
          onRetry={read}
          onEditText={backToText}
        />
      ) : step === 'review' ? (
        <ReviewStep
          text={text}
          review={review}
          spaceName={space?.name ?? null}
          busy={save.isPending}
          error={save.error?.message ?? null}
          onToggle={(id) => setReview((current) => toggle(current, id))}
          onEdit={(id, changes: Partial<Item>) =>
            setReview((current) => edit(current, id, changes))
          }
          onResolve={(ref, choice: Resolved) =>
            setReview((current) => resolve(current, ref, choice))
          }
          onAdd={(kind: AddKind) =>
            setReview((current) => {
              const firstPerson = current.find((item) => item.kind === 'person')
              return addItem(current, kind, firstPerson?.id ?? '')
            })
          }
          onEditText={backToText}
          onSave={saveAll}
        />
      ) : (
        saved && (
          <SavedStep
            saved={saved}
            undoing={undo.isPending}
            error={undo.error?.message ?? null}
            onAnother={() => {
              setText('')
              setSaved(null)
              setStep('write')
            }}
            onUndo={() => undo.mutate(saved.capture_id)}
          />
        )
      )}
      {confirming && space && (
        <SharedSpaceConfirm
          space={space}
          count={newCount}
          onConfirm={(remember) => {
            if (remember) dontAskAgain(space.id)
            setConfirming(false)
            save.mutate()
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  )
}

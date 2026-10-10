import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ImagePlus, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Polaroid } from '@/components/notebook/Polaroid'
import { Button } from '@/components/ui/button'
import { Choice } from '@/components/ui/choice'
import { FileButton } from '@/components/ui/file-button'
import { FormDialogFooter } from '@/components/ui/form-dialog'
import { Input } from '@/components/ui/input'
import { Label, labelClass } from '@/components/ui/label'
import { SharedSpaceConfirm } from '@/features/spaces/SharedSpaceConfirm'
import { canAddPeople, spacesQuery, type Space } from '@/features/spaces/queries'
import { useSharedSpaceConfirmed } from '@/features/spaces/useSharedSpaceConfirmed'
import { cn } from '@/lib/utils'
import { BirthdayFields, ContactFields, TagInput, type ContactValue } from './PersonFormFields'
import { birthdayInput, type BirthdayValue } from './birthday'
import { PRONOUNS, type Pronouns } from './labels'
import { cropToBlob } from './photo'
import { PhotoCropper } from './PhotoCropper'
import type { PersonDetail, PersonInput } from './queries'
import { firstNameOf } from '@/lib/names'

/** What the form hands back: the person's fields, and what to do with the photo. */
export type PersonFormResult = {
  fields: PersonInput
  photo: { kind: 'keep' } | { kind: 'remove' } | { kind: 'new'; crop: Promise<Blob> }
}

type PersonFormProps = {
  /** The person being edited; nothing when adding someone. */
  person?: PersonDetail
  /** When adding someone: their name, already typed elsewhere (e.g. in search). */
  initialName?: string
  onSubmit: (result: PersonFormResult) => void
  onCancel: () => void
  saving: boolean
  error?: string
  formId: string
}

function birthdayOf(person?: PersonDetail): BirthdayValue {
  const birthday = person?.birthday
  return {
    day: birthday ? String(birthday.day) : '',
    month: birthday ? String(birthday.month) : '',
    year: birthday?.year ? String(birthday.year) : '',
  }
}

/** Add or edit someone (screens 2a, 2b, 2c). */
export function PersonForm({
  person,
  initialName,
  onSubmit,
  onCancel,
  saving,
  error,
  formId,
}: PersonFormProps) {
  const ownsDetails = !person || person.is_mine // tags and contact details: owner only
  const spaces = (useQuery(spacesQuery).data?.items ?? []).filter(canAddPeople)
  const [name, setName] = useState(person?.name ?? initialName ?? '')
  const [howWeMet, setHowWeMet] = useState(person?.how_we_met ?? '')
  const [work, setWork] = useState(person?.work ?? '')
  const [pronouns, setPronouns] = useState<Pronouns | ''>(person?.pronouns ?? '')
  const [spaceIds, setSpaceIds] = useState(person?.spaces.map((space) => space.id) ?? [])
  const [askFor, setAskFor] = useState<Space | null>(null)
  const [confirmedShared, dontAskAgain] = useSharedSpaceConfirmed()
  const [birthday, setBirthday] = useState(birthdayOf(person))
  const [contacts, setContacts] = useState<ContactValue[]>(
    person?.contact_methods.map(({ kind, label, value }) => ({ kind, label, value })) ?? [],
  )
  const [tags, setTags] = useState(person?.tags ?? [])
  const [caption, setCaption] = useState(person?.photo?.caption ?? '')
  const [moreOpen, setMoreOpen] = useState(false)
  const moreId = useId()

  // Photo: what's saved, what was picked and is being cropped, and the crop result.
  const [picked, setPicked] = useState<string | null>(null)
  const [cropped, setCropped] = useState<{ preview: string; blob: Promise<Blob> } | null>(null)
  const [removed, setRemoved] = useState(false)
  useEffect(() => () => void (picked && URL.revokeObjectURL(picked)), [picked])
  const preview = cropped?.preview
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  // After the crop step, put focus back on the photo button (its old place is gone).
  const photoInput = useRef<HTMLInputElement>(null)
  const focusPhotoButton = useRef(false)
  useEffect(() => {
    if (!picked && focusPhotoButton.current) {
      focusPhotoButton.current = false
      photoInput.current?.focus()
    }
  }, [picked])

  const photoUrl = cropped?.preview ?? (removed ? null : (person?.photo?.url ?? null))

  const pickFile = (file: File | undefined) => {
    if (file?.type.startsWith('image/')) setPicked(URL.createObjectURL(file))
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit({
      fields: {
        name: name.trim(),
        how_we_met: howWeMet.trim(),
        work: work.trim(),
        birthday: birthdayInput(birthday),
        pronouns: pronouns || null,
        // Tags and contact details belong to the owner: not sent at all otherwise.
        ...(ownsDetails && {
          tags,
          contact_methods: contacts.filter((contact) => contact.value.trim()),
        }),
        ...(!person?.is_me && { space_ids: spaceIds }),
        photo_caption: photoUrl ? caption.trim() : '',
      },
      photo: cropped
        ? { kind: 'new', crop: cropped.blob }
        : removed
          ? { kind: 'remove' }
          : { kind: 'keep' },
    })
  }

  if (picked) {
    return (
      <PhotoCropper
        src={picked}
        onCancel={() => {
          setPicked(null)
          focusPhotoButton.current = true
        }}
        onDone={(area, rotation) => {
          const blob = cropToBlob(picked, area, rotation)
          blob.then((result) => setCropped({ preview: URL.createObjectURL(result), blob }))
          setPicked(null)
          focusPhotoButton.current = true
          setRemoved(false)
          if (!caption) setCaption(firstNameOf(name))
        }}
      />
    )
  }

  return (
    <form id={formId} onSubmit={submit} className="flex flex-col gap-5">
      {/* Photo: drop or pick a file, then crop it. */}
      <div
        className="flex items-center gap-4"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          pickFile(event.dataTransfer.files[0])
        }}
      >
        <Polaroid
          seed={person?.id ?? 'new'}
          photoUrl={photoUrl}
          size="md"
          caption={photoUrl ? caption : undefined}
        />
        <div className="flex flex-col items-start gap-1.5">
          <FileButton ref={photoInput} accept="image/*" onFile={pickFile}>
            <ImagePlus aria-hidden />
            {photoUrl ? 'Replace photo' : 'Add photo'}
          </FileButton>
          {photoUrl && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setCropped(null)
                setRemoved(true)
              }}
            >
              <Trash2 aria-hidden />
              Remove photo
            </Button>
          )}
          {!photoUrl && <span className="type-small text-ink-faint">or drop one here</span>}
        </div>
      </div>
      {photoUrl && (
        <div>
          <Label htmlFor="person-caption">Written on the polaroid</Label>
          <Input
            id="person-caption"
            maxLength={40}
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            className="type-hand"
          />
        </div>
      )}

      <div>
        <Label htmlFor="person-name">Name</Label>
        <Input
          id="person-name"
          required
          maxLength={200}
          autoFocus={!person}
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <fieldset>
        <legend className={labelClass}>
          Pronouns <span className="font-mono tracking-normal normal-case">optional</span>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {(['', ...Object.keys(PRONOUNS)] as (Pronouns | '')[]).map((option) => (
            <Choice
              key={option || 'unset'}
              name="pronouns"
              checked={pronouns === option}
              onChange={() => setPronouns(option)}
            >
              {option ? PRONOUNS[option] : 'Not set'}
            </Choice>
          ))}
        </div>
        <p className="mt-1.5 type-small text-ink-faint">
          Lets FolkBook say “sister” or “father-in-law” instead of “sibling” or “parent-in-law”.
        </p>
      </fieldset>

      <div>
        <Label htmlFor="person-met">How we met</Label>
        <Input
          id="person-met"
          maxLength={300}
          placeholder="Hackathon in Berlin, March 2026"
          aria-describedby="person-met-hint"
          value={howWeMet}
          onChange={(event) => setHowWeMet(event.target.value)}
        />
        <p id="person-met-hint" className="mt-1.5 type-small text-ink-faint">
          One line is plenty. This is what you&apos;ll read in two years.
        </p>
      </div>

      {spaces.length > 0 && !person?.is_me && (
        <fieldset>
          <legend className={labelClass}>Spaces</legend>
          <div className="flex flex-wrap gap-2">
            {spaces.map((space) => {
              const on = spaceIds.includes(space.id)
              return (
                <button
                  key={space.id}
                  type="button"
                  aria-pressed={on}
                  data-space={space.color}
                  onClick={() => {
                    // Showing someone to other people for the first time: ask (4j, 4k).
                    const shownToOthers =
                      !on &&
                      space.member_count > 0 &&
                      !person?.spaces.some((ref) => ref.id === space.id) &&
                      !confirmedShared.includes(space.id)
                    if (shownToOthers) setAskFor(space)
                    else
                      setSpaceIds(
                        on ? spaceIds.filter((id) => id !== space.id) : [...spaceIds, space.id],
                      )
                  }}
                  className={cn(
                    'inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-md font-medium',
                    on
                      ? 'border-transparent bg-space text-on-space'
                      : 'border-line-strong bg-card text-ink-soft hover:text-ink',
                  )}
                >
                  {!on && <span aria-hidden className="h-3.5 w-0.75 rounded-full bg-space" />}
                  {space.name}
                  {on && <span aria-hidden>✓</span>}
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      <div className="rounded-card border border-line">
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls={moreId}
          onClick={() => setMoreOpen(!moreOpen)}
          className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left"
        >
          <span className="font-medium">More details</span>
          <span className="type-meta text-ink-faint">
            work · birthday{ownsDetails && ' · contact · tags'}
          </span>
          <ChevronDown
            aria-hidden
            className={cn('ml-auto size-4 transition-transform', moreOpen && 'rotate-180')}
          />
        </button>
        {moreOpen && (
          <div id={moreId} className="flex flex-col gap-5 border-t border-line p-4">
            <div>
              <Label htmlFor="person-work">Work</Label>
              <Input
                id="person-work"
                maxLength={200}
                placeholder="Designer at Spotify"
                value={work}
                onChange={(event) => setWork(event.target.value)}
              />
            </div>
            <BirthdayFields value={birthday} onChange={setBirthday} />
            {ownsDetails && (
              <>
                <ContactFields value={contacts} onChange={setContacts} />
                <TagInput value={tags} onChange={setTags} />
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="type-small text-danger">
          {error}
        </p>
      )}

      {askFor && (
        <SharedSpaceConfirm
          space={askFor}
          personName={name.trim() || 'They'}
          onCancel={() => setAskFor(null)}
          onConfirm={(remember) => {
            if (remember) dontAskAgain(askFor.id)
            setSpaceIds([...spaceIds, askFor.id])
            setAskFor(null)
          }}
        />
      )}

      <FormDialogFooter submitLabel="Save person" busy={saving} onCancel={onCancel} />
    </form>
  )
}

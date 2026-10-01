import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Check, Copy } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { setUpServer } from '@/api/session'
import { AuthFrame } from '@/components/AuthFrame'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createInvite, inviteLink } from '@/features/invites/queries'
import { birthdayInput, type BirthdayValue } from '@/features/person/birthday'
import { BirthdayFields } from '@/features/person/PersonFormFields'
import { updatePerson } from '@/features/person/queries'
import { usePageTitle } from '@/lib/usePageTitle'
import { cn } from '@/lib/utils'

type Step = 'welcome' | 'account' | 'me' | 'extras'
const STEPS = [
  { step: 'account', label: 'Account' },
  { step: 'me', label: 'Me' },
  { step: 'extras', label: 'Extras' },
] as const

/** First run: the welcome, the admin account, your Me, and optional extras (5e–5h). */
export function SetupPage() {
  const [step, setStep] = useState<Step>('welcome')
  const [account, setAccount] = useState({ email: '', password: '' })
  usePageTitle('Set up FolkBook')

  return (
    <AuthFrame>
      {step === 'welcome' && (
        <>
          <h1 className="mt-6 type-title">Welcome to your FolkBook</h1>
          <p className="mt-2 text-ink-soft">
            A private notebook for the people in your life. You&apos;re setting up this server, so
            you&apos;ll be its admin.
          </p>
          <Button className="mt-6 w-full" onClick={() => setStep('account')}>
            Get started
          </Button>
        </>
      )}
      {step !== 'welcome' && <Progress step={step} />}
      {step === 'account' && (
        <AccountStep
          initial={account}
          onDone={(value) => {
            setAccount(value)
            setStep('me')
          }}
        />
      )}
      {step === 'me' && (
        <MeStep
          account={account}
          onBack={() => setStep('account')}
          onDone={() => setStep('extras')}
        />
      )}
      {step === 'extras' && <ExtrasStep />}
    </AuthFrame>
  )
}

function Progress({ step }: { step: Step }) {
  const current = STEPS.findIndex((item) => item.step === step)
  return (
    <ol aria-label="Steps" className="mt-6 flex gap-4 type-meta text-ink-faint">
      {STEPS.map((item, index) => (
        <li
          key={item.step}
          aria-current={index === current ? 'step' : undefined}
          className={cn('flex items-center gap-1.5', index === current && 'text-ink')}
        >
          <span
            aria-hidden
            className={cn(
              'flex size-5 items-center justify-center rounded-full border border-line-strong',
              index < current && 'border-accent bg-accent text-on-accent',
              index === current && 'border-ink',
            )}
          >
            {index < current ? <Check className="size-3" /> : index + 1}
          </span>
          {item.label}
        </li>
      ))}
    </ol>
  )
}

function StepPage({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <>
      <h1 className="mt-4 type-title">{title}</h1>
      <p className="mt-1.5 text-ink-soft">{note}</p>
      {children}
    </>
  )
}

type Account = { email: string; password: string }

function AccountStep({
  initial,
  onDone,
}: {
  initial: Account
  onDone: (account: Account) => void
}) {
  const [mismatch, setMismatch] = useState(false)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password'))
    if (password !== form.get('again')) return setMismatch(true)
    onDone({ email: String(form.get('email')).trim(), password })
  }

  return (
    <StepPage title="Create the admin account" note="You can invite people later.">
      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            defaultValue={initial.email}
            required
          />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            defaultValue={initial.password}
            required
          />
          <p className="mt-1.5 type-small text-ink-faint">
            At least 8 characters. A long passphrase beats symbols.
          </p>
        </div>
        <div>
          <Label htmlFor="again">Password again</Label>
          <Input
            id="again"
            name="again"
            type="password"
            autoComplete="new-password"
            defaultValue={initial.password}
            required
            aria-invalid={mismatch || undefined}
          />
        </div>
        {mismatch && (
          <p role="alert" className="type-small text-danger">
            The passwords don&apos;t match.
          </p>
        )}
        <Button type="submit">Continue</Button>
      </form>
    </StepPage>
  )
}

function MeStep({
  account,
  onBack,
  onDone,
}: {
  account: Account
  onBack: () => void
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [birthday, setBirthday] = useState<BirthdayValue>({ day: '', month: '', year: '' })
  const create = useMutation({
    mutationFn: async (name: string) => {
      const user = await setUpServer(queryClient, { ...account, name })
      const born = birthdayInput(birthday)
      if (born && user.me) await updatePerson(user.me.id, { birthday: born })
    },
    onSuccess: onDone,
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    create.mutate(String(new FormData(event.currentTarget).get('name')).trim())
  }

  return (
    <StepPage
      title="Now you: the “Me” in the middle"
      note="Everyone in your graph connects back to this page."
    >
      <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        <div>
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoComplete="name" required maxLength={200} />
        </div>
        <BirthdayFields value={birthday} onChange={setBirthday} />
        {create.error && (
          <p role="alert" className="type-small text-danger">
            {create.error.message}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onBack} disabled={create.isPending}>
            Back
          </Button>
          <Button type="submit" className="flex-1" disabled={create.isPending}>
            {create.isPending ? 'Setting up…' : 'Continue'}
          </Button>
        </div>
      </form>
    </StepPage>
  )
}

function ExtrasStep() {
  const navigate = useNavigate()
  const invite = useMutation({
    mutationFn: () => createInvite(),
  })
  const [copied, setCopied] = useState(false)
  const link = invite.data && inviteLink(invite.data.path)

  const copy = async () => {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
  }

  return (
    <StepPage
      title="One more thing, if you like"
      note="Skip it if you like. It also lives in Settings."
    >
      <div className="mt-5 rounded-card border border-line bg-paper p-4">
        <h2 className="type-heading">Invite others</h2>
        <p className="mt-1 type-small text-ink-soft">
          Make an invite link for family or friends on this server. It works once and expires in a
          week.
        </p>
        {link ? (
          <div className="mt-3 flex gap-2">
            <Input
              readOnly
              value={link}
              aria-label="Invite link"
              onFocus={(event) => event.target.select()}
            />
            <Button variant="secondary" onClick={() => void copy()} aria-label="Copy the link">
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            className="mt-3"
            disabled={invite.isPending}
            onClick={() => invite.mutate()}
          >
            Create link
          </Button>
        )}
        {invite.error && <p className="mt-2 type-small text-danger">{invite.error.message}</p>}
      </div>
      <p className="mt-3 type-small text-ink-faint">
        Importing contacts and adding an AI key for Quick capture come later, in Settings.
      </p>
      <Button className="mt-6 w-full" onClick={() => void navigate({ to: '/', replace: true })}>
        Open FolkBook
      </Button>
    </StepPage>
  )
}

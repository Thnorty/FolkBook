import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'

export type TestResult = { ok: boolean; message: string }

type SendTestEmailProps = {
  /** Where it goes, shown until it's sent: "Goes to ela@…". */
  goesTo: string
  send: () => Promise<TestResult>
  /** Checked first, e.g. that a form's fields are filled in. */
  canSend?: () => boolean
}

const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' })

/** Send test email, and where it goes or how it went (screens 5r, 5w). */
export function SendTestEmail({ goesTo, send, canSend = () => true }: SendTestEmailProps) {
  const test = useMutation({ mutationFn: send })
  const result = test.data
  const failed = test.error?.message ?? (result && !result.ok ? result.message : null)

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button
        type="button"
        variant="secondary"
        disabled={test.isPending}
        onClick={() => canSend() && test.mutate()}
      >
        Send test email
      </Button>
      <p role="status" className={failed ? 'type-small text-danger' : 'type-small text-ink-soft'}>
        {test.isPending
          ? 'Sending…'
          : (failed ??
            (result?.ok
              ? `✓ ${result.message} · ${timeFormat.format(test.submittedAt)}`
              : `Goes to ${goesTo}`))}
      </p>
    </div>
  )
}

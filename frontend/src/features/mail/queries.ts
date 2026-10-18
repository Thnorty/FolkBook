import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/api/client'
import type { components } from '@/api/schema'

export type MailSettings = components['schemas']['MailSettingsOut']
export type Smtp = components['schemas']['SmtpOut']
export type SmtpIn = components['schemas']['SmtpIn']

/** Whether this server can send email. Open to anyone: the log-in page asks it too. */
export const mailStatusQuery = queryOptions({
  queryKey: ['mail', 'status'],
  queryFn: ({ signal }) => unwrap(api.GET('/api/mail/status', { signal })),
})

/** The server's SMTP settings (admins). Never the password. */
export const mailSettingsQuery = queryOptions({
  queryKey: ['mail', 'settings'],
  queryFn: ({ signal }) => unwrap(api.GET('/api/mail', { signal })),
})

function settled(queryClient: QueryClient, settings: MailSettings) {
  queryClient.setQueryData(mailSettingsQuery.queryKey, settings)
  queryClient.setQueryData(mailStatusQuery.queryKey, { ready: settings.ready })
  return settings
}

export async function saveMail(queryClient: QueryClient, body: SmtpIn) {
  return settled(queryClient, await unwrap(api.PUT('/api/mail', { body })))
}

export async function removeMail(queryClient: QueryClient) {
  return settled(queryClient, await unwrap(api.DELETE('/api/mail')))
}

/** Send a short email to yourself: through `smtp`, or the settings in use without it. */
export const sendTestMail = (smtp: SmtpIn | null) =>
  unwrap(api.POST('/api/mail/test', { body: { smtp } }))

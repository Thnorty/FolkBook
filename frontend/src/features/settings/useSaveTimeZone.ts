import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { browserTimeZone, reminderSettingsQuery, saveReminderSettings } from './queries'

/**
 * The digest comes at 08:00 where the user is, which the server only knows once the browser
 * has told it. Most people never open Settings → Reminders, so any page saves it until then.
 */
export function useSaveTimeZone() {
  const queryClient = useQueryClient()
  const settings = useQuery(reminderSettingsQuery).data
  const missing = settings !== undefined && !settings.time_zone && browserTimeZone() !== ''

  useEffect(() => {
    // Nothing to tell the user if it fails: the next page load tries again.
    if (missing) saveReminderSettings(queryClient, {}).catch(() => {})
  }, [missing, queryClient])
}

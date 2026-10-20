import { useQuery } from '@tanstack/react-query'
import { birthdaysQuery } from '@/features/today/queries'
import { isoDay } from '@/lib/dates'
import type { PersonDetail } from './queries'

/**
 * Whether it's their birthday today. The server says so (Today's birthdays), since it knows
 * the 29 February rule and who you can see; your own isn't in that list.
 */
export function useBirthdayToday(person: PersonDetail) {
  const today = isoDay()
  const birthdays = useQuery({
    ...birthdaysQuery(today),
    enabled: Boolean(person.birthday) && !person.is_me,
  }).data
  const birthday = birthdays?.find((each) => each.person.id === person.id && each.on === today)
  return birthday && { today, turns: birthday.turns }
}

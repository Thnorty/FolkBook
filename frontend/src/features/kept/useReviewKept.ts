import { useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'

/** Go to the kept copies: the profile when there's one, otherwise the People list. */
export function useReviewKept() {
  const navigate = useNavigate()
  return useCallback(
    (kept: { id: string }[]) =>
      kept.length === 1
        ? void navigate({ to: '/people/$personId', params: { personId: kept[0].id } })
        : void navigate({ to: '/people', search: { kept: true } }),
    [navigate],
  )
}

import { useState } from 'react'

/**
 * Copy `text`, and say when it worked. Without a clipboard (browsers have none on plain-HTTP
 * pages, as on a server at home) or when copying fails, it selects `field` instead, so the
 * text can be copied by hand.
 */
export function useCopy(text: string) {
  const [copied, setCopied] = useState(false)
  const copy = (field?: HTMLInputElement | null) => {
    const selectInstead = () => {
      setCopied(false)
      field?.select()
    }
    if (!navigator.clipboard) return selectInstead()
    navigator.clipboard.writeText(text).then(() => setCopied(true), selectInstead)
  }
  return { copied, copy }
}

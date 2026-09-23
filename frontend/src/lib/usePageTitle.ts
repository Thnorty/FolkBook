import { useEffect } from 'react'

/** Name the browser tab after the page: "People · FolkBook". */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · FolkBook`
  }, [title])
}

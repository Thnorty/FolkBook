export type PeopleSearch = {
  q?: string
  space?: string
  needs?: boolean
  view?: 'grid'
  /** A person shown in the side panel, on desktop. */
  peek?: string
}

/** Reads the People page's URL (?q=…&space=…&needs=true&view=grid), ignoring anything odd. */
export function validatePeopleSearch(search: Record<string, unknown>): PeopleSearch {
  return {
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    space: typeof search.space === 'string' && search.space ? search.space : undefined,
    needs: search.needs === true || search.needs === 'true' ? true : undefined,
    view: search.view === 'grid' ? 'grid' : undefined,
    peek: typeof search.peek === 'string' && search.peek ? search.peek : undefined,
  }
}

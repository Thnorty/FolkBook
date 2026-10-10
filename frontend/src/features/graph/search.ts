/** The graph page's URL: a route ("How do I know…?") or a focus, never both. */
export type GraphSearch = {
  /** Show how you know this person: the route from your Me. */
  how?: string
  /** Focus mode: this person and the people one step away. */
  focus?: string
}

const name = (value: unknown) => (typeof value === 'string' && value ? value : undefined)

/** Reads ?how=… or ?focus=…, ignoring anything odd; a route wins over a focus. */
export function validateGraphSearch(search: Record<string, unknown>): GraphSearch {
  const how = name(search.how)
  // `focus: undefined` spelled out: the router keeps the URL's other params unless told.
  return how ? { how, focus: undefined } : { focus: name(search.focus) }
}

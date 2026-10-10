/** The graph page's URL: a route ("How do I know…?") or a focus, never both. */
export type GraphSearch = {
  /** Show how you know this person: the route from your Me. */
  how?: string
  /** Focus mode: this person and the people one step away… */
  focus?: string
  /** …or two steps away. One is the default, so only 2 is ever kept. */
  hops?: 2
}

const name = (value: unknown) => (typeof value === 'string' && value ? value : undefined)

/** Reads ?how=… or ?focus=…&hops=2, ignoring anything odd; a route wins over a focus. */
export function validateGraphSearch(search: Record<string, unknown>): GraphSearch {
  const how = name(search.how)
  // Dropped params spelled out as undefined: the router keeps the URL's others unless told.
  if (how) return { how, focus: undefined, hops: undefined }
  const focus = name(search.focus)
  const twoSteps = focus && (search.hops === 2 || search.hops === '2')
  return { focus, hops: twoSteps ? 2 : undefined }
}

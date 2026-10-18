/** The graph page's URL: a route ("How do I know…?"), a family tree or a focus, one at a time. */
export type GraphSearch = {
  /** Show how you know this person: the route from your Me. */
  how?: string
  /** Family tree mode: this person's family, by generation. */
  tree?: string
  /** Focus mode: this person and the people one step away… */
  focus?: string
  /** …or two steps away. One is the default, so only 2 is ever kept. */
  hops?: 2
}

const name = (value: unknown) => (typeof value === 'string' && value ? value : undefined)

/** Reads ?how=…, ?tree=… or ?focus=…&hops=2, ignoring anything odd; in that order of precedence. */
export function validateGraphSearch(search: Record<string, unknown>): GraphSearch {
  const how = name(search.how)
  // Dropped params spelled out as undefined: the router keeps the URL's others unless told.
  if (how) return { how, tree: undefined, focus: undefined, hops: undefined }
  const tree = name(search.tree)
  if (tree) return { tree, how: undefined, focus: undefined, hops: undefined }
  const focus = name(search.focus)
  const twoSteps = focus && (search.hops === 2 || search.hops === '2')
  return { focus, hops: twoSteps ? 2 : undefined }
}

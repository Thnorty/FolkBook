/** A full address on this server for an API-given `path`, e.g. an invite's "/i/…". */
export const appLink = (path: string) => `${window.location.origin}${path}`

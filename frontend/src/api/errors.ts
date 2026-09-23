/** One problem with the submitted data, from a 422 response. */
export type ValidationIssue = { loc: (string | number)[]; msg: string }

/** The API's error body: a message, or the list of problems for invalid input. */
type Detail = string | ValidationIssue[]

const FALLBACK_MESSAGES: Record<number, string> = {
  0: "Can't reach the server. Check your connection and try again.",
  401: 'Your session has ended. Log in again.',
  403: "You don't have permission to do that.",
  404: "This doesn't exist, or you can't see it.",
}

/**
 * Every failed API call rejects with an ApiError, so there's one shape to handle.
 * `status` is the HTTP status, or 0 when the server couldn't be reached.
 */
export class ApiError extends Error {
  readonly status: number
  readonly detail: Detail | undefined

  constructor(status: number, detail?: Detail) {
    super(messageFor(status, detail))
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    const body: unknown = await response.json().catch(() => undefined)
    const detail =
      body && typeof body === 'object' && 'detail' in body ? (body.detail as Detail) : undefined
    return new ApiError(response.status, detail)
  }
}

function messageFor(status: number, detail: Detail | undefined): string {
  if (typeof detail === 'string' && detail) return detail
  if (Array.isArray(detail) && detail.length) return detail.map((issue) => issue.msg).join(' ')
  return FALLBACK_MESSAGES[status] ?? 'Something went wrong. Try again in a moment.'
}

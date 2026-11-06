import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './schema'

const TOKEN_KEY = 'countersign.token'

/** Fired on any 401 so the session can end cleanly (expired, revoked, or password changed). */
export const UNAUTHORIZED_EVENT = 'countersign:unauthorized'

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export class ApiError extends Error {
  status: number
  requestId?: string
  constructor(status: number, title: string, detail?: string, requestId?: string) {
    super(detail ? `${title}: ${detail}` : title)
    this.status = status
    this.requestId = requestId
  }
}

const auth: Middleware = {
  onRequest({ request }) {
    const token = tokenStore.get()
    if (token) request.headers.set('Authorization', `Bearer ${token}`)
    return request
  },
}

export const api = createClient<paths>({ baseUrl: '' })
api.use(auth)

/** Unwrap an openapi-fetch result, raising ApiError with the problem+json detail. */
export async function unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await p
  if (error !== undefined || data === undefined) {
    const e = (error ?? {}) as { title?: string; detail?: string; request_id?: string }
    if (response.status === 401) {
      tokenStore.clear()
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    }
    throw new ApiError(response.status, e.title ?? response.statusText, e.detail, e.request_id)
  }
  return data
}

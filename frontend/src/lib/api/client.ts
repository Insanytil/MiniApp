export interface ValidationIssue {
  field: string | number | null
  message: string
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly issues: ValidationIssue[] = [],
    public readonly detail?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Une erreur inattendue est survenue.'
}

type RequestOptions = Omit<RequestInit, 'body' | 'credentials'> & {
  body?: unknown
  organizationId?: string
  organizationScoped?: boolean
  authenticated?: boolean
}

type ClientConfig = {
  baseUrl: string
  csrfCookieName?: string
  csrfHeaderName?: string
  readCookie?: () => string
}

export function readCookieValue(
  cookies: string,
  name: string,
): string | undefined {
  const prefix = `${name}=`
  const cookie = cookies
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
  if (!cookie) return undefined
  try {
    return decodeURIComponent(cookie.slice(prefix.length))
  } catch {
    return undefined
  }
}

export function createApiClient(config: ClientConfig) {
  let activeOrganizationId: string | null = null
  let onUnauthorized: (() => void) | undefined
  const baseUrl = config.baseUrl.replace(/\/$/, '')

  return {
    setOrganization(id: string | null) {
      activeOrganizationId = id
    },
    setUnauthorizedHandler(handler: () => void) {
      onUnauthorized = handler
    },
    async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
      // All calls stay under the configured API; never leak cookies/CSRF to arbitrary URLs.
      if (
        !path.startsWith('/') ||
        path.startsWith('//') ||
        path.includes('://')
      ) {
        throw new Error('Le chemin API doit être relatif et commencer par /.')
      }
      const {
        body,
        organizationId,
        organizationScoped = false,
        authenticated = true,
        ...init
      } = options
      const headers = new Headers(init.headers)
      headers.set('Accept', 'application/json')
      if (body !== undefined) headers.set('Content-Type', 'application/json')
      const scope =
        organizationId ?? (organizationScoped ? activeOrganizationId : null)
      if (organizationScoped && !scope)
        throw new Error('Sélectionnez une organisation pour continuer.')
      if (scope) headers.set('X-Organization-ID', scope)
      const method = (init.method ?? 'GET').toUpperCase()
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        const cookie =
          config.readCookie?.() ??
          (typeof document === 'undefined' ? '' : document.cookie)
        const csrf = readCookieValue(
          cookie,
          config.csrfCookieName ?? 'miniapp_csrf',
        )
        if (csrf) headers.set(config.csrfHeaderName ?? 'X-CSRF-Token', csrf)
      }
      let response: Response
      try {
        response = await fetch(`${baseUrl}${path}`, {
          ...init,
          method,
          headers,
          credentials: 'include',
          body: body === undefined ? undefined : JSON.stringify(body),
        })
      } catch (error) {
        if (init.signal?.aborted) throw error
        throw new ApiError(
          0,
          'Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.',
        )
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          detail?: unknown
          errors?: ValidationIssue[]
        } | null
        const messages: Record<number, string> = {
          401: 'Votre session a expiré. Veuillez vous reconnecter.',
          403: 'Vous ne disposez pas des droits nécessaires pour cette action.',
          404: 'La ressource demandée est introuvable.',
          422: 'Vérifiez les informations saisies.',
          429: 'Trop de tentatives. Veuillez patienter avant de réessayer.',
        }
        if (response.status === 401 && authenticated && !init.signal?.aborted)
          onUnauthorized?.()
        const issues = Array.isArray(payload?.errors) ? payload.errors : []
        const detail =
          typeof payload?.detail === 'string' ? payload.detail : undefined
        throw new ApiError(
          response.status,
          messages[response.status] ??
            (response.status >= 500
              ? 'Le serveur rencontre un problème. Veuillez réessayer.'
              : (detail ?? 'La requête a échoué.')),
          issues,
          detail,
        )
      }
      if (response.status === 204 || method === 'HEAD') return undefined as T
      return response.json() as Promise<T>
    },
  }
}

import { createApiClient } from './client'

export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL || '/api',
  csrfCookieName: import.meta.env.VITE_CSRF_COOKIE_NAME || 'miniapp_csrf',
  csrfHeaderName: import.meta.env.VITE_CSRF_HEADER_NAME || 'X-CSRF-Token',
})

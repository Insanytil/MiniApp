import { queryOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { ApiError } from '@/lib/api/client'
import { clearOrganizationSelection } from '@/features/organizations/selection'

export interface UserOrganization {
  id: string
  name: string
  slug: string
  role: 'organization_admin' | 'organization_user'
}

export interface CurrentUser {
  id: string
  email: string
  is_superuser: boolean
  is_verified: boolean
  default_organization_id: string | null
  organizations: UserOrganization[]
}

export const sessionKey = ['auth', 'me'] as const
export const sessionQuery = queryOptions({
  queryKey: sessionKey,
  queryFn: async ({ signal }): Promise<CurrentUser | null> => {
    try {
      return await api.request<CurrentUser>('/auth/me', { signal })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null
      throw error
    }
  },
  staleTime: 60_000,
  retry: false,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  refetchInterval: 60_000,
})

export async function clearSession(client: QueryClient) {
  clearOrganizationSelection()
  api.setOrganization(null)
  await client.cancelQueries()
  client.clear()
  client.setQueryData(sessionKey, null)
}

// Explicit authentication changes must bypass cached anonymous/session data.
export function refreshSession(client: QueryClient) {
  return client.fetchQuery({ ...sessionQuery, staleTime: 0 })
}

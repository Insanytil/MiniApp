import {
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '@/lib/api'
import { ApiError } from '@/lib/api/client'
import { listSearchParams } from '@/components/data-table/server-pagination'
import type {
  ListParams,
  PageResponse,
} from '@/components/data-table/server-pagination'

export interface PlatformUser {
  id: string
  email: string
  is_active: boolean
  is_verified: boolean
  created_at: string
  memberships: {
    organization_id: string
    organization_name: string
    organization_slug: string
    organization_is_active: boolean
    role: 'organization_admin' | 'organization_user'
    is_active: boolean
  }[]
}

export const userKeys = ['platform', 'users'] as const
export const userSchema = z.object({
  email: z
    .email('Saisissez une adresse e-mail valide.')
    .max(320, '320 caractères maximum.'),
  organizationId: z.string(),
  role: z.enum(['organization_admin', 'organization_user']),
})
export type UserInput = z.infer<typeof userSchema>

export const usersQuery = (params: ListParams) =>
  queryOptions({
    queryKey: [...userKeys, 'list', params],
    queryFn: ({ signal }) =>
      api.request<PageResponse<PlatformUser>>(
        `/platform/users?${listSearchParams(params)}`,
        { signal },
      ),
  })

export function useCreateUser() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: UserInput) => {
      const values = userSchema.parse(input)
      return api.request<{ user: PlatformUser; invitation_queued: boolean }>(
        '/platform/users',
        {
          method: 'POST',
          body: {
            email: values.email.trim().toLowerCase(),
            ...(values.organizationId
              ? { organization_id: values.organizationId, role: values.role }
              : {}),
          },
        },
      )
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: userKeys }),
        client.invalidateQueries({ queryKey: ['platform', 'organizations'] }),
      ])
    },
  })
}

export function useUserStatus() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (user: PlatformUser) =>
      api.request<void>(`/platform/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        body: { is_active: !user.is_active },
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: userKeys }),
        client.invalidateQueries({ queryKey: ['platform', 'organizations'] }),
      ])
    },
  })
}

export function userError(error: unknown) {
  if (error instanceof ApiError && error.status === 409)
    return 'Un compte utilise déjà cette adresse e-mail.'
  return error instanceof Error ? error.message : 'L’opération a échoué.'
}

export async function searchUsersForOrganization(
  organizationId: string,
  search: string,
  signal: AbortSignal,
) {
  const result = await api.request<PageResponse<PlatformUser>>(
    `/platform/users?${listSearchParams({ page: 1, pageSize: 20, search })}`,
    { signal },
  )
  return {
    items: result.items.map((user) => {
      const membership = user.memberships.find(
        (item) => item.organization_id === organizationId,
      )
      return {
        value: user.id,
        label: user.email,
        description: membership
          ? `Déjà membre · ${membership.is_active ? 'accès actif' : 'accès désactivé'}`
          : !user.is_active
            ? 'Compte suspendu'
            : !user.is_verified
              ? 'Compte en attente d’activation'
              : 'Compte actif',
        disabled: !!membership,
      }
    }),
    hasMore: result.pagination.total > result.items.length,
  }
}

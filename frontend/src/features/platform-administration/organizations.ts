import {
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '@/lib/api'
import { ApiError } from '@/lib/api/client'
import { sessionKey } from '@/features/auth/session'
import { userKeys } from './users'
import { listSearchParams } from '@/components/data-table/server-pagination'
import type {
  ListParams,
  PageResponse,
} from '@/components/data-table/server-pagination'

export interface Organization {
  id: string
  name: string
  slug: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface OrganizationListItem extends Organization {
  members_count: number
}

export const organizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Le nom est obligatoire.')
    .max(255, '255 caractères maximum.'),
  slug: z
    .string()
    .min(1, 'L’identifiant est obligatoire.')
    .max(100, '100 caractères maximum.')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Utilisez des lettres minuscules, des chiffres et des tirets simples.',
    ),
})
export type OrganizationInput = z.infer<typeof organizationSchema>
export const organizationKeys = ['platform', 'organizations'] as const
export const organizationsQuery = (params: ListParams) =>
  queryOptions({
    queryKey: [...organizationKeys, 'list', params],
    queryFn: ({ signal }) =>
      api.request<PageResponse<OrganizationListItem>>(
        `/platform/organizations?${listSearchParams(params)}`,
        { signal },
      ),
  })

export function toSlug(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/g, '')
}

export function organizationError(
  error: unknown,
  action: 'save' | 'delete' | 'status',
) {
  if (error instanceof ApiError && error.status === 409) {
    if (action === 'delete')
      return 'Cette organisation possède encore des membres. Retirez leurs adhésions avant de la supprimer.'
    if (error.message.includes('slug'))
      return 'Cet identifiant est déjà utilisé par une autre organisation.'
    return 'Une organisation porte déjà ce nom.'
  }
  return error instanceof Error
    ? error.message
    : 'L’opération a échoué. Veuillez réessayer.'
}

export function useSaveOrganization() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: OrganizationInput }) =>
      api.request<Organization>(
        id
          ? `/platform/organizations/${encodeURIComponent(id)}`
          : '/platform/organizations',
        {
          method: id ? 'PATCH' : 'POST',
          body: organizationSchema.parse(values),
        },
      ),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: organizationKeys }),
        client.invalidateQueries({ queryKey: userKeys }),
        client.invalidateQueries({ queryKey: sessionKey }),
      ])
    },
  })
}

export function useOrganizationAction() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      organization,
      action,
    }: {
      organization: Organization
      action: 'delete' | 'status'
    }) =>
      api.request<void | Organization>(
        `/platform/organizations/${encodeURIComponent(organization.id)}`,
        {
          method: action === 'delete' ? 'DELETE' : 'PATCH',
          ...(action === 'status'
            ? { body: { is_active: !organization.is_active } }
            : {}),
        },
      ),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: organizationKeys }),
        client.invalidateQueries({ queryKey: userKeys }),
        client.invalidateQueries({ queryKey: sessionKey }),
      ])
    },
  })
}

export async function searchOrganizationOptions(
  search: string,
  signal: AbortSignal,
  activeOnly = true,
) {
  const result = await api.request<PageResponse<Organization>>(
    `/platform/organizations?${listSearchParams({ page: 1, pageSize: 20, search })}${activeOnly ? '&is_active__eq=true' : ''}`,
    { signal },
  )
  return {
    items: result.items.map((organization) => ({
      value: organization.id,
      label: organization.name,
      description:
        organization.is_active === false
          ? `${organization.slug} · Organisation suspendue`
          : organization.slug,
    })),
    hasMore: result.pagination.total > result.items.length,
  }
}

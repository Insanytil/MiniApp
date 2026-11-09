import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '@/lib/api'
import { ApiError, errorMessage } from '@/lib/api/client'
import { organizationQueryKey } from '@/features/organizations/selection'
import { listSearchParams } from '@/components/data-table/server-pagination'
import type {
  ListParams,
  PageResponse,
} from '@/components/data-table/server-pagination'

export interface OrganizationUser {
  id: string
  email: string
  first_name: string
  last_name: string
  display_name: string
  is_active: boolean
  is_verified: boolean
  membership_is_active: boolean
  role: 'organization_admin' | 'organization_user'
  created_at: string
}
export const organizationUserSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Adresse e-mail invalide.')
    .max(320, '320 caractères maximum.'),
  role: z.enum(['organization_admin', 'organization_user']),
})
export type OrganizationUserInput = z.infer<typeof organizationUserSchema>
export const organizationUsersKey = (id: string) =>
  organizationQueryKey(id, 'users')
export const organizationUsersQuery = (id: string, params: ListParams) =>
  queryOptions({
    queryKey: [...organizationUsersKey(id), 'list', params],
    queryFn: ({ signal }) =>
      api.request<PageResponse<OrganizationUser>>(
        `/organization/users?${listSearchParams(params)}`,
        { organizationScoped: true, organizationId: id, signal },
      ),
  })
export function createOrganizationUser(
  organizationId: string,
  values: OrganizationUserInput,
) {
  return api.request<{ user: OrganizationUser; invitation_queued: boolean }>(
    '/organization/users',
    {
      method: 'POST',
      organizationScoped: true,
      organizationId,
      body: organizationUserSchema.parse(values),
    },
  )
}
export function setOrganizationUserAccess(
  organizationId: string,
  userId: string,
  isActive: boolean,
) {
  return api.request<void>(
    `/organization/users/${encodeURIComponent(userId)}/access`,
    {
      method: 'PATCH',
      organizationScoped: true,
      organizationId,
      body: { is_active: isActive },
    },
  )
}
export function requestOrganizationPasswordReset(
  organizationId: string,
  userId: string,
) {
  return api.request<{ queued: boolean }>(
    `/organization/users/${encodeURIComponent(userId)}/password-reset-email`,
    {
      method: 'POST',
      organizationScoped: true,
      organizationId,
    },
  )
}
export function organizationUserError(
  error: unknown,
  action: 'create' | 'access' | 'reset',
) {
  if (error instanceof ApiError) {
    if (error.status === 409)
      return action === 'create'
        ? 'Un compte utilise déjà cette adresse e-mail. Contactez un administrateur de la plateforme pour le rattacher à votre organisation.'
        : action === 'access'
          ? 'Vous ne pouvez pas suspendre votre propre accès à l’organisation.'
          : 'Le compte doit être activé avant de réinitialiser son mot de passe.'
    if (error.status === 404)
      return 'Cet utilisateur ou cette organisation n’est plus accessible.'
    if (error.status === 403)
      return 'Vous devez être administrateur de cette organisation pour effectuer cette action.'
  }
  return errorMessage(error)
}

const profileNameSchema = z
  .string()
  .trim()
  .max(100, '100 caractères maximum.')
  .refine(
    (value) =>
      [...value].every(
        (character) =>
          character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
      ),
    'Le nom ne peut pas contenir de caractères de contrôle.',
  )
export const organizationUserProfileSchema = z.object({
  first_name: profileNameSchema,
  last_name: profileNameSchema,
})
export type OrganizationUserProfileInput = z.infer<
  typeof organizationUserProfileSchema
>

export function updateOrganizationUserProfile(
  organizationId: string,
  userId: string,
  values: OrganizationUserProfileInput,
) {
  return api.request<OrganizationUser>(
    `/organization/users/${encodeURIComponent(userId)}/profile`,
    {
      method: 'PUT',
      organizationScoped: true,
      organizationId,
      body: organizationUserProfileSchema.parse(values),
    },
  )
}

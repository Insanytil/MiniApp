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

export interface EntityType {
  id: string
  name: string
  technical_name: string
  description: string | null
  fields_count: number
  relations_count: number
  system_fields: string[]
  created_at: string
  updated_at: string
}
export const entityTypeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Le nom est obligatoire.')
    .max(255, '255 caractères maximum.'),
  technical_name: z
    .string()
    .min(1, 'L’identifiant est obligatoire.')
    .max(100, '100 caractères maximum.')
    .regex(
      /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/,
      'Commencez par une lettre minuscule. Utilisez des lettres minuscules, des chiffres et des underscores simples.',
    ),
  description: z.string().trim().max(2000, '2 000 caractères maximum.'),
})
export type EntityTypeInput = z.infer<typeof entityTypeSchema>
export function toTechnicalName(name: string) {
  let result = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (/^[0-9]/.test(result)) result = `entity_${result}`
  return result.slice(0, 100).replace(/_+$/g, '')
}
export const entityTypeKeys = (id: string) =>
  organizationQueryKey(id, 'entity-types')
export const entityTypesQuery = (organizationId: string, params: ListParams) =>
  queryOptions({
    queryKey: [...entityTypeKeys(organizationId), 'list', params],
    queryFn: ({ signal }) =>
      api.request<PageResponse<EntityType>>(
        `/organization/entity-types?${listSearchParams(params)}`,
        { signal, organizationId, organizationScoped: true },
      ),
  })
export function saveEntityType(
  organizationId: string,
  values: EntityTypeInput,
  id?: string,
) {
  const parsed = id
    ? entityTypeSchema.pick({ name: true, description: true }).parse(values)
    : entityTypeSchema.parse(values)
  return api.request<EntityType>(
    `/organization/entity-types${id ? `/${encodeURIComponent(id)}` : ''}`,
    {
      method: id ? 'PATCH' : 'POST',
      organizationId,
      organizationScoped: true,
      body: { ...parsed, description: parsed.description || null },
    },
  )
}
export function deleteEntityType(organizationId: string, id: string) {
  return api.request<void>(
    `/organization/entity-types/${encodeURIComponent(id)}`,
    { method: 'DELETE', organizationId, organizationScoped: true },
  )
}
export function entityTypeError(error: unknown) {
  if (error instanceof ApiError) {
    if (
      error.status === 409 &&
      error.detail &&
      !error.detail.includes('technical name already exists')
    )
      return error.detail
    if (error.status === 409)
      return 'Cet identifiant technique est déjà utilisé dans cette organisation.'
    if (error.status === 404)
      return 'Ce type d’entité ou cette organisation n’est plus accessible.'
    if (error.status === 403)
      return 'Vous devez être administrateur de cette organisation.'
  }
  return errorMessage(error)
}

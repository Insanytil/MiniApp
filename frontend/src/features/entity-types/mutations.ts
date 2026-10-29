import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  deleteEntityType,
  entityTypeKeys,
  saveEntityType,
} from './entity-types'
import type { EntityTypeInput } from './entity-types'
import { navigationKey } from '@/features/organization-navigation/navigation'

export function useSaveEntityType(organizationId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ values, id }: { values: EntityTypeInput; id?: string }) =>
      saveEntityType(organizationId, values, id),
    retry: false,
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: entityTypeKeys(organizationId) }),
        client.invalidateQueries({ queryKey: navigationKey(organizationId) }),
      ]).then(() => undefined),
  })
}
export function useDeleteEntityType(organizationId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteEntityType(organizationId, id),
    retry: false,
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: entityTypeKeys(organizationId) }),
        client.invalidateQueries({ queryKey: navigationKey(organizationId) }),
      ]).then(() => undefined),
  })
}

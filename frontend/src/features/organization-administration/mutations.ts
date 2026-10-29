import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/toast'
import {
  createOrganizationUser,
  organizationUserError,
  organizationUsersKey,
  requestOrganizationPasswordReset,
  setOrganizationUserAccess,
} from './users'
import type { OrganizationUser } from './users'

export function useCreateOrganizationUser(organizationId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (values: Parameters<typeof createOrganizationUser>[1]) =>
      createOrganizationUser(organizationId, values),
    retry: false,
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: organizationUsersKey(organizationId),
      }),
  })
}
export function useOrganizationUserAccess(organizationId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      user,
      isActive,
    }: {
      user: OrganizationUser
      isActive: boolean
    }) => setOrganizationUserAccess(organizationId, user.id, isActive),
    retry: false,
    onSuccess: (_, { user, isActive }) =>
      toast.add({
        title: isActive ? 'Accès réactivé' : 'Accès suspendu',
        description: user.email,
        type: 'success',
      }),
    onSettled: () =>
      client.invalidateQueries({
        queryKey: organizationUsersKey(organizationId),
      }),
  })
}
export function useOrganizationPasswordReset(organizationId: string) {
  return useMutation({
    mutationFn: (user: OrganizationUser) =>
      requestOrganizationPasswordReset(organizationId, user.id),
    retry: false,
    onMutate: (user) => ({
      toastId: toast.add({
        title: 'Demande de réinitialisation…',
        description: user.email,
        type: 'loading',
        timeout: 0,
      }),
    }),
    onSuccess: (result, user, context) => {
      if (context)
        toast.update(context.toastId, {
          title: result.queued
            ? 'Email de réinitialisation mis en file'
            : 'L’email n’a pas pu être mis en file',
          description: user.email,
          type: result.queued ? 'success' : 'warning',
          timeout: result.queued ? 4500 : 0,
        })
    },
    onError: (error, user, context) => {
      if (context)
        toast.update(context.toastId, {
          title: 'Demande impossible',
          description: `${user.email} · ${organizationUserError(error, 'reset')}`,
          type: 'error',
          timeout: 0,
        })
    },
  })
}

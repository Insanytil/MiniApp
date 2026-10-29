import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/toast'
import { ApiError, errorMessage } from '@/lib/api/client'
import { userKeys } from './users'
import { setUserOrganizationAccess } from './user-memberships'

export function useUserOrganizationAccess() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      user,
      organization,
      isActive,
    }: {
      user: { id: string; email: string }
      organization: { id: string; name: string; is_active: boolean }
      isActive: boolean
    }) => setUserOrganizationAccess(user.id, organization.id, isActive),
    retry: false,
    onSuccess: async (_, { user, organization, isActive }) => {
      await client.invalidateQueries({ queryKey: userKeys })
      toast.add({
        title: isActive
          ? 'Accès individuel réactivé'
          : 'Accès à l’organisation suspendu',
        description: `${user.email} · ${organization.name}${isActive && !organization.is_active ? ' · L’organisation reste suspendue.' : ''}`,
        type: isActive && !organization.is_active ? 'warning' : 'success',
      })
    },
    onError: (error, { user, organization }) => {
      toast.add({
        title: 'L’accès n’a pas pu être modifié',
        description: `${user.email} · ${organization.name} · ${error instanceof ApiError && error.status === 404 ? 'Ce compte ou cette adhésion n’existe plus.' : errorMessage(error)}`,
        type: 'error',
        timeout: 0,
      })
      if (error instanceof ApiError && error.status === 404)
        void client.invalidateQueries({ queryKey: userKeys })
    },
  })
}

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/toast'
import { ApiError, errorMessage } from '@/lib/api/client'
import { organizationKeys } from './organizations'
import { userKeys } from './users'
import { addOrganizationMember } from './user-memberships'
import type { MembershipRole } from './user-memberships'

export function membershipLinkError(error: unknown) {
  if (error instanceof ApiError && error.status === 409)
    return 'Cet utilisateur est déjà membre de cette organisation. Si son accès est désactivé, réactivez-le depuis la liste de ses organisations.'
  if (error instanceof ApiError && error.status === 404)
    return 'L’utilisateur ou l’organisation n’existe plus. Actualisez la liste et réessayez.'
  return errorMessage(error)
}

export function useAddOrganizationMember() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      user,
      organization,
      role,
    }: {
      user: { id: string; email: string }
      organization: { id: string; name: string }
      role: MembershipRole
    }) => addOrganizationMember(organization.id, user.id, role),
    retry: false,
    onError: (error) => {
      if (error instanceof ApiError && [404, 409].includes(error.status)) {
        void client.invalidateQueries({ queryKey: userKeys })
        void client.invalidateQueries({ queryKey: organizationKeys })
      }
    },
    onSuccess: async (_, { user, organization, role }) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: userKeys }),
        client.invalidateQueries({ queryKey: organizationKeys }),
      ])
      toast.add({
        title: 'Membre ajouté à l’organisation',
        description: `${user.email} · ${organization.name} · ${role === 'organization_admin' ? 'Administrateur' : 'Utilisateur'}`,
        type: 'success',
      })
    },
  })
}

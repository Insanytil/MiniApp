import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/toast'
import { ApiError } from '@/lib/api/client'
import { userKeys } from './users'
import { sendUserEmail, userEmailActions, userEmailError } from './user-email'
import type { UserEmailAction } from './user-email'

export function useUserEmail() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      user,
      action,
    }: {
      user: { id: string; email: string }
      action: UserEmailAction
    }) => sendUserEmail(user.id, action),
    retry: false,
    onMutate: ({ user, action }) => ({
      toastId: toast.add({
        title: userEmailActions[action].pending,
        description: user.email,
        type: 'loading',
        timeout: 0,
      }),
    }),
    onSuccess: (result, { user, action }, context) => {
      if (!context) return
      toast.update(context.toastId, {
        title: result.queued
          ? userEmailActions[action].queued
          : 'Envoi non programmé',
        description: result.queued
          ? `${user.email} · La demande est en file d’envoi.`
          : `${user.email} · La demande n’a pas pu être mise en file. Réessayez.`,
        type: result.queued ? 'success' : 'warning',
        timeout: result.queued ? 4500 : 0,
      })
    },
    onError: (error, { user, action }, context) => {
      if (context)
        toast.update(context.toastId, {
          title: 'La demande d’envoi a échoué',
          description: `${user.email} · ${userEmailError(error, action)}`,
          type: 'error',
          timeout: 0,
        })
      if (error instanceof ApiError && [404, 409].includes(error.status)) {
        void client.invalidateQueries({ queryKey: userKeys })
      }
    },
  })
}

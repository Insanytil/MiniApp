import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/toast'
import { ApiError, errorMessage } from '@/lib/api/client'
import { jobScopeKey, performJobAction } from './jobs'

export function useJobAction(organizationId?: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'retry' | 'cancel' }) =>
      performJobAction(id, action, organizationId),
    retry: false,
    onSuccess: (result, variables) => {
      const { action } = variables
      const failed = action === 'retry' && !result?.queued
      toast.add({
        title: failed
          ? 'La remise en file a échoué'
          : action === 'retry'
            ? 'Job remis en file'
            : 'Job annulé',
        type: failed ? 'warning' : 'success',
        description: `Job ${variables.id}`,
        timeout: failed ? 0 : 4500,
      })
    },
    onError: (error) =>
      toast.add({
        title: 'Action impossible',
        description:
          error instanceof ApiError && error.status === 409
            ? 'L’état du job a changé. La liste va être actualisée.'
            : errorMessage(error),
        type: 'error',
      }),
    onSettled: () =>
      client.invalidateQueries({ queryKey: jobScopeKey(organizationId) }),
  })
}

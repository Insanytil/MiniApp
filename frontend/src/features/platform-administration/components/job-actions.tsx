import { Eye, LoaderCircle, MoreHorizontal, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { allowedJobActions } from '../jobs'
import type { JobStatus } from '../jobs'
import { useJobAction } from '../use-job-action'

export function JobActions({
  id,
  status,
  onDetails,
  batch = false,
  organizationId,
}: {
  id: string
  status: JobStatus
  onDetails?: () => void
  batch?: boolean
  organizationId?: string
}) {
  const mutation = useJobAction(organizationId)
  const allowed = allowedJobActions(status)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            disabled={mutation.isPending}
            aria-label={`Actions du job ${id}`}
          />
        }
      >
        {mutation.isPending ? (
          <LoaderCircle className="animate-spin" />
        ) : (
          <MoreHorizontal />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onDetails && (
          <DropdownMenuItem onClick={onDetails}>
            <Eye />
            Voir les détails
          </DropdownMenuItem>
        )}
        {!batch && allowed.retry && (
          <DropdownMenuItem
            onClick={() => mutation.mutate({ id, action: 'retry' })}
          >
            <RotateCcw />
            Relancer
          </DropdownMenuItem>
        )}
        {!batch && allowed.cancel && (
          <DropdownMenuItem
            onClick={() => mutation.mutate({ id, action: 'cancel' })}
          >
            <X />
            Annuler le job
          </DropdownMenuItem>
        )}
        {!onDetails && !allowed.retry && !allowed.cancel && (
          <DropdownMenuItem disabled>Aucune action disponible</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

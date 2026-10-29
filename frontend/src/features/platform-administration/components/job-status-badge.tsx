import { Badge } from '@/components/ui/badge'
import { jobStatusLabels } from '../jobs'
import type { JobStatus } from '../jobs'

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <Badge
      variant={
        status === 'failed'
          ? 'destructive'
          : status === 'cancelled'
            ? 'outline'
            : 'secondary'
      }
    >
      {jobStatusLabels[status]}
    </Badge>
  )
}

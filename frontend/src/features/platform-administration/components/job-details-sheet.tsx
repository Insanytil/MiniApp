import { useQuery } from '@tanstack/react-query'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/api/client'
import { batchJobsQuery, groupJobStatus, jobTypeLabels } from '../jobs'
import type { JobGroup } from '../jobs'
import { JobActions } from './job-actions'
import { JobStatusBadge } from './job-status-badge'

export function JobDetailsSheet({
  group,
  organizationId,
  open,
  onOpenChange,
}: {
  group: JobGroup
  organizationId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const query = useQuery({
    ...batchJobsQuery(group.batch_id ?? '', organizationId),
    enabled: open && !!group.batch_id,
  })
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="shrink-0 border-b p-6 pr-12">
          <SheetTitle>Détails du {group.batch_id ? 'lot' : 'job'}</SheetTitle>
          <SheetDescription>{jobTypeLabels[group.type]}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Identifiant</dt>
              <dd className="break-all">{group.id}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Organisation</dt>
              <dd>{group.organization_name ?? 'Plateforme'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Déclenché par</dt>
              <dd className="break-all">
                {group.triggered_by_email ?? 'Système / utilisateur supprimé'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Création</dt>
              <dd>{new Date(group.created_at).toLocaleString('fr-BE')}</dd>
            </div>
          </dl>
          {!group.batch_id && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <JobStatusBadge status={groupJobStatus(group)} />
                <JobActions
                  id={group.id}
                  status={groupJobStatus(group)}
                  organizationId={organizationId}
                />
              </div>
              <p className="break-all">
                {group.recipient_email ?? 'Destinataire indisponible'}
              </p>
              <p className="text-sm text-muted-foreground">
                {group.attempts} / {group.max_attempts} tentatives
              </p>
              {group.last_error && (
                <pre className="rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap break-words">
                  {group.last_error}
                </pre>
              )}
            </div>
          )}
          {group.batch_id &&
            (query.isPending ? (
              <p role="status">Chargement des jobs…</p>
            ) : query.isError ? (
              <div role="alert">
                <p>{errorMessage(query.error)}</p>
                <Button variant="outline" onClick={() => void query.refetch()}>
                  Réessayer
                </Button>
              </div>
            ) : (
              <ul className="divide-y">
                {query.data.map((job) => (
                  <li key={job.id} className="space-y-2 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 break-all">
                        {job.recipient_email ?? job.id}
                      </p>
                      <JobActions
                        id={job.id}
                        status={job.status}
                        organizationId={organizationId}
                      />
                    </div>
                    <JobStatusBadge status={job.status} />
                    <p className="text-xs text-muted-foreground">
                      {job.attempts} / {job.max_attempts} tentatives
                    </p>
                    {job.last_error && (
                      <pre className="rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap break-words">
                        {job.last_error}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}

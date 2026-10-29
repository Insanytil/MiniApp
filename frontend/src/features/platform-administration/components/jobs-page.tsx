import { useCallback, useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { ServerTable } from '@/components/data-table/server-table'
import type { ServerColumn } from '@/components/data-table/server-table'
import { lastAvailablePage } from '@/components/data-table/server-pagination'
import { useServerList } from '@/components/data-table/use-server-list'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { UserOrganization } from '@/features/auth'
import { errorMessage } from '@/lib/api/client'
import { groupJobStatus, jobsQuery, jobTypeLabels } from '../jobs'
import type { JobGroup } from '../jobs'
import { JobActions } from './job-actions'
import { JobStatusBadge } from './job-status-badge'
import { JobDetailsSheet } from './job-details-sheet'

const emptyRows: JobGroup[] = []
const dates = new Intl.DateTimeFormat('fr-BE', {
  dateStyle: 'short',
  timeStyle: 'short',
})
export function JobsPage({
  organization,
}: {
  organization?: UserOrganization
}) {
  const organizationId = organization?.id
  const list = useServerList()
  const query = useQuery({
    ...jobsQuery(list.params, organizationId),
    placeholderData: keepPreviousData,
  })
  const [selected, setSelected] = useState<JobGroup | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  useEffect(() => {
    if (!query.data || query.isPlaceholderData) return
    const max = lastAvailablePage(query.data.pagination.total_pages)
    if (list.params.page > max) list.setParams((p) => ({ ...p, page: max }))
  }, [query.data, query.isPlaceholderData, list.params.page, list.setParams])
  const columns = useMemo<ServerColumn<JobGroup>[]>(
    () => [
      {
        accessorKey: 'type',
        header: 'Job',
        cell: ({ row }) => (
          <div className="max-w-64 whitespace-normal">
            <p className="font-medium">{jobTypeLabels[row.original.type]}</p>
            <p
              className="mt-1 truncate text-xs text-muted-foreground"
              title={row.original.recipient_email ?? undefined}
            >
              {row.original.batch_id
                ? `Lot de ${row.original.total_jobs} jobs`
                : (row.original.recipient_email ?? 'Destinataire indisponible')}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'organization_name',
        header: 'Organisation',
        cell: ({ row }) => (
          <span
            className="inline-block max-w-40 truncate"
            title={row.original.organization_name ?? undefined}
          >
            {row.original.organization_name ?? 'Plateforme'}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'État',
        cell: ({ row }) => (
          <div className="space-y-1">
            <JobStatusBadge status={groupJobStatus(row.original)} />
            {row.original.batch_id && (
              <p className="text-xs text-muted-foreground">
                {row.original.succeeded_jobs}/{row.original.total_jobs} terminés
                {row.original.failed_jobs
                  ? ` · ${row.original.failed_jobs} en échec`
                  : ''}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'triggered_by_email',
        header: 'Déclenché par',
        cell: ({ row }) => (
          <span
            className="inline-block max-w-44 truncate"
            title={row.original.triggered_by_email ?? undefined}
          >
            {row.original.triggered_by_email ?? 'Système'}
          </span>
        ),
      },
      {
        accessorKey: 'created_at',
        header: 'Créé le',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {dates.format(new Date(row.original.created_at))}
          </span>
        ),
      },
    ],
    [],
  )
  const renderActions = useCallback(
    (group: JobGroup) => (
      <JobActions
        id={group.id}
        organizationId={organizationId}
        status={groupJobStatus(group)}
        batch={!!group.batch_id}
        onDetails={() => {
          setSelected(group)
          setDetailsOpen(true)
        }}
      />
    ),
    [organizationId],
  )
  const detailGroup =
    query.data?.items.find((group) => group.id === selected?.id) ?? selected
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-4 sm:gap-6">
      <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Jobs
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {organization
              ? `Suivez les jobs de ${organization.name}.`
              : 'Suivez les traitements et les envois d’emails.'}{' '}
            Actualisation toutes les 15 secondes.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw
            className={query.isFetching ? 'animate-spin' : undefined}
          />
          Actualiser
        </Button>
      </div>
      {query.isError && (
        <Alert variant="destructive" className="shrink-0">
          <AlertDescription>{errorMessage(query.error)}</AlertDescription>
        </Alert>
      )}
      <ServerTable
        label="jobs"
        rows={query.data?.items ?? emptyRows}
        columns={columns}
        renderActions={renderActions}
        columnClasses={{
          organization_name: 'hidden sm:table-cell',
          triggered_by_email: 'hidden xl:table-cell',
          created_at: 'hidden lg:table-cell',
        }}
        total={query.data?.pagination.total ?? 0}
        pagination={list.pagination}
        onPaginationChange={list.onPaginationChange}
        search={list.search}
        onSearchChange={list.setSearch}
        searchMaxLength={320}
        busy={query.isFetching || list.isDebouncing}
        loading={query.isPending}
        failed={query.isError}
      />
      {detailGroup && (
        <JobDetailsSheet
          key={detailGroup.id}
          group={detailGroup}
          organizationId={organizationId}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
        />
      )}
    </div>
  )
}

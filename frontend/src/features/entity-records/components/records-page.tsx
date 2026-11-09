import { DetailSheet } from './record-detail-sheet'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { useCallback, useMemo, useState } from 'react'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Eye, Plus, Pencil, MoreHorizontal, Trash2 } from 'lucide-react'
import { useAuth } from '@/features/auth'
import { ServerTable } from '@/components/data-table/server-table'
import type { ServerColumn } from '@/components/data-table/server-table'
import { useListPageBoundary } from '@/components/data-table/use-list-page-boundary'
import { useServerList } from '@/components/data-table/use-server-list'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { errorMessage } from '@/lib/api/client'
import { deleteRecord, recordsQuery } from '../records'
import { createRecordError, recordRootKey } from '../creation'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { EntityRecordRow } from '../records'
import { RecordCreateSheet } from './record-create-sheet'
import { RecordCell } from './record-cell'

const emptyRows: EntityRecordRow[] = []
export function EntityRecordsPage({ entityTypeId }: { entityTypeId: string }) {
  const { organization } = useAuth()
  return organization ? (
    <ScopedRecords
      key={`${organization.id}/${entityTypeId}`}
      organizationId={organization.id}
      entityTypeId={entityTypeId}
      canDelete={organization.role === 'organization_admin'}
    />
  ) : null
}
function ScopedRecords({
  organizationId,
  entityTypeId,
  canDelete,
}: {
  organizationId: string
  entityTypeId: string
  canDelete: boolean
}) {
  const list = useServerList()
  const query = useQuery({
    ...recordsQuery(organizationId, entityTypeId, list.params),
    placeholderData: keepPreviousData,
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const removal = useMutation({
    mutationFn: (id: string) => deleteRecord(organizationId, entityTypeId, id),
    onSuccess: (_, id) => {
      setDeleting(null)
      setSelected((current) => (current === id ? null : current))
      return queryClient.invalidateQueries({
        queryKey: recordRootKey(organizationId),
      })
    },
  })
  useListPageBoundary(query, list)
  const columns = useMemo<ServerColumn<EntityRecordRow>[]>(
    () =>
      (query.data?.view.columns ?? []).map((column) => ({
        id: column.id,
        header: column.label,
        cell: ({ row }) => <RecordCell cell={row.original.cells[column.id]} />,
      })),
    [query.data?.view.columns],
  )
  const columnClasses = useMemo(
    () =>
      Object.fromEntries(
        (query.data?.view.columns ?? []).map((column) => {
          const cell = query.data?.items
            .map((row) => row.cells[column.id])
            .find(Boolean)
          return [
            column.id,
            cell?.kind === 'count' ||
            cell?.field_kind === 'decimal' ||
            cell?.field_kind === 'integer'
              ? 'text-right tabular-nums'
              : '',
          ]
        }),
      ),
    [query.data],
  )
  const renderActions = useCallback(
    (row: EntityRecordRow) => (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Actions de l’enregistrement"
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem onClick={() => setSelected(row.id)}>
            <Eye />
            Voir les détails
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditing(row.id)}>
            <Pencil />
            Modifier
          </DropdownMenuItem>
          {canDelete && (
            <DropdownMenuItem onClick={() => setDeleting(row.id)}>
              <Trash2 />
              Supprimer
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [canDelete],
  )
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-4 sm:gap-6">
      <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold break-words sm:text-3xl">
            {query.data?.entity_type.name ?? 'Enregistrements'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {query.data
              ? `${query.data.view.name} · Vue par défaut`
              : 'Chargement de la vue…'}
          </p>
        </div>
        <Button
          className="h-10 w-full sm:w-auto"
          disabled={!query.data || query.isError}
          onClick={() => setCreating(true)}
        >
          <Plus />
          Créer un enregistrement
        </Button>
      </div>
      {query.isError && (
        <Alert variant="destructive" className="shrink-0">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{errorMessage(query.error)}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <ServerTable
        label="enregistrements"
        rows={query.data?.items ?? emptyRows}
        columns={columns}
        columnClasses={columnClasses}
        renderActions={renderActions}
        total={query.data?.pagination.total ?? 0}
        pagination={list.pagination}
        onPaginationChange={list.onPaginationChange}
        search={list.search}
        onSearchChange={list.setSearch}
        busy={query.isFetching || list.isDebouncing}
        loading={query.isPending}
        failed={query.isError}
      />
      {creating && (
        <RecordCreateSheet
          organizationId={organizationId}
          entityTypeId={entityTypeId}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            list.setSearch('')
            list.setParams((previous) => ({ ...previous, page: 1, search: '' }))
          }}
        />
      )}
      {editing && (
        <RecordCreateSheet
          organizationId={organizationId}
          entityTypeId={entityTypeId}
          recordId={editing}
          onClose={() => setEditing(null)}
          onCreated={() => setEditing(null)}
        />
      )}
      {selected && (
        <DetailSheet
          organizationId={organizationId}
          entityTypeId={entityTypeId}
          recordId={selected}
          onClose={() => setSelected(null)}
        />
      )}
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !removal.isPending) {
            setDeleting(null)
            removal.reset()
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette fiche ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette suppression est définitive. Les relations configurées pour
              bloquer la suppression seront vérifiées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removal.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {createRecordError(removal.error)}
              </AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <Button
              variant="outline"
              disabled={removal.isPending}
              onClick={() => {
                setDeleting(null)
                removal.reset()
              }}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              disabled={removal.isPending || !deleting}
              onClick={() => {
                if (deleting) removal.mutate(deleting)
              }}
            >
              {removal.isPending ? 'Suppression…' : 'Supprimer'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

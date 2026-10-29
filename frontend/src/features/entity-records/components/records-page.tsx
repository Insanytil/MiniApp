import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Eye, Plus, Pencil, MoreHorizontal } from 'lucide-react'
import { useAuth } from '@/features/auth'
import { ServerTable } from '@/components/data-table/server-table'
import type { ServerColumn } from '@/components/data-table/server-table'
import { lastAvailablePage } from '@/components/data-table/server-pagination'
import { useServerList } from '@/components/data-table/use-server-list'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { errorMessage } from '@/lib/api/client'
import { recordDetailQuery, recordsQuery } from '../records'
import type { EntityRecordRow } from '../records'
import { RecordCreateSheet } from './record-create-sheet'
import { formatValue, RecordCell, RecordImage } from './record-cell'

const emptyRows: EntityRecordRow[] = []
export function EntityRecordsPage({ entityTypeId }: { entityTypeId: string }) {
  const { organization } = useAuth()
  return organization ? (
    <ScopedRecords
      key={`${organization.id}/${entityTypeId}`}
      organizationId={organization.id}
      entityTypeId={entityTypeId}
    />
  ) : null
}
function ScopedRecords({
  organizationId,
  entityTypeId,
}: {
  organizationId: string
  entityTypeId: string
}) {
  const list = useServerList()
  const query = useQuery({
    ...recordsQuery(organizationId, entityTypeId, list.params),
    placeholderData: keepPreviousData,
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  useEffect(() => {
    if (!query.data || query.isPlaceholderData) return
    const max = lastAvailablePage(query.data.pagination.total_pages)
    if (list.params.page > max) list.setParams((p) => ({ ...p, page: max }))
  }, [query.data, query.isPlaceholderData, list.params.page, list.setParams])
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
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [],
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
    </div>
  )
}
export function DetailSheet({
  organizationId,
  entityTypeId,
  recordId,
  onClose,
}: {
  organizationId: string
  entityTypeId: string
  recordId: string
  onClose: () => void
}) {
  const query = useQuery(
    recordDetailQuery(organizationId, entityTypeId, recordId),
  )
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader className="shrink-0 border-b p-6 pr-14">
          <SheetTitle>Détails de l’enregistrement</SheetTitle>
          <SheetDescription>
            {query.data?.entity_type_name ?? recordId}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {query.isPending ? (
            <p role="status">Chargement…</p>
          ) : query.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {errorMessage(query.error)}{' '}
                <Button variant="outline" onClick={() => void query.refetch()}>
                  Réessayer
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <dl className="space-y-5">
              {query.data.fields.map((field) => (
                <div key={field.id}>
                  <dt className="mb-1 text-xs text-muted-foreground">
                    {field.name}
                    {field.system ? ' · Système' : ''}
                  </dt>
                  <dd className="text-sm whitespace-pre-wrap break-words">
                    {field.kind === 'image' ? (
                      <RecordImage
                        variant="detail"
                        url={
                          typeof field.value === 'string' ? field.value : null
                        }
                      />
                    ) : (
                      formatValue(field.value, field.kind)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

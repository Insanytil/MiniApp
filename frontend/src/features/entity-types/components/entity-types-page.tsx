import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Settings2,
} from 'lucide-react'
import { useAuth } from '@/features/auth'
import type { UserOrganization } from '@/features/auth'
import { ServerTable } from '@/components/data-table/server-table'
import type { ServerColumn } from '@/components/data-table/server-table'
import { lastAvailablePage } from '@/components/data-table/server-pagination'
import { useServerList } from '@/components/data-table/use-server-list'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from '@/components/ui/toast'
import { entityTypeError, entityTypesQuery } from '../entity-types'
import type { EntityType } from '../entity-types'
import { useDeleteEntityType } from '../mutations'
import { EntityTypeFormSheet } from './entity-type-form-sheet'

const emptyRows: EntityType[] = []
export function EntityTypesPage() {
  const { organization } = useAuth()
  return organization ? (
    <ScopedEntityTypesPage key={organization.id} organization={organization} />
  ) : null
}
function ScopedEntityTypesPage({
  organization,
}: {
  organization: UserOrganization
}) {
  const navigate = useNavigate()
  const list = useServerList()
  const query = useQuery({
    ...entityTypesQuery(organization.id, list.params),
    placeholderData: keepPreviousData,
  })
  const [form, setForm] = useState<{ entityType?: EntityType } | null>(null)
  const [deleting, setDeleting] = useState<EntityType | null>(null)
  const remove = useDeleteEntityType(organization.id)
  useEffect(() => {
    if (!query.data || query.isPlaceholderData) return
    const max = lastAvailablePage(query.data.pagination.total_pages)
    if (list.params.page > max) list.setParams((p) => ({ ...p, page: max }))
  }, [query.data, query.isPlaceholderData, list.params.page, list.setParams])
  const columns = useMemo<ServerColumn<EntityType>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Nom',
        cell: ({ row }) => (
          <Link
            to="/organization/entity-types/$entityTypeId"
            params={{ entityTypeId: row.original.id }}
            className="inline-block max-w-40 truncate font-medium hover:underline sm:max-w-xs"
            title={row.original.name}
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'technical_name',
        header: 'Identifiant technique',
        cell: ({ row }) => (
          <code
            className="inline-block max-w-40 truncate text-xs sm:max-w-xs"
            title={row.original.technical_name}
          >
            {row.original.technical_name}
          </code>
        ),
      },
      {
        accessorKey: 'fields_count',
        header: 'Champs',
        cell: ({ row }) => (
          <span
            title={`${row.original.fields_count} champs personnalisés ; ${row.original.system_fields.length} champs système implicites`}
          >
            {row.original.fields_count}
          </span>
        ),
      },
      { accessorKey: 'relations_count', header: 'Relations' },
    ],
    [],
  )
  const busy = query.isFetching || list.isDebouncing
  const renderActions = useCallback(
    (entityType: EntityType) => (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              disabled={busy}
              aria-label={`Actions pour ${entityType.name}`}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() =>
              void navigate({
                to: '/organization/entity-types/$entityTypeId',
                params: { entityTypeId: entityType.id },
              })
            }
          >
            <Settings2 />
            Configurer
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setForm({ entityType })}>
            <Pencil />
            Modifier les informations
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              remove.reset()
              setDeleting(entityType)
            }}
          >
            <Trash2 />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [busy, remove, navigate],
  )
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-4 sm:gap-6">
      <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Configuration
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Types d’entités de {organization.name}.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Le compteur de champs inclut uniquement les champs personnalisés.
            Les 5 champs système sont implicites.
          </p>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto">
          <Button
            variant="outline"
            className="h-10 w-full"
            render={<Link to="/organization/navigation" />}
          >
            <Settings2 />
            Composer le menu
          </Button>
          <Button className="h-10 w-full" onClick={() => setForm({})}>
            <Plus />
            Créer un type d’entité
          </Button>
        </div>
      </div>
      {query.isError && (
        <Alert variant="destructive" className="shrink-0">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{entityTypeError(query.error)}</span>
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
        label="types d’entités"
        rows={query.data?.items ?? emptyRows}
        columns={columns}
        renderActions={renderActions}
        total={query.data?.pagination.total ?? 0}
        pagination={list.pagination}
        onPaginationChange={list.onPaginationChange}
        search={list.search}
        onSearchChange={list.setSearch}
        busy={busy}
        loading={query.isPending}
        failed={query.isError}
      />
      {form && (
        <EntityTypeFormSheet
          key={form.entityType?.id ?? 'create'}
          organizationId={organization.id}
          entityType={form.entityType}
          onClose={() => setForm(null)}
        />
      )}
      {deleting && (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open && !remove.isPending) setDeleting(null)
          }}
        >
          <AlertDialogContent className="max-h-[calc(100svh-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer le type d’entité ?</AlertDialogTitle>
              <AlertDialogDescription>
                La définition « {deleting.name} » ({deleting.technical_name})
                sera supprimée. Cette action est définitive.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {remove.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {entityTypeError(remove.error)}
                </AlertDescription>
              </Alert>
            )}
            <AlertDialogFooter>
              <Button
                variant="outline"
                disabled={remove.isPending}
                onClick={() => setDeleting(null)}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                disabled={remove.isPending}
                onClick={async () => {
                  try {
                    await remove.mutateAsync(deleting.id)
                    toast.add({
                      title: 'Type d’entité supprimé',
                      description: deleting.name,
                      type: 'success',
                    })
                    setDeleting(null)
                  } catch {
                    /* Keep the confirmation open. */
                  }
                }}
              >
                {remove.isPending && (
                  <LoaderCircle className="size-4 animate-spin" />
                )}
                {remove.isPending ? 'Suppression…' : 'Supprimer'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}

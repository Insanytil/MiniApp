import { toast } from '@/components/ui/toast'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  Building2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { ServerTable } from '@/components/data-table/server-table'
import type { ServerColumn } from '@/components/data-table/server-table'
import { lastAvailablePage } from '@/components/data-table/server-pagination'
import { useServerList } from '@/components/data-table/use-server-list'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { errorMessage } from '@/lib/api/client'
import { organizationsQuery } from '../organizations'
import type { Organization, OrganizationListItem } from '../organizations'
import { OrganizationFormSheet } from './organization-form-sheet'
import { OrganizationActionDialog } from './organization-action-dialog'
import { OrganizationMembersCell } from './organization-members-cell'
import { MembershipLinkSheet } from './membership-link-sheet'

type DialogState =
  | { type: 'create' }
  | { type: 'edit' | 'delete' | 'status'; organization: Organization }
const emptyRows: OrganizationListItem[] = []
const dateFormat = new Intl.DateTimeFormat('fr-BE', { dateStyle: 'medium' })

export function OrganizationsPage() {
  const list = useServerList()
  const query = useQuery({
    ...organizationsQuery(list.params),
    placeholderData: keepPreviousData,
  })
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [memberOrganization, setMemberOrganization] =
    useState<Organization | null>(null)
  useEffect(() => {
    if (!query.data || query.isPlaceholderData) return
    const max = lastAvailablePage(query.data.pagination.total_pages)
    if (list.params.page > max)
      list.setParams((previous) => ({ ...previous, page: max }))
  }, [query.data, query.isPlaceholderData, list.params.page, list.setParams])

  const columns = useMemo<ServerColumn<OrganizationListItem>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Organisation',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <span className="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-muted sm:flex">
              <Building2
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
            </span>
            <div className="min-w-0">
              <p
                className="max-w-[12rem] truncate font-medium sm:max-w-xs"
                title={row.original.name}
              >
                {row.original.name}
              </p>
              <p className="max-w-[12rem] truncate text-xs text-muted-foreground sm:hidden">
                {row.original.slug}
              </p>
            </div>
          </div>
        ),
      },
      { accessorKey: 'slug', header: 'Identifiant' },
      {
        id: 'members',
        header: 'Membres',
        cell: ({ row }) => (
          <OrganizationMembersCell organization={row.original} />
        ),
      },
      {
        accessorKey: 'is_active',
        header: 'Statut',
        cell: ({ row }) => (
          <Badge
            variant={row.original.is_active ? 'secondary' : 'outline'}
            className={
              row.original.is_active
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                : 'text-muted-foreground'
            }
          >
            <span
              aria-hidden="true"
              className={`mr-1 size-1.5 rounded-full ${row.original.is_active ? 'bg-emerald-600' : 'bg-muted-foreground'}`}
            />
            {row.original.is_active ? 'Active' : 'Suspendue'}
          </Badge>
        ),
      },
      {
        accessorKey: 'created_at',
        header: 'Créée le',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {dateFormat.format(new Date(row.original.created_at))}
          </span>
        ),
      },
    ],
    [],
  )
  const busy = query.isFetching || list.isDebouncing
  const renderActions = useCallback(
    (organization: Organization) => (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              disabled={busy}
              aria-label={`Actions pour ${organization.name}`}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setMemberOrganization(organization)}>
            <UserPlus />
            Ajouter un membre
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setDialog({ type: 'edit', organization })
            }}
          >
            <Pencil />
            Modifier
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setDialog({ type: 'status', organization })
            }}
          >
            {organization.is_active ? <Pause /> : <Play />}
            {organization.is_active ? 'Suspendre' : 'Réactiver'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              setDialog({ type: 'delete', organization })
            }}
          >
            <Trash2 />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [busy],
  )

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-4 sm:gap-6">
      <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Organisations
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Gérez les espaces de travail et leur accès.
          </p>
        </div>
        <Button
          className="h-10 w-full sm:w-auto"
          onClick={() => {
            setDialog({ type: 'create' })
          }}
        >
          <Plus />
          Créer une organisation
        </Button>
      </div>
      {query.isError && (
        <Alert variant="destructive" className="shrink-0">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{errorMessage(query.error)}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <ServerTable
        label="organisations"
        rows={query.data?.items ?? emptyRows}
        columns={columns}
        columnClasses={{
          slug: 'hidden sm:table-cell',
          created_at: 'hidden lg:table-cell',
        }}
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
      {dialog?.type === 'create' || dialog?.type === 'edit' ? (
        <OrganizationFormSheet
          key={dialog.type === 'edit' ? dialog.organization.id : 'create'}
          organization={
            dialog.type === 'edit' ? dialog.organization : undefined
          }
          onClose={() => setDialog(null)}
          onSaved={(message) => toast.add({ title: message, type: 'success' })}
        />
      ) : dialog ? (
        <OrganizationActionDialog
          key={`${dialog.type}-${dialog.organization.id}`}
          organization={dialog.organization}
          action={dialog.type}
          onClose={() => setDialog(null)}
          onSaved={(message) => toast.add({ title: message, type: 'success' })}
        />
      ) : null}
      {memberOrganization && (
        <MembershipLinkSheet
          key={memberOrganization.id}
          organization={memberOrganization}
          onClose={() => setMemberOrganization(null)}
        />
      )}
    </div>
  )
}

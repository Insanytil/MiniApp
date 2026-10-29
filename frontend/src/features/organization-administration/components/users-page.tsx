import { useCallback, useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  LoaderCircle,
  Mail,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
} from 'lucide-react'
import { useAuth } from '@/features/auth'
import type { UserOrganization } from '@/features/auth'
import { ServerTable } from '@/components/data-table/server-table'
import type { ServerColumn } from '@/components/data-table/server-table'
import { lastAvailablePage } from '@/components/data-table/server-pagination'
import { useServerList } from '@/components/data-table/use-server-list'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { organizationUserError, organizationUsersQuery } from '../users'
import type { OrganizationUser } from '../users'
import {
  useOrganizationPasswordReset,
  useOrganizationUserAccess,
} from '../mutations'
import { OrganizationUserCreateSheet } from './user-create-sheet'

const emptyRows: OrganizationUser[] = []
export function OrganizationUsersPage() {
  const { organization } = useAuth()
  return organization ? (
    <ScopedUsersPage key={organization.id} organization={organization} />
  ) : null
}
function ScopedUsersPage({ organization }: { organization: UserOrganization }) {
  const { user: currentUser } = useAuth()
  const list = useServerList()
  const query = useQuery({
    ...organizationUsersQuery(organization.id, list.params),
    placeholderData: keepPreviousData,
  })
  const [creating, setCreating] = useState(false)
  const [target, setTarget] = useState<OrganizationUser | null>(null)
  const access = useOrganizationUserAccess(organization.id)
  const reset = useOrganizationPasswordReset(organization.id)
  useEffect(() => {
    if (!query.data || query.isPlaceholderData) return
    const max = lastAvailablePage(query.data.pagination.total_pages)
    if (list.params.page > max) list.setParams((p) => ({ ...p, page: max }))
  }, [query.data, query.isPlaceholderData, list.params.page, list.setParams])
  const columns = useMemo<ServerColumn<OrganizationUser>[]>(
    () => [
      {
        accessorKey: 'email',
        header: 'Utilisateur',
        cell: ({ row }) => (
          <div className="max-w-56 sm:max-w-sm">
            <p className="truncate font-medium" title={row.original.email}>
              {row.original.email}
              {row.original.id === currentUser.id ? ' (vous)' : ''}
            </p>
            {!row.original.is_active && (
              <p className="mt-1 text-xs text-muted-foreground">
                Compte suspendu par la plateforme
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Rôle',
        cell: ({ row }) => (
          <Badge variant="outline">
            {row.original.role === 'organization_admin'
              ? 'Administrateur'
              : 'Utilisateur'}
          </Badge>
        ),
      },
      {
        accessorKey: 'membership_is_active',
        header: 'Accès',
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.membership_is_active ? 'secondary' : 'outline'
            }
          >
            {row.original.membership_is_active ? 'Actif' : 'Suspendu'}
          </Badge>
        ),
      },
      {
        accessorKey: 'is_verified',
        header: 'Activation',
        cell: ({ row }) => (
          <Badge variant={row.original.is_verified ? 'secondary' : 'outline'}>
            {row.original.is_verified ? 'Activé' : 'En attente'}
          </Badge>
        ),
      },
    ],
    [currentUser.id],
  )
  const busy = query.isFetching || list.isDebouncing
  const renderActions = useCallback(
    (user: OrganizationUser) => (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              disabled={busy || access.isPending || reset.isPending}
              aria-label={`Actions pour ${user.email}`}
            />
          }
        >
          {reset.isPending && reset.variables.id === user.id ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <MoreHorizontal />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={!user.is_verified}
            title={
              !user.is_verified
                ? 'Le compte doit d’abord être activé.'
                : undefined
            }
            onClick={() => reset.mutate(user)}
          >
            <Mail />
            Réinitialiser le mot de passe
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={user.id === currentUser.id}
            title={
              user.id === currentUser.id
                ? 'Vous ne pouvez pas suspendre votre propre accès.'
                : undefined
            }
            onClick={() => {
              access.reset()
              setTarget(user)
            }}
          >
            {user.membership_is_active ? <Pause /> : <Play />}
            {user.membership_is_active
              ? 'Suspendre l’accès'
              : 'Réactiver l’accès'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [busy, access, reset, currentUser.id],
  )
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-4 sm:gap-6">
      <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Utilisateurs
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Gérez les membres de {organization.name}.
          </p>
        </div>
        <Button
          className="h-10 w-full sm:w-auto"
          onClick={() => setCreating(true)}
        >
          <Plus />
          Créer un utilisateur
        </Button>
      </div>
      {query.isError && (
        <Alert variant="destructive" className="shrink-0">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{organizationUserError(query.error, 'access')}</span>
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
        label="utilisateurs"
        rows={query.data?.items ?? emptyRows}
        columns={columns}
        columnClasses={{ is_verified: 'hidden sm:table-cell' }}
        renderActions={renderActions}
        total={query.data?.pagination.total ?? 0}
        pagination={list.pagination}
        onPaginationChange={list.onPaginationChange}
        search={list.search}
        onSearchChange={list.setSearch}
        searchMaxLength={320}
        busy={busy}
        loading={query.isPending}
        failed={query.isError}
      />
      {creating && (
        <OrganizationUserCreateSheet
          organization={organization}
          onClose={() => setCreating(false)}
        />
      )}
      {target && (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open && !access.isPending) setTarget(null)
          }}
        >
          <AlertDialogContent className="max-h-[calc(100svh-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {target.membership_is_active ? 'Suspendre' : 'Réactiver'}{' '}
                l’accès ?
              </AlertDialogTitle>
              <AlertDialogDescription>
                <span className="font-medium break-all text-foreground">
                  {target.email}
                </span>
                <br />
                {target.membership_is_active
                  ? `L’accès à ${organization.name} sera suspendu. Ses accès aux autres organisations seront conservés.`
                  : `L’accès à ${organization.name} sera réactivé. Le compte doit également être actif et validé pour se connecter.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {access.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {organizationUserError(access.error, 'access')}
                </AlertDescription>
              </Alert>
            )}
            <AlertDialogFooter>
              <Button
                variant="outline"
                disabled={access.isPending}
                onClick={() => setTarget(null)}
              >
                Annuler
              </Button>
              <Button
                disabled={access.isPending}
                onClick={async () => {
                  try {
                    await access.mutateAsync({
                      user: target,
                      isActive: !target.membership_is_active,
                    })
                    setTarget(null)
                  } catch {
                    /* Keep the confirmation and display the error. */
                  }
                }}
              >
                {access.isPending && (
                  <LoaderCircle className="size-4 animate-spin" />
                )}
                {access.isPending
                  ? 'Traitement…'
                  : target.membership_is_active
                    ? 'Suspendre l’accès'
                    : 'Réactiver l’accès'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}

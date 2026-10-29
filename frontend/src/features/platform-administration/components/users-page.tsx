import { toast } from '@/components/ui/toast'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Mail,
  KeyRound,
  LoaderCircle,
  Link2,
} from 'lucide-react'
import { ServerTable } from '@/components/data-table/server-table'
import type { ServerColumn } from '@/components/data-table/server-table'
import { lastAvailablePage } from '@/components/data-table/server-pagination'
import { useServerList } from '@/components/data-table/use-server-list'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { errorMessage } from '@/lib/api/client'
import { usersQuery, useUserStatus } from '../users'
import type { PlatformUser } from '../users'
import { UserFormSheet } from './user-form-sheet'
import { MembershipLinkSheet } from './membership-link-sheet'
import { UserOrganizationsCell } from './user-organizations-cell'
import { useUserEmail } from '../use-user-email'
import { userEmailActionFor, userEmailActions } from '../user-email'

const emptyRows: PlatformUser[] = []

export function UsersPage() {
  const list = useServerList()
  const query = useQuery({
    ...usersQuery(list.params),
    placeholderData: keepPreviousData,
  })
  const [creating, setCreating] = useState(false)
  const [linkingUser, setLinkingUser] = useState<PlatformUser | null>(null)
  const [selected, setSelected] = useState<PlatformUser | null>(null)
  const status = useUserStatus()
  const email = useUserEmail()
  useEffect(() => {
    if (!query.data || query.isPlaceholderData) return
    const max = lastAvailablePage(query.data.pagination.total_pages)
    if (list.params.page > max)
      list.setParams((previous) => ({ ...previous, page: max }))
  }, [query.data, query.isPlaceholderData, list.params.page, list.setParams])
  const columns = useMemo<ServerColumn<PlatformUser>[]>(
    () => [
      {
        accessorKey: 'email',
        header: 'Utilisateur',
        cell: ({ row }) => (
          <span
            className="block max-w-[12rem] truncate font-medium sm:max-w-xs"
            title={row.original.email}
          >
            {row.original.email}
          </span>
        ),
      },
      {
        id: 'organizations',
        header: 'Organisations',
        cell: ({ row }) => <UserOrganizationsCell user={row.original} />,
      },
      {
        accessorKey: 'is_active',
        header: 'Compte',
        cell: ({ row }) => (
          <Badge variant={row.original.is_active ? 'secondary' : 'outline'}>
            {row.original.is_active ? 'Actif' : 'Suspendu'}
          </Badge>
        ),
      },
      {
        accessorKey: 'is_verified',
        header: 'Activation',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.is_verified ? 'Compte activé' : 'En attente'}
          </span>
        ),
      },
    ],
    [],
  )
  const busy = query.isFetching || list.isDebouncing
  const renderActions = useCallback(
    (user: PlatformUser) => (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              disabled={
                busy || (email.isPending && email.variables.user.id === user.id)
              }
              aria-busy={email.isPending && email.variables.user.id === user.id}
              aria-label={`Actions pour ${user.email}`}
            />
          }
        >
          {email.isPending && email.variables.user.id === user.id ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <MoreHorizontal />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-64 max-w-[calc(100vw-2rem)]"
        >
          <DropdownMenuItem onClick={() => setLinkingUser(user)}>
            <Link2 />
            Lier à une organisation
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={email.isPending}
            onClick={() =>
              email.mutate({ user, action: userEmailActionFor(user) })
            }
          >
            {user.is_verified ? (
              <KeyRound aria-hidden="true" />
            ) : (
              <Mail aria-hidden="true" />
            )}
            <span>{userEmailActions[userEmailActionFor(user)].label}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              status.reset()
              setSelected(user)
            }}
          >
            {user.is_active ? <Pause /> : <Play />}
            {user.is_active ? 'Suspendre' : 'Réactiver'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    [busy, status, email],
  )
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-4 sm:gap-6">
      <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Utilisateurs
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Créez les comptes et gérez leur accès à l’application.
          </p>
        </div>
        <Button
          className="h-10 w-full sm:w-auto"
          onClick={() => {
            setCreating(true)
          }}
        >
          <Plus />
          Créer un utilisateur
        </Button>
      </div>
      {query.isError && (
        <Alert variant="destructive" className="shrink-0">
          <AlertDescription>
            {errorMessage(query.error)}{' '}
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
        label="utilisateurs"
        rows={query.data?.items ?? emptyRows}
        columns={columns}
        columnClasses={{
          organizations: 'w-44',
          is_verified: 'hidden sm:table-cell',
        }}
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
        <UserFormSheet
          onClose={() => setCreating(false)}
          onSaved={(message, type = 'success') =>
            toast.add({ title: message, type })
          }
        />
      )}
      <AlertDialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !status.isPending) setSelected(null)
        }}
      >
        <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selected?.is_active
                ? 'Suspendre le compte ?'
                : 'Réactiver le compte ?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="break-all">{selected?.email}</span>
              <br />
              {selected?.is_active
                ? 'Ce compte ne pourra plus utiliser l’application tant qu’il sera suspendu.'
                : 'Ce compte pourra à nouveau se connecter s’il est activé.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {status.isError && (
            <Alert variant="destructive" className="shrink-0">
              <AlertDescription>{errorMessage(status.error)}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <Button
              variant="outline"
              disabled={status.isPending}
              onClick={() => setSelected(null)}
            >
              Annuler
            </Button>
            <Button
              disabled={status.isPending || !selected}
              onClick={async () => {
                if (!selected) return
                try {
                  await status.mutateAsync(selected)
                  toast.add({
                    title: selected.is_active
                      ? 'Compte suspendu'
                      : 'Compte réactivé',
                    description: selected.email,
                    type: 'success',
                  })
                  setSelected(null)
                } catch {
                  /* Keep confirmation open. */
                }
              }}
            >
              {status.isPending
                ? 'Traitement…'
                : selected?.is_active
                  ? 'Suspendre'
                  : 'Réactiver'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {linkingUser && (
        <MembershipLinkSheet
          key={linkingUser.id}
          user={linkingUser}
          onClose={() => setLinkingUser(null)}
        />
      )}
    </div>
  )
}

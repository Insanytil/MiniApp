import { useId, useMemo, useState } from 'react'
import {
  Building2,
  ChevronDown,
  LoaderCircle,
  MoreHorizontal,
  Pause,
  Play,
  Search,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { PlatformUser } from '../users'
import { filterUserMemberships, membershipAccessState } from '../user-access'
import { useUserOrganizationAccess } from '../use-user-organization-access'

export function UserOrganizationsCell({ user }: { user: PlatformUser }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const searchId = useId()
  const mutation = useUserOrganizationAccess()
  const memberships = useMemo(
    () => filterUserMemberships(user.memberships, search),
    [user.memberships, search],
  )
  const count = user.memberships.length

  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        // Preserve the popup height until its exit animation has finished.
        if (value) setSearch('')
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            disabled={!count}
            aria-label={`${count} organisation${count > 1 ? 's' : ''} pour ${user.email}`}
          />
        }
      >
        <Building2
          className="size-3.5 text-muted-foreground"
          aria-hidden="true"
        />
        {count} organisation{count > 1 ? 's' : ''}
        <ChevronDown
          className="size-3.5 text-muted-foreground"
          aria-hidden="true"
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="max-h-[min(65svh,var(--available-height))] w-[min(28rem,calc(100vw-2rem))] gap-0 p-0"
      >
        <PopoverHeader className="shrink-0 border-b px-4 py-3">
          <PopoverTitle>Organisations ({count})</PopoverTitle>
          <PopoverDescription className="break-all text-xs">
            {user.email}
          </PopoverDescription>
          {!user.is_active && (
            <p className="mt-1 text-xs text-muted-foreground">
              Le compte utilisateur est suspendu dans toute l’application.
            </p>
          )}
          {!user.is_verified && (
            <p className="mt-1 text-xs text-muted-foreground">
              Le compte est en attente d’activation.
            </p>
          )}
        </PopoverHeader>
        {count > 5 && (
          <div className="relative m-3 shrink-0">
            <Label className="sr-only" htmlFor={searchId}>
              Filtrer les organisations de cet utilisateur
            </Label>
            <Search
              className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id={searchId}
              placeholder="Rechercher dans les organisations…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
        )}
        <ul
          aria-label={`Adhésions de ${user.email}`}
          className="max-h-[min(22rem,50svh)] min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 whitespace-normal"
        >
          {memberships.map((membership) => {
            const state = membershipAccessState(user, membership)
            const pending =
              mutation.isPending &&
              mutation.variables.organization.id === membership.organization_id
            return (
              <li
                key={membership.organization_id}
                className="flex items-start gap-3 border-b py-3 last:border-0"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <p className="font-medium break-words">
                      {membership.organization_name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {membership.role === 'organization_admin'
                        ? 'Administrateur'
                        : 'Utilisateur'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-2 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">
                        Organisation
                      </span>
                      <Badge
                        variant={
                          membership.organization_is_active
                            ? 'secondary'
                            : 'outline'
                        }
                      >
                        {membership.organization_is_active
                          ? 'Active'
                          : 'Suspendue'}
                      </Badge>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">
                        Accès individuel
                      </span>
                      <Badge
                        variant={membership.is_active ? 'secondary' : 'outline'}
                        title={state.reason}
                      >
                        {membership.is_active ? 'Actif' : 'Désactivé'}
                      </Badge>
                    </span>
                  </div>
                  {!state.active && membership.is_active && (
                    <p className="text-xs text-muted-foreground">
                      {state.reason}
                    </p>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={mutation.isPending}
                        aria-label={`Actions sur l’accès à ${membership.organization_name}`}
                        aria-busy={pending}
                      />
                    }
                  >
                    {pending ? (
                      <LoaderCircle
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <MoreHorizontal />
                    )}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      onClick={() =>
                        mutation.mutate({
                          user,
                          organization: {
                            id: membership.organization_id,
                            name: membership.organization_name,
                            is_active: membership.organization_is_active,
                          },
                          isActive: !membership.is_active,
                        })
                      }
                    >
                      {membership.is_active ? (
                        <Pause aria-hidden="true" />
                      ) : (
                        <Play aria-hidden="true" />
                      )}
                      {membership.is_active
                        ? 'Suspendre l’accès'
                        : 'Réactiver l’accès'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            )
          })}
          {!memberships.length && (
            <li
              className="py-6 text-center text-sm text-muted-foreground"
              role="status"
            >
              Aucune organisation ne correspond à cette recherche.
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

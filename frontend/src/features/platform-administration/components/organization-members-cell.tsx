import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { useServerList } from '@/components/data-table/use-server-list'
import { errorMessage } from '@/lib/api/client'
import type { OrganizationListItem } from '../organizations'
import { organizationMembersQuery } from '../organization-members'

export function OrganizationMembersCell({
  organization,
}: {
  organization: OrganizationListItem
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label={`Afficher les membres de ${organization.name}`}
          />
        }
      >
        <Users className="size-3.5 text-muted-foreground" aria-hidden="true" />
        {organization.members_count} membre
        {organization.members_count > 1 ? 's' : ''}
        <ChevronDown className="size-3.5" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="max-h-[min(70svh,var(--available-height))] w-[min(28rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0"
      >
        <PopoverHeader className="shrink-0 border-b px-4 py-3">
          <PopoverTitle>Membres</PopoverTitle>
          <PopoverDescription className="break-words">
            {organization.name}
          </PopoverDescription>
          {!organization.is_active && (
            <p className="text-xs text-muted-foreground">
              Organisation suspendue : les accès sont bloqués.
            </p>
          )}
        </PopoverHeader>
        {/* The portal keeps the full content mounted through the exit animation. */}
        <MembersList organization={organization} />
      </PopoverContent>
    </Popover>
  )
}
function MembersList({ organization }: { organization: OrganizationListItem }) {
  const list = useServerList()
  const searchId = useId()
  const query = useQuery(organizationMembersQuery(organization.id, list.params))
  const busy = query.isFetching || list.isDebouncing
  return (
    <>
      <div className="shrink-0 p-3">
        <Label htmlFor={searchId} className="sr-only">
          Rechercher un membre par email
        </Label>
        <Input
          id={searchId}
          placeholder="Rechercher un email…"
          value={list.search}
          onChange={(event) => list.setSearch(event.target.value)}
        />
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4"
        aria-busy={busy}
      >
        {query.isPending ? (
          <p role="status" className="py-6 text-center text-muted-foreground">
            Chargement des membres…
          </p>
        ) : query.isError ? (
          <div role="alert" className="space-y-2 py-4">
            <p>{errorMessage(query.error)}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void query.refetch()}
            >
              Réessayer
            </Button>
          </div>
        ) : (
          <ul
            aria-label={`Membres de ${organization.name}`}
            className="whitespace-normal"
          >
            {query.data.items.map((member) => (
              <li
                key={member.user_id}
                className="space-y-2 border-b py-3 last:border-0"
              >
                <div>
                  <p className="font-medium break-all">{member.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {member.role === 'organization_admin'
                      ? 'Administrateur'
                      : 'Utilisateur'}
                    {member.is_superuser ? ' · SuperUser' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    Accès individuel
                  </span>
                  <Badge
                    variant={
                      member.membership_is_active ? 'secondary' : 'outline'
                    }
                  >
                    {member.membership_is_active ? 'Actif' : 'Désactivé'}
                  </Badge>
                  {!member.user_is_active && (
                    <Badge variant="outline">Compte suspendu</Badge>
                  )}
                  {!member.user_is_verified && (
                    <Badge variant="outline">Activation en attente</Badge>
                  )}
                </div>
              </li>
            ))}
            {!query.data.items.length && (
              <li
                role="status"
                className="py-6 text-center text-muted-foreground"
              >
                {list.params.search
                  ? 'Aucun membre ne correspond à cette recherche.'
                  : 'Aucun membre dans cette organisation.'}
              </li>
            )}
          </ul>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 border-t px-3 py-2">
        <span className="text-xs text-muted-foreground" aria-live="polite">
          Page {list.params.page} /{' '}
          {Math.max(1, query.data?.pagination.total_pages ?? list.params.page)}
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || list.params.page <= 1}
            onClick={() => list.setParams((p) => ({ ...p, page: p.page - 1 }))}
          >
            Précédent
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={
              busy ||
              !query.data ||
              list.params.page >= query.data.pagination.total_pages
            }
            onClick={() => list.setParams((p) => ({ ...p, page: p.page + 1 }))}
          >
            Suivant
          </Button>
        </div>
      </div>
    </>
  )
}

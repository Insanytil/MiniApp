import { useEffect, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth'
import { navigationQuery } from '../navigation'
import type { MenuNode } from '../navigation'
import { MenuIcon } from './menu-icon'

export function OrganizationMenu({ onNavigate }: { onNavigate: () => void }) {
  const { organization } = useAuth()
  return organization ? (
    <ScopedMenu
      key={organization.id}
      organizationId={organization.id}
      onNavigate={onNavigate}
    />
  ) : null
}
function ScopedMenu({
  organizationId,
  onNavigate,
}: {
  organizationId: string
  onNavigate: () => void
}) {
  const query = useQuery(navigationQuery(organizationId))
  if (query.isPending)
    return (
      <p role="status" className="px-3 py-2 text-xs text-muted-foreground">
        Chargement du menu…
      </p>
    )
  if (query.isError && !query.data)
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">
        <p>Menu indisponible.</p>
        <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
          Réessayer
        </Button>
      </div>
    )
  return query.data?.resolved_nodes.length ? (
    <ul
      className="mt-3 space-y-1 border-t pt-3"
      aria-label="Menu de l’organisation"
    >
      {query.data.resolved_nodes.map((node) => (
        <MenuItem key={node.id} node={node} onNavigate={onNavigate} />
      ))}
    </ul>
  ) : null
}
function containsPath(node: MenuNode, pathname: string): boolean {
  return node.kind === 'entity'
    ? pathname.replace(/\/+$/, '') ===
        `/workspace/entities/${node.entity_type_id}`
    : node.children.some((child) => containsPath(child, pathname))
}
function MenuItem({
  node,
  onNavigate,
}: {
  node: MenuNode
  onNavigate: () => void
}) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const active = containsPath(node, pathname)
  const [open, setOpen] = useState(active)
  useEffect(() => {
    if (active) setOpen(true)
  }, [active])
  if (node.kind === 'entity')
    return (
      <li>
        <Link
          to="/workspace/entities/$entityTypeId"
          params={{ entityTypeId: node.entity_type_id }}
          onClick={onNavigate}
          className="flex min-w-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-accent"
          activeProps={{
            className: 'bg-accent text-accent-foreground font-medium',
          }}
        >
          <MenuIcon icon={node.icon} kind={node.kind} />
          <span className="truncate" title={node.label ?? ''}>
            {node.label}
          </span>
        </Link>
      </li>
    )
  return (
    <li>
      <Button
        variant="ghost"
        className="h-auto w-full justify-start gap-2 px-3 py-2.5 text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronRight
          className={`size-3.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
        <MenuIcon icon={node.icon} kind={node.kind} />
        <span className="truncate" title={node.label}>
          {node.label}
        </span>
      </Button>
      {open && (
        <ul className="ml-3 space-y-1 border-l pl-1">
          {node.children.map((child) => (
            <MenuItem key={child.id} node={child} onNavigate={onNavigate} />
          ))}
          {!node.children.length && (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              Catégorie vide
            </li>
          )}
        </ul>
      )}
    </li>
  )
}

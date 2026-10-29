import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react'
import { useAuth } from '@/features/auth'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from '@/components/ui/toast'
import {
  entries,
  navigationError,
  navigationKey,
  navigationQuery,
  removeNode,
  reorderNode,
  saveNavigation,
  validateMenu,
} from '../navigation'
import type { MenuNode, MenuResponse } from '../navigation'
import { MenuNodeSheet } from './menu-node-sheet'
import { MenuIcon } from './menu-icon'
import { DraftProtection } from '@/components/draft-protection'

export function OrganizationNavigationPage() {
  const { organization } = useAuth()
  return organization ? (
    <LoadMenu key={organization.id} organizationId={organization.id} />
  ) : null
}
function LoadMenu({ organizationId }: { organizationId: string }) {
  const query = useQuery(navigationQuery(organizationId))
  if (query.isPending) return <p role="status">Chargement du menu…</p>
  if (query.isError && !query.data)
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {navigationError(query.error)}{' '}
          <Button variant="outline" onClick={() => void query.refetch()}>
            Réessayer
          </Button>
        </AlertDescription>
      </Alert>
    )
  if (!query.data) return null
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {query.isError && (
        <Alert variant="destructive" className="shrink-0">
          <AlertDescription>
            Actualisation impossible. Votre brouillon est conservé.
          </AlertDescription>
        </Alert>
      )}
      <div className="min-h-0 flex-1">
        <MenuEditor organizationId={organizationId} saved={query.data} />
      </div>
    </div>
  )
}
function MenuEditor({
  organizationId,
  saved,
}: {
  organizationId: string
  saved: MenuResponse
}) {
  const client = useQueryClient()
  const [base, setBase] = useState(saved)
  const [nodes, setNodes] = useState<MenuNode[]>(() =>
    structuredClone(saved.document.nodes),
  )
  const [editing, setEditing] = useState<{ item?: MenuNode } | null>(null)
  const [deleting, setDeleting] = useState<MenuNode | null>(null)
  const [reloading, setReloading] = useState(false)
  const [reloadBusy, setReloadBusy] = useState(false)
  const dirty = JSON.stringify(nodes) !== JSON.stringify(base.document.nodes)
  const mutation = useMutation({
    mutationFn: () => {
      validateMenu(
        nodes,
        saved.entity_types.map((type) => type.id),
      )
      return saveNavigation(organizationId, base.version, nodes)
    },
    retry: false,
    onSuccess: (result) => {
      setBase(result)
      setNodes(structuredClone(result.document.nodes))
      client.setQueryData(navigationKey(organizationId), result)
      toast.add({ title: 'Menu enregistré', type: 'success' })
    },
  })
  const change = (next: MenuNode[]) => {
    setNodes(next)
    mutation.reset()
  }
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-4">
      <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            to="/organization/configuration"
            className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground"
          >
            <ArrowLeft className="size-4" />
            Configuration
          </Link>
          <h1 className="text-2xl font-semibold">Menu de l’organisation</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Composez les catégories et les accès aux types d’entités.
          </p>
          {dirty && (
            <p className="mt-1 text-xs text-muted-foreground">
              Modifications non enregistrées
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => setReloading(true)}
          >
            <RefreshCw />
            Recharger
          </Button>
          <Button
            disabled={!dirty || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Save />
            )}
            Enregistrer le menu
          </Button>
        </div>
      </div>
      {saved.version !== base.version && (
        <Alert className="shrink-0">
          <AlertDescription>
            Une nouvelle version est disponible. Rechargez le menu avant de
            poursuivre vos modifications.
          </AlertDescription>
        </Alert>
      )}
      {mutation.isError && (
        <Alert variant="destructive" className="shrink-0">
          <AlertDescription>{navigationError(mutation.error)}</AlertDescription>
        </Alert>
      )}
      <div className="flex shrink-0 items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {entries(nodes).length} éléments · 8 niveaux maximum
        </span>
        <Button
          size="sm"
          disabled={mutation.isPending}
          onClick={() => setEditing({})}
        >
          <Plus />
          Ajouter un élément
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border bg-card p-3 sm:p-5">
        <EditorTree
          nodes={nodes}
          types={saved.entity_types}
          disabled={mutation.isPending}
          onEdit={(item) => setEditing({ item })}
          onDelete={setDeleting}
          onMove={(id, offset) => change(reorderNode(nodes, id, offset))}
        />
        {!nodes.length && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Le menu est vide. Ajoutez une catégorie ou un type d’entité.
          </p>
        )}
      </div>
      <p className="shrink-0 text-xs text-muted-foreground">
        Les liens ouvrent la vue par défaut du type. Retirer un lien ne supprime
        aucune donnée.
      </p>
      {editing && (
        <MenuNodeSheet
          nodes={nodes}
          item={editing.item}
          types={saved.entity_types}
          onSave={change}
          onClose={() => setEditing(null)}
        />
      )}
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer cet élément du menu ?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.kind === 'category'
                ? 'La catégorie et tous les éléments de menu qu’elle contient seront retirés.'
                : 'Ce lien sera retiré du menu.'}{' '}
              Les types d’entités et leurs données seront conservés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleting) change(removeNode(nodes, deleting.id))
                setDeleting(null)
              }}
            >
              Retirer du brouillon
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={reloading} onOpenChange={setReloading}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recharger le menu ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le brouillon non enregistré sera abandonné.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              disabled={reloadBusy}
              onClick={() => setReloading(false)}
            >
              Annuler
            </Button>
            <Button
              disabled={reloadBusy}
              onClick={async () => {
                setReloadBusy(true)
                try {
                  const result = await client.fetchQuery({
                    ...navigationQuery(organizationId),
                    staleTime: 0,
                  })
                  setBase(result)
                  setNodes(structuredClone(result.document.nodes))
                  mutation.reset()
                  setReloading(false)
                } catch (error) {
                  toast.add({
                    title: 'Rechargement impossible',
                    description: navigationError(error),
                    type: 'error',
                  })
                } finally {
                  setReloadBusy(false)
                }
              }}
            >
              Recharger
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <DraftProtection dirty={dirty} busy={mutation.isPending} />
    </div>
  )
}
function EditorTree({
  nodes,
  types,
  disabled,
  onEdit,
  onDelete,
  onMove,
}: {
  nodes: MenuNode[]
  types: MenuResponse['entity_types']
  disabled: boolean
  onEdit: (node: MenuNode) => void
  onDelete: (node: MenuNode) => void
  onMove: (id: string, offset: number) => void
}) {
  return (
    <ul className="space-y-2">
      {nodes.map((node, index) => {
        const label =
          node.label ||
          (node.kind === 'entity'
            ? types.find((type) => type.id === node.entity_type_id)?.name
            : '') ||
          'Type indisponible'
        return (
          <li key={node.id}>
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-2">
              <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
                <MenuIcon icon={node.icon} kind={node.kind} />
                <span className="truncate" title={label}>
                  {label}
                </span>
              </span>
              <div className="flex shrink-0">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled || index === 0}
                  aria-label={`Monter ${label}`}
                  onClick={() => onMove(node.id, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled || index === nodes.length - 1}
                  aria-label={`Descendre ${label}`}
                  onClick={() => onMove(node.id, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled}
                  aria-label={`Modifier ${label}`}
                  onClick={() => onEdit(node)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={disabled}
                  aria-label={`Retirer ${label}`}
                  onClick={() => onDelete(node)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            {node.kind === 'category' && (
              <div className="mt-2 ml-2 border-l pl-2 sm:ml-4 sm:pl-3">
                <EditorTree
                  nodes={node.children}
                  types={types}
                  disabled={disabled}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onMove={onMove}
                />
                {!node.children.length && (
                  <p className="py-2 text-xs text-muted-foreground">
                    Catégorie vide
                  </p>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, LoaderCircle, Plus, RefreshCw, Save } from 'lucide-react'
import { useAuth } from '@/features/auth'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DraftProtection } from '@/components/draft-protection'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
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
import { MenuEditorTree } from './menu-editor-tree'
import { MenuNodeSheet } from './menu-node-sheet'

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
  const resetTo = (menu: MenuResponse) => {
    setBase(menu)
    change(structuredClone(menu.document.nodes))
  }
  const reload = async () => {
    setReloadBusy(true)
    try {
      resetTo(
        await client.fetchQuery({
          ...navigationQuery(organizationId),
          staleTime: 0,
        }),
      )
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
        <MenuEditorTree
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
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Retirer cet élément du menu ?"
        description={`${
          deleting?.kind === 'category'
            ? 'La catégorie et tous les éléments de menu qu’elle contient seront retirés.'
            : 'Ce lien sera retiré du menu.'
        } Les types d’entités et leurs données seront conservés.`}
        confirmLabel="Retirer du brouillon"
        destructive
        onConfirm={() => {
          if (deleting) change(removeNode(nodes, deleting.id))
          setDeleting(null)
        }}
      />
      <ConfirmDialog
        open={reloading}
        onOpenChange={setReloading}
        title="Recharger le menu ?"
        description="Le brouillon non enregistré sera abandonné."
        confirmLabel="Recharger"
        disabled={reloadBusy}
        onConfirm={reload}
      />
      <DraftProtection dirty={dirty} busy={mutation.isPending} />
    </div>
  )
}

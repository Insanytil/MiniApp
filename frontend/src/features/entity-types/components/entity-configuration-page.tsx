import { useEffect, useRef, useState } from 'react'
import { Link, useBlocker } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react'
import { useAuth } from '@/features/auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  configurationCatalogQuery,
  configurationError,
  dependentDefinitions,
  navigations,
  saveConfiguration,
  withDisplayProfile,
} from '../configuration'
import type {
  ConfiguredEntityType,
  DefinitionItem,
  DefinitionKind,
  DisplayProfile,
  EntityConfiguration,
  ViewDefinition,
} from '../configuration'
import { recordRootKey } from '@/features/entity-records/creation'
import { entityTypeKeys } from '../entity-types'
import { DefinitionSheet } from './definition-sheet'
import { ConfigurationPreview } from './configuration-preview'
import { FieldsTable } from './fields-table'
import { RelationsTable } from './relations-table'
import { ViewsTable } from './views-table'

const kinds: DefinitionKind[] = [
  'fields',
  'relations',
  'display_profiles',
  'views',
]
const labels = {
  fields: 'Champs',
  relations: 'Relations',
  display_profiles: 'Affichages',
  views: 'Vues',
}
export function EntityConfigurationPage({
  entityTypeId,
}: {
  entityTypeId: string
}) {
  const { organization } = useAuth()
  return organization ? (
    <LoadConfiguration
      key={`${organization.id}/${entityTypeId}`}
      organizationId={organization.id}
      entityTypeId={entityTypeId}
    />
  ) : null
}
function LoadConfiguration({
  organizationId,
  entityTypeId,
}: {
  organizationId: string
  entityTypeId: string
}) {
  const query = useQuery(configurationCatalogQuery(organizationId))
  if (query.isPending)
    return <p role="status">Chargement de la configuration…</p>
  if (query.isError && !query.data)
    return (
      <Alert variant="destructive">
        <AlertDescription>
          <p>{configurationError(query.error)}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Réessayer
          </Button>
        </AlertDescription>
      </Alert>
    )
  const catalog = query.data
  const type = catalog.find((item) => item.id === entityTypeId)
  if (!type)
    return (
      <div className="space-y-4">
        <p>Ce type d’entité n’est plus disponible.</p>
        <Link to="/organization/configuration">Retour à la configuration</Link>
      </div>
    )
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
      {query.isError && (
        <Alert variant="destructive" className="shrink-0">
          <AlertDescription>
            Actualisation impossible. Votre brouillon est conservé.{' '}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void query.refetch()}
            >
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div className="min-h-0 min-w-0 flex-1">
        <ConfigurationEditor
          organizationId={organizationId}
          type={type}
          catalog={catalog}
        />
      </div>
    </div>
  )
}
function ConfigurationEditor({
  organizationId,
  type: saved,
  catalog: savedCatalog,
}: {
  organizationId: string
  type: ConfiguredEntityType
  catalog: ConfiguredEntityType[]
}) {
  const client = useQueryClient()
  const { registerOrganizationChangeGuard, selectOrganization } = useAuth()
  const [pendingOrganization, setPendingOrganization] = useState<string | null>(
    null,
  )
  const allowOrganizationChange = useRef(false)
  const saving = useRef(false)
  const [base, setBase] = useState(saved)
  const [draft, setDraft] = useState<EntityConfiguration>(() =>
    structuredClone(saved.configuration),
  )
  const [editing, setEditing] = useState<{
    kind: DefinitionKind
    item?: DefinitionItem
  } | null>(null)
  const [reloading, setReloading] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [definitionDirty, setDefinitionDirty] = useState(false)
  const [relatedBusy, setRelatedBusy] = useState(false)
  const dirty =
    definitionDirty ||
    JSON.stringify(draft) !== JSON.stringify(base.configuration)
  const changeCount = kinds.reduce((total, kind) => {
    const before = new Map(
      base.configuration[kind].map((item) => [item.id, JSON.stringify(item)]),
    )
    const after = new Map(
      draft[kind].map((item) => [item.id, JSON.stringify(item)]),
    )
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter(
      (id) => before.get(id) !== after.get(id),
    ).length
    const reordered =
      base.configuration[kind].map((item) => item.id).join(',') !==
      draft[kind].map((item) => item.id).join(',')
    return total + (changed || (reordered ? 1 : 0))
  }, 0)
  useEffect(
    () =>
      registerOrganizationChangeGuard((id) => {
        if (saving.current) {
          toast.add({
            title: 'Enregistrement en cours',
            description: 'Attendez sa fin avant de changer d’organisation.',
            type: 'loading',
          })
          return false
        }
        if (!dirty || allowOrganizationChange.current) return true
        setPendingOrganization(id)
        return false
      }),
    [dirty, registerOrganizationChangeGuard],
  )
  const blocker = useBlocker({
    shouldBlockFn: ({ next }) =>
      (dirty || saving.current) && next.pathname !== '/login',
    enableBeforeUnload: dirty,
    withResolver: true,
  })
  const type = { ...saved, configuration: draft }
  const catalog = savedCatalog.map((item) =>
    item.id === type.id ? type : item,
  )
  const mutation = useMutation({
    mutationFn: () =>
      saveConfiguration(
        organizationId,
        type.id,
        base.configuration_version,
        draft,
      ),
    retry: false,
    onSuccess: async (result) => {
      setBase(result)
      setDraft(structuredClone(result.configuration))
      await Promise.all([
        client.invalidateQueries({ queryKey: entityTypeKeys(organizationId) }),
        client.invalidateQueries({ queryKey: recordRootKey(organizationId) }),
      ])
      toast.add({
        title: 'Configuration enregistrée',
        description: type.name,
        type: 'success',
      })
    },
  })
  const busy = mutation.isPending || relatedBusy
  saving.current = busy
  const saveRelatedProfile = async (
    target: ConfiguredEntityType,
    profile: DisplayProfile,
  ) => {
    if (target.id === type.id) {
      put('display_profiles', profile)
      return
    }
    try {
      const result = await saveConfiguration(
        organizationId,
        target.id,
        target.configuration_version,
        withDisplayProfile(target.configuration, profile),
      )
      client.setQueryData<ConfiguredEntityType[]>(
        configurationCatalogQuery(organizationId).queryKey,
        (previous) =>
          previous?.map((item) => (item.id === result.id ? result : item)),
      )
      await Promise.all([
        client.invalidateQueries({ queryKey: entityTypeKeys(organizationId) }),
        client.invalidateQueries({ queryKey: recordRootKey(organizationId) }),
      ])
      toast.add({
        title: 'Profil enregistré',
        description: `${profile.name} · ${target.name}`,
        type: 'success',
      })
    } catch (error) {
      await client.invalidateQueries({
        queryKey: configurationCatalogQuery(organizationId).queryKey,
      })
      throw error
    }
  }
  const put = (kind: DefinitionKind, item: DefinitionItem) => {
    setDraft((previous) => {
      const existing = previous[kind] as DefinitionItem[]
      const next = existing.some((value) => value.id === item.id)
        ? existing.map((value) => (value.id === item.id ? item : value))
        : [...existing, item]
      if (kind === 'views' || kind === 'display_profiles') {
        const defaultItem = (item as DisplayProfile | ViewDefinition).is_default
          ? item.id
          : ((next as (DisplayProfile | ViewDefinition)[]).find(
              (value) => value.is_default,
            )?.id ?? next[0]?.id)
        return {
          ...previous,
          [kind]: next.map((value) => ({
            ...value,
            is_default: value.id === defaultItem,
          })),
        }
      }
      return { ...previous, [kind]: next }
    })
    mutation.reset()
  }
  const remove = (kind: DefinitionKind, item: DefinitionItem) => {
    const dependencies = dependentDefinitions(item.id, catalog)
    if (dependencies.length) {
      toast.add({
        title: 'Définition utilisée',
        description: dependencies.join(', '),
        type: 'warning',
      })
      return
    }
    setDraft((previous) => {
      const next = previous[kind].filter((value) => value.id !== item.id)
      if (
        (kind === 'views' || kind === 'display_profiles') &&
        next.length &&
        !(next as (DisplayProfile | ViewDefinition)[]).some(
          (value) => value.is_default,
        )
      )
        return {
          ...previous,
          [kind]: next.map((value, i) => ({ ...value, is_default: i === 0 })),
        }
      return { ...previous, [kind]: next }
    })
    mutation.reset()
  }
  return (
    <div className="relative mx-auto flex h-full min-h-0 min-w-0 w-full max-w-7xl flex-col gap-4">
      <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            to="/organization/configuration"
            className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Types d’entités
          </Link>
          <h1 className="text-2xl font-semibold break-words">{type.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <code className="break-all">{type.technical_name}</code> · Version{' '}
            {base.configuration_version}
            {dirty ? ' · Modifications non enregistrées' : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setReloading(true)}
          >
            <RefreshCw />
            Recharger
          </Button>
          <Button
            disabled={!dirty || busy || editing !== null}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Save />
            )}
            Enregistrer la configuration
            {changeCount > 0 && (
              <span
                className="size-1.5 rounded-full bg-amber-400"
                aria-label="Modifications non enregistrées"
              />
            )}
          </Button>
        </div>
      </div>
      {saved.configuration_version !== base.configuration_version && (
        <Alert className="shrink-0">
          <AlertDescription>
            Une nouvelle version est disponible. Votre brouillon est conservé ;
            rechargez la configuration avant de reprendre vos modifications.
          </AlertDescription>
        </Alert>
      )}
      {mutation.isError && (
        <Alert variant="destructive" className="shrink-0">
          <AlertDescription>
            {configurationError(mutation.error)}
          </AlertDescription>
        </Alert>
      )}
      <Tabs defaultValue="fields" className="min-h-0 min-w-0 flex-1 gap-4">
        <div className="shrink-0 overflow-x-auto">
          <TabsList>
            {kinds.map((kind) => (
              <TabsTrigger key={kind} value={kind} className="group">
                {labels[kind]}
                <Badge
                  variant="secondary"
                  className="h-4 min-w-4 px-1 text-[10px] group-data-active:bg-primary group-data-active:text-primary-foreground"
                >
                  {kind === 'relations'
                    ? navigations(type.id, catalog).length
                    : kind === 'fields'
                      ? draft.fields.length +
                        type.available_system_fields.length
                      : draft[kind].length}
                </Badge>
              </TabsTrigger>
            ))}
            <TabsTrigger value="preview">Aperçu</TabsTrigger>
          </TabsList>
        </div>
        {kinds.map((kind) => (
          <TabsContent
            key={kind}
            value={kind}
            className={
              kind === 'fields' || kind === 'relations' || kind === 'views'
                ? `flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${changeCount > 0 ? 'pb-20' : 'pb-1'}`
                : 'min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto pb-24'
            }
          >
            {kind === 'fields' ? (
              <FieldsTable
                type={type}
                catalog={catalog}
                busy={busy}
                onAdd={() => setEditing({ kind: 'fields' })}
                onEdit={(item) => setEditing({ kind: 'fields', item })}
                onRemove={(item) => remove('fields', item)}
                onReorder={(fields) => {
                  setDraft((previous) => ({ ...previous, fields }))
                  mutation.reset()
                }}
              />
            ) : kind === 'relations' ? (
              <RelationsTable
                type={type}
                catalog={catalog}
                busy={busy}
                onAdd={() => setEditing({ kind: 'relations' })}
                onEdit={(item) => setEditing({ kind: 'relations', item })}
                onRemove={(item) => remove('relations', item)}
              />
            ) : kind === 'views' ? (
              <ViewsTable
                type={type}
                catalog={catalog}
                busy={busy}
                onAdd={() => setEditing({ kind: 'views' })}
                onEdit={(item) => setEditing({ kind: 'views', item })}
                onRemove={(item) => remove('views', item)}
                onSetDefault={(item) =>
                  put('views', { ...item, is_default: true })
                }
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    Composez un titre, un sous-titre et un avatar réutilisables.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => setEditing({ kind })}
                    disabled={busy}
                  >
                    <Plus />
                    Ajouter
                  </Button>
                </div>
                {draft[kind].map((item) => {
                  const dependencies = dependentDefinitions(item.id, catalog)
                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 rounded-xl border bg-card p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium break-words">
                          {item.name}
                          {item.is_default && (
                            <Badge className="ml-2" variant="secondary">
                              Par défaut
                            </Badge>
                          )}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground break-words">
                          {`${item.title_fields.map((id) => [...type.available_system_fields, ...draft.fields].find((field) => field.id === id)?.name ?? 'Champ absent').join(item.separator)}${item.image_field ? ' · Avec avatar' : ''}`}
                        </p>
                        {dependencies.length > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Utilisé par {dependencies.join(', ')}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={busy}
                        aria-label={`Modifier ${item.name}`}
                        onClick={() => setEditing({ kind, item })}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={busy || dependencies.length > 0}
                        title={
                          dependencies.length
                            ? 'Retirez les références avant de supprimer cette définition.'
                            : undefined
                        }
                        aria-label={`Supprimer ${item.name}`}
                        onClick={() => remove(kind, item)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  )
                })}
                {!draft[kind].length && (
                  <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    Aucune définition pour le moment.
                  </div>
                )}
              </>
            )}
          </TabsContent>
        ))}
        <TabsContent
          value="preview"
          className="min-h-0 flex-1 overflow-y-auto pb-4"
        >
          <ConfigurationPreview type={type} catalog={catalog} />
        </TabsContent>
      </Tabs>
      {changeCount > 0 && (
        <div
          className="absolute bottom-3 left-1/2 z-30 flex w-max max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-3 rounded-2xl border bg-background px-4 py-2 shadow-lg sm:rounded-full"
          role="region"
          aria-label="Modifications de configuration"
        >
          <p className="flex items-center gap-2 text-xs" role="status">
            <span className="size-1.5 shrink-0 rounded-full bg-amber-400" />
            {changeCount} modification{changeCount > 1 ? 's' : ''} non
            enregistrée{changeCount > 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy || editing !== null}
              onClick={() => setDiscarding(true)}
            >
              Annuler
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || editing !== null}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending && <LoaderCircle className="animate-spin" />}
              Enregistrer
            </Button>
          </div>
        </div>
      )}
      <AlertDialog open={discarding} onOpenChange={setDiscarding}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler les modifications ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le brouillon sera remplacé par la dernière configuration
              enregistrée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDiscarding(false)}>
              Continuer la configuration
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setDraft(structuredClone(base.configuration))
                mutation.reset()
                setDiscarding(false)
              }}
            >
              Annuler les modifications
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {editing && (
        <DefinitionSheet
          key={`${editing.kind}/${editing.item?.id ?? 'new'}`}
          kind={editing.kind}
          item={editing.item}
          type={type}
          catalog={catalog}
          onSaveRelatedProfile={saveRelatedProfile}
          onBusyChange={setRelatedBusy}
          onDirtyChange={setDefinitionDirty}
          onSave={(item) => put(editing.kind, item)}
          onClose={() => setEditing(null)}
        />
      )}
      <AlertDialog
        open={pendingOrganization !== null}
        onOpenChange={(open) => {
          if (!open) setPendingOrganization(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Changer d’organisation ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le brouillon de configuration de cette organisation sera
              abandonné.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingOrganization(null)}
            >
              Continuer la configuration
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!pendingOrganization) return
                allowOrganizationChange.current = true
                selectOrganization(pendingOrganization)
                allowOrganizationChange.current = false
                setPendingOrganization(null)
              }}
            >
              Changer d’organisation
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={blocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quitter sans enregistrer ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vos modifications de configuration ne sont pas enregistrées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => blocker.reset?.()}>
              Continuer la configuration
            </Button>
            <Button variant="destructive" onClick={() => blocker.proceed?.()}>
              Quitter
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={reloading} onOpenChange={setReloading}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recharger la configuration ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les modifications non enregistrées seront abandonnées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setReloading(false)}>
              Annuler
            </Button>
            <Button
              onClick={async () => {
                try {
                  const fresh = await client.fetchQuery({
                    ...configurationCatalogQuery(organizationId),
                    staleTime: 0,
                  })
                  const current = fresh.find((item) => item.id === type.id)
                  if (!current) throw new Error('Ce type n’existe plus.')
                  setBase(current)
                  setDraft(structuredClone(current.configuration))
                  mutation.reset()
                  setReloading(false)
                } catch (error) {
                  toast.add({
                    title: 'Rechargement impossible',
                    description: configurationError(error),
                    type: 'error',
                  })
                }
              }}
            >
              Recharger
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

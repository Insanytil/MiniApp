import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, LoaderCircle, RefreshCw, Save } from 'lucide-react'
import type { QueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DraftProtection } from '@/components/draft-protection'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/components/ui/toast'
import { recordRootKey } from '@/features/entity-records/creation'
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
} from '../configuration'
import {
  countDraftChanges,
  definitionKinds,
  putDefinition,
  removeDefinition,
} from '../configuration-draft'
import { entityTypeKeys } from '../entity-types'
import { ConfigurationPreview } from './configuration-preview'
import { DefinitionSheet } from './definition-sheet'
import { DisplayProfilesList } from './display-profiles-list'
import { FieldsTable } from './fields-table'
import { RelationsTable } from './relations-table'
import { UnsavedChangesBar } from './unsaved-changes-bar'
import { ViewsTable } from './views-table'

const invalidateConfigurationConsumers = (
  client: QueryClient,
  organizationId: string,
) =>
  Promise.all([
    client.invalidateQueries({ queryKey: entityTypeKeys(organizationId) }),
    client.invalidateQueries({ queryKey: recordRootKey(organizationId) }),
  ])

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
  const [base, setBase] = useState(saved)
  const [draft, setDraft] = useState<EntityConfiguration>(() =>
    structuredClone(saved.configuration),
  )
  const [editing, setEditing] = useState<{
    kind: DefinitionKind
    item?: DefinitionItem
  } | null>(null)
  const [reloading, setReloading] = useState(false)
  const [reloadBusy, setReloadBusy] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [definitionDirty, setDefinitionDirty] = useState(false)
  const [relatedBusy, setRelatedBusy] = useState(false)
  const dirty =
    definitionDirty ||
    JSON.stringify(draft) !== JSON.stringify(base.configuration)
  const changeCount = countDraftChanges(base.configuration, draft)
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
      await invalidateConfigurationConsumers(client, organizationId)
      toast.add({
        title: 'Configuration enregistrée',
        description: type.name,
        type: 'success',
      })
    },
  })
  const busy = mutation.isPending || relatedBusy
  const editDraft = (
    change: (previous: EntityConfiguration) => EntityConfiguration,
  ) => {
    setDraft(change)
    mutation.reset()
  }
  const resetTo = (current: ConfiguredEntityType) => {
    setBase(current)
    setDraft(structuredClone(current.configuration))
    mutation.reset()
  }
  const put = (kind: DefinitionKind, item: DefinitionItem) =>
    editDraft((previous) => putDefinition(previous, kind, item))
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
    editDraft((previous) => removeDefinition(previous, kind, item.id))
  }
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
      await invalidateConfigurationConsumers(client, organizationId)
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
  const reload = async () => {
    setReloadBusy(true)
    try {
      const fresh = await client.fetchQuery({
        ...configurationCatalogQuery(organizationId),
        staleTime: 0,
      })
      const current = fresh.find((item) => item.id === type.id)
      if (!current) throw new Error('Ce type n’existe plus.')
      resetTo(current)
      setReloading(false)
    } catch (error) {
      toast.add({
        title: 'Rechargement impossible',
        description: configurationError(error),
        type: 'error',
      })
    } finally {
      setReloadBusy(false)
    }
  }
  const tabCount = (kind: DefinitionKind) =>
    kind === 'relations'
      ? navigations(type.id, catalog).length
      : kind === 'fields'
        ? draft.fields.length + type.available_system_fields.length
        : draft[kind].length
  const tableActions = (kind: DefinitionKind) => ({
    type,
    catalog,
    busy,
    onAdd: () => setEditing({ kind }),
    onEdit: (item: DefinitionItem) => setEditing({ kind, item }),
    onRemove: (item: DefinitionItem) => remove(kind, item),
  })

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
            {definitionKinds.map((kind) => (
              <TabsTrigger key={kind} value={kind} className="group">
                {labels[kind]}
                <Badge
                  variant="secondary"
                  className="h-4 min-w-4 px-1 text-[10px] group-data-active:bg-primary group-data-active:text-primary-foreground"
                >
                  {tabCount(kind)}
                </Badge>
              </TabsTrigger>
            ))}
            <TabsTrigger value="preview">Aperçu</TabsTrigger>
          </TabsList>
        </div>
        {definitionKinds.map((kind) => (
          <TabsContent
            key={kind}
            value={kind}
            className={
              kind === 'display_profiles'
                ? 'min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto pb-24'
                : `flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${changeCount > 0 ? 'pb-20' : 'pb-1'}`
            }
          >
            {kind === 'fields' ? (
              <FieldsTable
                {...tableActions(kind)}
                onReorder={(fields) =>
                  editDraft((previous) => ({ ...previous, fields }))
                }
              />
            ) : kind === 'relations' ? (
              <RelationsTable {...tableActions(kind)} />
            ) : kind === 'views' ? (
              <ViewsTable
                {...tableActions(kind)}
                onSetDefault={(item) =>
                  put('views', { ...item, is_default: true })
                }
              />
            ) : (
              <DisplayProfilesList {...tableActions(kind)} />
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
        <UnsavedChangesBar
          count={changeCount}
          disabled={busy || editing !== null}
          saving={mutation.isPending}
          onDiscard={() => setDiscarding(true)}
          onSave={() => mutation.mutate()}
        />
      )}
      <ConfirmDialog
        open={discarding}
        onOpenChange={setDiscarding}
        title="Annuler les modifications ?"
        description="Le brouillon sera remplacé par la dernière configuration enregistrée."
        cancelLabel="Continuer la configuration"
        confirmLabel="Annuler les modifications"
        destructive
        disabled={busy}
        onConfirm={() => {
          resetTo(base)
          setDiscarding(false)
        }}
      />
      <ConfirmDialog
        open={reloading}
        onOpenChange={setReloading}
        title="Recharger la configuration ?"
        description="Les modifications non enregistrées seront abandonnées."
        confirmLabel="Recharger"
        disabled={reloadBusy}
        onConfirm={reload}
      />
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
      <DraftProtection
        dirty={dirty}
        busy={busy}
        description="Vos modifications de configuration ne sont pas enregistrées."
      />
    </div>
  )
}

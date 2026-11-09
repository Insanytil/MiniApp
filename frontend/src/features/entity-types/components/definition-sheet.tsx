import { FieldSelection, LabeledCheckbox } from './profile-field-selection'
import { useEffect, useId, useState } from 'react'
import { useForm, useStore } from '@tanstack/react-form'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  configurationError,
  definitionError,
  fieldsOf,
  fieldKinds,
} from '../configuration'
import type {
  ConfiguredEntityType,
  DisplayProfile,
  DefinitionItem,
  DefinitionKind,
  FieldDefinition,
  FieldKind,
  RelationDefinition,
  ViewColumn,
} from '../configuration'
import { toTechnicalName } from '../entity-types'
import { ViewColumnsEditor } from './view-columns-editor'
import { ChoiceBadges, choiceColorHex } from './choice-badges'

const labels = {
  fields: 'champ',
  relations: 'relation',
  display_profiles: 'affichage',
  views: 'vue',
}
interface Draft {
  name: string
  technical_name: string
  kind: FieldKind
  required: boolean
  options: NonNullable<FieldDefinition['options']>
  multiple: boolean
  target_type_ids: string[]
  inverse_name: string
  source_max: 1 | null
  target_max: 1 | null
  on_delete: 'restrict' | 'unlink'
  title_fields: string[]
  secondary_fields: string[]
  image_field: string | null
  separator: string
  is_default: boolean
  columns: ViewColumn[]
}
export function DefinitionSheet({
  kind,
  item,
  type,
  catalog,
  onSave,
  onClose,
  onSaveRelatedProfile,
  onBusyChange,
  onDirtyChange,
  description,
  saveLabel = 'Appliquer au brouillon',
}: {
  kind: DefinitionKind
  item?: DefinitionItem
  type: ConfiguredEntityType
  catalog: ConfiguredEntityType[]
  onSave: (item: DefinitionItem) => void | Promise<void>
  onClose: () => void
  onSaveRelatedProfile?: (
    target: ConfiguredEntityType,
    profile: DisplayProfile,
  ) => Promise<void>
  onBusyChange?: (busy: boolean) => void
  onDirtyChange?: (dirty: boolean) => void
  description?: string
  saveLabel?: string
}) {
  const id = useId()
  const [pending, setPending] = useState(false)
  const [childBusy, setChildBusy] = useState(false)
  const [childDirty, setChildDirty] = useState(false)
  const busy = pending || childBusy
  const [identifierEdited, setIdentifierEdited] = useState(!!item)
  const [error, setError] = useState<string | null>(null)
  const existingRelation =
    kind === 'relations' && item && 'target_type_ids' in item ? item : undefined
  const initialDraft: Draft = {
    name: '',
    technical_name: '',
    kind: 'text',
    required: false,
    options: [],
    multiple: false,
    target_type_ids: [],
    inverse_name: '',
    source_max: 1,
    target_max: null,
    on_delete: 'restrict',
    title_fields: [],
    secondary_fields: [],
    image_field: null,
    separator: ' ',
    is_default: type.configuration[kind].length === 0,
    columns: [],
    ...item,
  }
  const form = useForm({
    defaultValues: {
      draft: initialDraft,
    },
    onSubmit: async ({ value }) => {
      const d = value.draft
      const identity = item?.id ?? crypto.randomUUID()
      let definition: DefinitionItem
      if (kind === 'fields')
        definition = {
          id: identity,
          name: d.name.trim(),
          technical_name: d.technical_name,
          kind: d.kind,
          required: d.required,
          ...(d.kind === 'choice'
            ? {
                options: d.options.map((option) => ({
                  ...option,
                  name: option.name.trim(),
                })),
                multiple: d.multiple,
              }
            : {}),
        }
      else if (kind === 'relations')
        definition = {
          id: identity,
          name: d.name.trim(),
          technical_name: d.technical_name,
          target_type_ids:
            existingRelation?.target_type_ids ?? d.target_type_ids,
          inverse_name: d.inverse_name.trim(),
          source_max: d.source_max,
          target_max: d.target_max,
          required: d.required,
          on_delete: d.on_delete,
        }
      else if (kind === 'display_profiles')
        definition = {
          id: identity,
          name: d.name.trim(),
          title_fields: d.title_fields,
          secondary_fields: d.secondary_fields,
          image_field: d.image_field,
          separator: d.separator,
          is_default: d.is_default,
        }
      else
        definition = {
          id: identity,
          name: d.name.trim(),
          columns: d.columns,
          is_default: d.is_default,
        }
      const problem = definitionError(kind, definition)
      if (problem) {
        setError(problem)
        return
      }
      if (kind === 'fields' || kind === 'relations') {
        const named = definition as FieldDefinition | RelationDefinition
        if (
          [...type.configuration.fields, ...type.configuration.relations].some(
            (existing) =>
              existing.id !== identity &&
              existing.technical_name === named.technical_name,
          )
        ) {
          setError('Cet identifiant est déjà utilisé sur ce type.')
          return
        }
      }
      setPending(true)
      try {
        await onSave(definition)
        onClose()
      } catch (saveError) {
        setError(
          `${configurationError(saveError)}${saveLabel === 'Enregistrer le profil' ? ' En cas de conflit, fermez puis rouvrez cet éditeur pour charger la version actualisée ; la vue reste en brouillon.' : ''}`,
        )
      } finally {
        setPending(false)
      }
    },
  })
  const formDirty = useStore(form.store, (state) => state.isDirty)
  useEffect(() => {
    onBusyChange?.(busy)
    return () => onBusyChange?.(false)
  }, [busy, onBusyChange])
  useEffect(() => {
    onDirtyChange?.(formDirty || childDirty)
    return () => onDirtyChange?.(false)
  }, [formDirty, childDirty, onDirtyChange])
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <SheetContent
        showCloseButton={!busy}
        className={
          kind === 'views'
            ? 'gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[min(96vw,96rem)]'
            : 'gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl'
        }
      >
        <SheetHeader className="shrink-0 border-b p-6 pr-14">
          <SheetTitle>
            {item ? 'Modifier' : 'Ajouter'} : {labels[kind]}
          </SheetTitle>
          <SheetDescription>
            {description ??
              `${type.name} · Les changements seront appliqués avec « Enregistrer la configuration ».`}
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (!busy) void form.handleSubmit()
          }}
        >
          <fieldset disabled={busy} className="contents">
            <form.Subscribe selector={(state) => state.values.draft}>
              {(draft) => {
                const update = (patch: Partial<Draft>) => {
                  form.setFieldValue('draft', { ...draft, ...patch })
                  setError(null)
                }
                return (
                  <div
                    className={
                      kind === 'views'
                        ? 'min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6'
                        : 'min-h-0 flex-1 space-y-5 overflow-y-auto p-6'
                    }
                  >
                    <div
                      className={
                        kind === 'views'
                          ? 'grid gap-4 sm:grid-cols-[minmax(0,32rem)_1fr] sm:items-end'
                          : 'contents'
                      }
                    >
                      <div className="space-y-2">
                        <Label htmlFor={`${id}-name`}>Nom affiché</Label>
                        <Input
                          id={`${id}-name`}
                          autoFocus
                          maxLength={255}
                          value={draft.name}
                          onChange={(event) =>
                            update({
                              name: event.target.value,
                              ...(!identifierEdited
                                ? {
                                    technical_name: toTechnicalName(
                                      event.target.value,
                                    ),
                                  }
                                : {}),
                            })
                          }
                        />
                      </div>
                      {kind === 'views' && (
                        <LabeledCheckbox
                          checked={draft.is_default}
                          onChange={(is_default) => update({ is_default })}
                        >
                          Utiliser par défaut
                        </LabeledCheckbox>
                      )}
                    </div>
                    {(kind === 'fields' || kind === 'relations') && (
                      <div className="space-y-2">
                        <Label htmlFor={`${id}-identifier`}>
                          Identifiant technique
                        </Label>
                        <Input
                          id={`${id}-identifier`}
                          className="font-mono"
                          maxLength={100}
                          readOnly={!!item}
                          value={draft.technical_name}
                          spellCheck={false}
                          autoCapitalize="none"
                          onChange={(event) => {
                            setIdentifierEdited(true)
                            update({ technical_name: event.target.value })
                          }}
                        />
                        <p className="text-xs text-muted-foreground">
                          Stable après création. Les références utilisent un
                          identifiant interne indépendant du nom affiché.
                        </p>
                      </div>
                    )}
                    {kind === 'fields' && draft.kind === 'choice' && (
                      <div className="space-y-2">
                        <LabeledCheckbox
                          checked={draft.multiple}
                          onChange={(multiple) => update({ multiple })}
                        >
                          Autoriser plusieurs choix
                        </LabeledCheckbox>
                        {draft.options.map((option, index) => (
                          <div
                            className="flex flex-wrap items-center gap-2"
                            key={option.id}
                          >
                            <Input
                              aria-label={`Option ${index + 1}`}
                              className="min-w-32 flex-1"
                              placeholder={`Option ${index + 1}`}
                              maxLength={255}
                              value={option.name}
                              onChange={(event) =>
                                update({
                                  options: draft.options.map((entry) =>
                                    entry.id === option.id
                                      ? { ...entry, name: event.target.value }
                                      : entry,
                                  ),
                                })
                              }
                            />
                            <LabeledCheckbox
                              checked={!!option.color}
                              onChange={(enabled) =>
                                update({
                                  options: draft.options.map((entry) =>
                                    entry.id === option.id
                                      ? {
                                          ...entry,
                                          color: enabled ? '#2563eb' : null,
                                        }
                                      : entry,
                                  ),
                                })
                              }
                            >
                              Couleur
                            </LabeledCheckbox>
                            {option.color && (
                              <Input
                                type="color"
                                className="w-12 cursor-pointer p-1"
                                aria-label={`Couleur de l’option ${index + 1}`}
                                value={
                                  choiceColorHex(option.color) ?? '#2563eb'
                                }
                                onChange={(event) => {
                                  const color = event.target.value
                                  update({
                                    options: draft.options.map((entry) =>
                                      entry.id === option.id
                                        ? { ...entry, color }
                                        : entry,
                                    ),
                                  })
                                }}
                              />
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() =>
                                update({
                                  options: draft.options.filter(
                                    (entry) => entry.id !== option.id,
                                  ),
                                })
                              }
                            >
                              Retirer
                            </Button>
                          </div>
                        ))}
                        {draft.options.some((option) => option.name.trim()) && (
                          <ChoiceBadges
                            options={draft.options.filter((option) =>
                              option.name.trim(),
                            )}
                          />
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          disabled={draft.options.length >= 100}
                          onClick={() =>
                            update({
                              options: [
                                ...draft.options,
                                { id: crypto.randomUUID(), name: '' },
                              ],
                            })
                          }
                        >
                          Ajouter une option
                        </Button>
                      </div>
                    )}
                    {kind === 'fields' && (
                      <div className="space-y-2">
                        <Label htmlFor={`${id}-kind`}>Type de donnée</Label>
                        <NativeSelect
                          id={`${id}-kind`}
                          className="w-full"
                          value={draft.kind}
                          onChange={(event) =>
                            update({ kind: event.target.value as FieldKind })
                          }
                        >
                          {Object.entries(fieldKinds).map(([key, label]) => (
                            <NativeSelectOption key={key} value={key}>
                              {label}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </div>
                    )}
                    {(kind === 'fields' || kind === 'relations') && (
                      <LabeledCheckbox
                        checked={draft.required}
                        onChange={(required) =>
                          update({
                            required,
                            ...(required && kind === 'relations'
                              ? { on_delete: 'restrict' as const }
                              : {}),
                          })
                        }
                      >
                        Obligatoire
                      </LabeledCheckbox>
                    )}
                    {kind === 'relations' && (
                      <>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor={`${id}-source-entity`}>
                              Entité de départ
                            </Label>
                            <Input
                              id={`${id}-source-entity`}
                              value={type.name}
                              readOnly
                              className="bg-muted/40"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`${id}-linked-entity`}>
                              Entité liée
                            </Label>
                            {existingRelation ? (
                              <Input
                                id={`${id}-linked-entity`}
                                value={existingRelation.target_type_ids
                                  .map(
                                    (targetId) =>
                                      catalog.find(
                                        (target) => target.id === targetId,
                                      )?.name ?? 'Entité indisponible',
                                  )
                                  .join(', ')}
                                readOnly
                                className="bg-muted/40"
                              />
                            ) : (
                              <NativeSelect
                                id={`${id}-linked-entity`}
                                className="w-full"
                                value={draft.target_type_ids[0] ?? ''}
                                onChange={(event) =>
                                  update({
                                    target_type_ids: event.target.value
                                      ? [event.target.value]
                                      : [],
                                  })
                                }
                              >
                                <NativeSelectOption value="">
                                  Choisir une entité
                                </NativeSelectOption>
                                {catalog.map((target) => (
                                  <NativeSelectOption
                                    key={target.id}
                                    value={target.id}
                                  >
                                    {target.name}
                                    {target.id === type.id
                                      ? ' (même entité)'
                                      : ''}
                                  </NativeSelectOption>
                                ))}
                              </NativeSelect>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {existingRelation
                            ? 'Les entités reliées sont fixées à la création. Pour relier d’autres entités, créez une nouvelle relation.'
                            : 'Les deux entités ne pourront plus être changées après la création de la relation.'}
                        </p>
                        <div className="space-y-2">
                          <Label htmlFor={`${id}-inverse`}>
                            Libellé de la relation inverse
                          </Label>
                          <Input
                            id={`${id}-inverse`}
                            maxLength={255}
                            value={draft.inverse_name}
                            onChange={(event) =>
                              update({ inverse_name: event.target.value })
                            }
                            placeholder="Exemple : Véhicules affectés"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`${id}-cardinality`}>
                            Cardinalité depuis {type.name}
                          </Label>
                          <NativeSelect
                            id={`${id}-cardinality`}
                            className="w-full"
                            value={`${draft.source_max ?? 'n'}:${draft.target_max ?? 'n'}`}
                            onChange={(event) => {
                              const [source, target] =
                                event.target.value.split(':')
                              update({
                                source_max: source === '1' ? 1 : null,
                                target_max: target === '1' ? 1 : null,
                              })
                            }}
                          >
                            <NativeSelectOption value="1:n">
                              Plusieurs vers un — une cible par enregistrement
                            </NativeSelectOption>
                            <NativeSelectOption value="n:1">
                              Un vers plusieurs — plusieurs cibles exclusives
                            </NativeSelectOption>
                            <NativeSelectOption value="1:1">
                              Un vers un — une cible exclusive
                            </NativeSelectOption>
                            <NativeSelectOption value="n:n">
                              Plusieurs vers plusieurs
                            </NativeSelectOption>
                          </NativeSelect>
                          <p className="text-xs text-muted-foreground">
                            Véhicule → Personne : plusieurs vers un. Le sens
                            inverse est créé automatiquement.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`${id}-delete`}>
                            Si un enregistrement lié est supprimé
                          </Label>
                          <NativeSelect
                            id={`${id}-delete`}
                            value={draft.on_delete}
                            onChange={(event) =>
                              update({
                                on_delete: event.target
                                  .value as Draft['on_delete'],
                              })
                            }
                          >
                            <NativeSelectOption value="restrict">
                              Empêcher la suppression
                            </NativeSelectOption>
                            <NativeSelectOption
                              value="unlink"
                              disabled={draft.required}
                            >
                              Détacher le lien
                            </NativeSelectOption>
                          </NativeSelect>
                        </div>
                      </>
                    )}
                    {kind === 'display_profiles' && (
                      <>
                        <FieldSelection
                          label="Champs du titre, dans cet ordre"
                          fields={fieldsOf(type).filter(
                            (field) => field.kind !== 'image',
                          )}
                          selected={draft.title_fields}
                          onChange={(title_fields) => update({ title_fields })}
                        />
                        <div className="space-y-2">
                          <Label htmlFor={`${id}-separator`}>Séparateur</Label>
                          <Input
                            id={`${id}-separator`}
                            maxLength={10}
                            value={draft.separator}
                            onChange={(event) =>
                              update({ separator: event.target.value })
                            }
                          />
                          <p className="text-xs text-muted-foreground">
                            Un espace par défaut : Prénom Nom.
                          </p>
                        </div>
                        <FieldSelection
                          label="Champs du sous-titre"
                          fields={fieldsOf(type).filter(
                            (field) => field.kind !== 'image',
                          )}
                          selected={draft.secondary_fields}
                          onChange={(secondary_fields) =>
                            update({ secondary_fields })
                          }
                        />
                        <div className="space-y-2">
                          <Label htmlFor={`${id}-image`}>Image / avatar</Label>
                          <NativeSelect
                            id={`${id}-image`}
                            value={draft.image_field ?? ''}
                            onChange={(event) =>
                              update({
                                image_field: event.target.value || null,
                              })
                            }
                          >
                            <NativeSelectOption value="">
                              Aucune — utiliser les initiales
                            </NativeSelectOption>
                            {fieldsOf(type)
                              .filter((field) => field.kind === 'image')
                              .map((field) => (
                                <NativeSelectOption
                                  key={field.id}
                                  value={field.id}
                                >
                                  {field.name}
                                </NativeSelectOption>
                              ))}
                          </NativeSelect>
                        </div>
                      </>
                    )}
                    {kind === 'views' && (
                      <ViewColumnsEditor
                        type={type}
                        catalog={catalog}
                        columns={draft.columns}
                        onSaveRelatedProfile={onSaveRelatedProfile}
                        onBusyChange={setChildBusy}
                        onDirtyChange={setChildDirty}
                        onChange={(columns) => update({ columns })}
                      />
                    )}
                    {kind === 'display_profiles' && (
                      <LabeledCheckbox
                        checked={draft.is_default}
                        onChange={(is_default) => update({ is_default })}
                      >
                        Utiliser par défaut
                      </LabeledCheckbox>
                    )}
                    {error && (
                      <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}
                  </div>
                )
              }}
            </form.Subscribe>
            <SheetFooter className="mt-0 shrink-0 border-t p-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Annuler
              </Button>
              <Button type="submit" disabled={busy}>
                {pending && <LoaderCircle className="animate-spin" />}
                {pending ? 'Enregistrement…' : saveLabel}
              </Button>
            </SheetFooter>
          </fieldset>
        </form>
      </SheetContent>
    </Sheet>
  )
}

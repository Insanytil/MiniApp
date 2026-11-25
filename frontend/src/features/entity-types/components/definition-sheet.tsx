import { useEffect, useId, useState } from 'react'
import { useForm, useStore } from '@tanstack/react-form'
import { LoaderCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
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
  fieldKinds,
} from '../configuration'
import type {
  ConfiguredEntityType,
  DefinitionItem,
  DefinitionKind,
  DisplayProfile,
  FieldKind,
} from '../configuration'
import {
  definitionFromDraft,
  definitionKindLabels,
  existingRelationOf,
  initialDraft,
  technicalNameTaken,
} from '../definition-draft'
import type { DefinitionDraft } from '../definition-draft'
import { toTechnicalName } from '../entity-types'
import { ChoiceOptionsEditor } from './choice-options-editor'
import { DisplayProfileFields } from './display-profile-fields'
import { LabeledCheckbox } from './profile-field-selection'
import { RelationDefinitionFields } from './relation-definition-fields'
import { ViewColumnsEditor } from './view-columns-editor'

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
  const existingRelation = existingRelationOf(kind, item)
  const form = useForm({
    defaultValues: { draft: initialDraft(kind, type, item) },
    onSubmit: async ({ value }) => {
      const definition = definitionFromDraft(
        kind,
        value.draft,
        item?.id ?? crypto.randomUUID(),
        existingRelation,
      )
      const problem = definitionError(kind, definition)
      if (problem) {
        setError(problem)
        return
      }
      if (
        (kind === 'fields' || kind === 'relations') &&
        'technical_name' in definition &&
        technicalNameTaken(type, definition)
      ) {
        setError('Cet identifiant est déjà utilisé sur ce type.')
        return
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
            {item ? 'Modifier' : 'Ajouter'} : {definitionKindLabels[kind]}
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
                const update = (patch: Partial<DefinitionDraft>) => {
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
                      <ChoiceOptionsEditor draft={draft} update={update} />
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
                      <RelationDefinitionFields
                        id={id}
                        draft={draft}
                        update={update}
                        type={type}
                        catalog={catalog}
                        existingRelation={existingRelation}
                      />
                    )}
                    {kind === 'display_profiles' && (
                      <DisplayProfileFields
                        id={id}
                        draft={draft}
                        update={update}
                        type={type}
                      />
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

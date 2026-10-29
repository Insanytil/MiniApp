import { useEffect, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, X } from 'lucide-react'
import { ApiError } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { AsyncCombobox } from '@/components/inputs/async-combobox'
import type { AsyncOption } from '@/components/inputs/async-combobox'
import { DraftProtection } from '@/components/draft-protection'
import { toast } from '@/components/ui/toast'
import {
  buildRecordPayload,
  createRecord,
  updateRecord,
  createRecordError,
  creationSchemaQuery,
  initialDraft,
  recordOptions,
  recordRootKey,
  relationKey,
} from '../creation'
import type {
  CreationRelation,
  CreationSchema,
  CreateRecordPayload,
} from '../creation'
import type { FieldDefinition } from '@/features/entity-types/configuration'
import { recordsKey } from '../records'
import { RecordImage } from './record-cell'

export function RecordCreateSheet({
  organizationId,
  entityTypeId,
  recordId,
  onClose,
  onCreated,
}: {
  organizationId: string
  entityTypeId: string
  recordId?: string
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const client = useQueryClient()
  const query = useQuery(
    creationSchemaQuery(organizationId, entityTypeId, recordId),
  )
  const [busy, setBusy] = useState(false)
  const [generation, setGeneration] = useState(0)
  const reload = async () => {
    await client.fetchQuery({
      ...creationSchemaQuery(organizationId, entityTypeId, recordId),
      staleTime: 0,
    })
    setGeneration((value) => value + 1)
  }
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <SheetContent
        showCloseButton={!busy}
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
      >
        <SheetHeader className="shrink-0 border-b p-6 pr-14">
          <SheetTitle>
            {recordId ? 'Modifier l’enregistrement' : 'Créer un enregistrement'}
          </SheetTitle>
          <SheetDescription>
            {query.data?.name ?? 'Chargement du formulaire…'}
          </SheetDescription>
        </SheetHeader>
        {query.isPending ? (
          <p role="status" className="p-6">
            Chargement…
          </p>
        ) : query.isError && !query.data ? (
          <div className="p-6">
            <Alert variant="destructive">
              <AlertDescription>
                {createRecordError(query.error)}{' '}
                <Button variant="outline" onClick={() => void query.refetch()}>
                  Réessayer
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <CreateForm
            key={generation}
            organizationId={organizationId}
            typeId={entityTypeId}
            schema={query.data}
            onClose={onClose}
            onCreated={onCreated}
            onReload={reload}
            onBusyChange={setBusy}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
function CreateForm({
  organizationId,
  typeId,
  schema,
  onClose,
  onCreated,
  onReload,
  onBusyChange,
}: {
  organizationId: string
  typeId: string
  schema: CreationSchema
  onClose: () => void
  onCreated: (id: string) => void
  onReload: () => Promise<void>
  onBusyChange: (value: boolean) => void
}) {
  // Keep the schema captured at opening, so a background refresh never replaces user input.
  const [snapshot] = useState(schema)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [reloading, setReloading] = useState(false)
  const [reloadBusy, setReloadBusy] = useState(false)
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: (payload: CreateRecordPayload) =>
      snapshot.record_id
        ? updateRecord(organizationId, typeId, snapshot.record_id, payload)
        : createRecord(organizationId, typeId, payload),
    retry: false,
    onSuccess: async (result) => {
      await client.invalidateQueries({
        queryKey: recordRootKey(organizationId),
      })
      toast.add({
        title: snapshot.record_id
          ? 'Enregistrement modifié'
          : 'Enregistrement créé',
        description: snapshot.name,
        type: 'success',
      })
      onCreated(result.id)
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409)
        void client.invalidateQueries({
          queryKey: recordRootKey(organizationId),
        })
    },
  })
  const pending = mutation.isPending || reloadBusy
  useEffect(() => {
    onBusyChange(pending)
    return () => onBusyChange(false)
  }, [pending, onBusyChange])
  const form = useForm({
    defaultValues: initialDraft(snapshot),
    onSubmit: async ({ value }) => {
      const result = buildRecordPayload(snapshot, value)
      setErrors(result.errors)
      if (Object.keys(result.errors).length) return
      try {
        await mutation.mutateAsync(result.payload)
      } catch {
        /* Keep all entered values on failure. */
      }
    },
  })
  const errorFor = (identity: string) =>
    errors[identity] ??
    (mutation.error instanceof ApiError
      ? mutation.error.issues.find((issue) => issue.field === identity)?.message
      : undefined)
  const edited = (identity: string) => {
    setErrors((previous) => {
      const next = { ...previous }
      delete next[identity]
      return next
    })
    if (!(
      mutation.error instanceof ApiError &&
      mutation.error.status === 409 &&
      ['Record schema version conflict', 'Record version conflict'].includes(
        mutation.error.detail ?? '',
      )
    ))
      mutation.reset()
  }
  const versionConflict =
    mutation.error instanceof ApiError &&
    mutation.error.status === 409 &&
    ['Record schema version conflict', 'Record version conflict'].includes(
      mutation.error.detail ?? '',
    )
  return (
    <>
      <form
        noValidate
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault()
          if (!pending && !versionConflict) void form.handleSubmit()
        }}
      >
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
          {snapshot.fields.map((field) => (
            <form.Field key={field.id} name={`values.${field.id}` as const}>
              {(entry) => (
                <ScalarInput
                  field={field}
                  value={entry.state.value}
                  error={errorFor(field.id)}
                  disabled={pending}
                  onBlur={entry.handleBlur}
                  onChange={(value) => {
                    entry.handleChange(value)
                    edited(field.id)
                  }}
                />
              )}
            </form.Field>
          ))}
          {snapshot.relations.map((relation) => {
            const identity = relationKey(relation)
            return (
              <form.Field
                key={identity}
                name={`relations.${identity}` as const}
              >
                {(entry) => (
                  <RelationInput
                    organizationId={organizationId}
                    typeId={typeId}
                    recordId={snapshot.record_id}
                    limit={Math.max(
                      100,
                      snapshot.selections?.[identity]?.length ?? 0,
                    )}
                    relation={relation}
                    value={entry.state.value}
                    error={errorFor(identity)}
                    disabled={pending}
                    onBlur={entry.handleBlur}
                    onChange={(value) => {
                      entry.handleChange(value)
                      edited(identity)
                    }}
                  />
                )}
              </form.Field>
            )
          })}
          {!snapshot.fields.length && !snapshot.relations.length && (
            <p className="text-sm text-muted-foreground">
              Ce type ne possède pas de champ personnalisé. Vous pouvez créer un
              enregistrement avec ses champs système.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            L’identifiant, les dates et l’auteur sont renseignés
            automatiquement.
          </p>
          {Object.keys(errors).length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                Vérifiez les champs signalés avant de créer l’enregistrement.
              </AlertDescription>
            </Alert>
          )}
          {mutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {createRecordError(mutation.error)}
                {versionConflict && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => setReloading(true)}
                  >
                    Recharger le formulaire
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>
        <SheetFooter className="mt-0 shrink-0 border-t bg-muted/30 px-6 py-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            Annuler
          </Button>
          <Button type="submit" disabled={pending || versionConflict}>
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            {pending
              ? 'Enregistrement…'
              : snapshot.record_id
                ? 'Enregistrer les modifications'
                : 'Créer l’enregistrement'}
          </Button>
        </SheetFooter>
        <form.Subscribe selector={(state) => state.isDirty}>
          {(dirty) => (
            <DraftProtection
              dirty={dirty}
              busy={pending}
              description="Les valeurs saisies pour cet enregistrement seront abandonnées."
            />
          )}
        </form.Subscribe>
      </form>
      <AlertDialog
        open={reloading}
        onOpenChange={(open) => {
          if (!reloadBusy) setReloading(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recharger le formulaire ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les valeurs saisies seront abandonnées pour charger la
              configuration actuelle.
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
                  await onReload()
                } catch (error) {
                  toast.add({
                    title: 'Rechargement impossible',
                    description: createRecordError(error),
                    type: 'error',
                  })
                  setReloadBusy(false)
                }
              }}
            >
              Recharger
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
export function ScalarInput({
  inputId,
  compact = false,
  field,
  value,
  error,
  disabled,
  onChange,
  onBlur,
}: {
  inputId?: string
  compact?: boolean
  field: FieldDefinition
  value: string
  error?: string
  disabled: boolean
  onChange: (value: string) => void
  onBlur: () => void
}) {
  const id = inputId ?? `new-record-${field.id}`
  const describedBy = error
    ? `${id}-error`
    : field.kind === 'image'
      ? `${id}-hint`
      : undefined
  const common = {
    id,
    disabled,
    value,
    onBlur,
    'aria-invalid': !!error,
    'aria-describedby': describedBy,
  }
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className={compact ? 'sr-only' : undefined}>
        {field.name}
        {field.required && (
          <span className="text-muted-foreground"> (obligatoire)</span>
        )}
      </Label>
      {field.kind === 'boolean' ? (
        <NativeSelect
          {...common}
          className="w-full"
          onChange={(event) => onChange(event.target.value)}
        >
          <NativeSelectOption value="">Non renseigné</NativeSelectOption>
          <NativeSelectOption value="true">Oui</NativeSelectOption>
          <NativeSelectOption value="false">Non</NativeSelectOption>
        </NativeSelect>
      ) : field.kind === 'text' ? (
        <Textarea
          {...common}
          rows={compact ? 1 : 2}
          className={compact ? 'min-h-9' : undefined}
          maxLength={10000}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          {...common}
          inputMode={
            field.kind === 'integer'
              ? 'numeric'
              : field.kind === 'decimal'
                ? 'decimal'
                : undefined
          }
          type={
            field.kind === 'integer' || field.kind === 'decimal'
              ? 'text'
              : field.kind === 'datetime'
                ? 'datetime-local'
                : field.kind === 'date'
                  ? 'date'
                  : field.kind === 'email'
                    ? 'email'
                    : 'text'
          }
          step={
            field.kind === 'decimal'
              ? 'any'
              : field.kind === 'integer'
                ? '1'
                : undefined
          }
          maxLength={
            field.kind === 'email'
              ? 320
              : field.kind === 'image'
                ? 2048
                : undefined
          }
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {field.kind === 'image' && (
        <div className="space-y-3">
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            URL HTTPS ou chemin d’une image de l’application.
          </p>
          {value.trim() && <RecordImage url={value.trim()} variant="detail" />}
        </div>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
export function RelationInput({
  inputId,
  compact = false,
  organizationId,
  typeId,
  recordId,
  limit,
  relation,
  value,
  error,
  disabled,
  onChange,
  onBlur,
}: {
  organizationId: string
  typeId: string
  recordId?: string
  inputId?: string
  compact?: boolean
  limit: number
  relation: CreationRelation
  value: AsyncOption[]
  error?: string
  disabled: boolean
  onChange: (value: AsyncOption[]) => void
  onBlur: () => void
}) {
  const id = inputId ?? `new-record-${relation.id}-${relation.direction}`
  const selectedIds = value.map((item) => item.value)
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className={compact ? 'sr-only' : undefined}>
        {relation.name}
        {relation.required && (
          <span className="text-muted-foreground"> (obligatoire)</span>
        )}
      </Label>
      <AsyncCombobox
        key={relation.many ? selectedIds.join('|') : 'single'}
        id={id}
        value={relation.many ? null : (value[0] ?? null)}
        disabled={disabled || (relation.many && value.length >= limit)}
        invalid={!!error}
        describedBy={error ? `${id}-error` : `${id}-hint`}
        onBlur={onBlur}
        queryKey={[
          ...recordsKey(organizationId, typeId),
          'record-options',
          recordId ?? null,
          relation.id,
          relation.direction,
          relation.many ? selectedIds : [],
        ]}
        loadOptions={async (search, signal) => {
          const result = await recordOptions(
            organizationId,
            typeId,
            relation,
            search,
            signal,
            recordId,
          )
          return {
            ...result,
            items: result.items.map((item) => ({
              ...item,
              disabled: relation.many && selectedIds.includes(item.value),
            })),
          }
        }}
        onChange={(option) =>
          onChange(
            relation.many
              ? option
                ? [...value, option]
                : value
              : option
                ? [option]
                : [],
          )
        }
        placeholder="Rechercher un enregistrement…"
        emptyMessage="Aucun enregistrement disponible. Créez d’abord un élément lié ou affinez la recherche."
      />
      {relation.many && value.length > 0 && (
        <ul className="space-y-1">
          {value.map((item) => (
            <li
              key={item.value}
              className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1"
            >
              <span
                className="min-w-0 flex-1 truncate text-sm"
                title={item.label}
              >
                {item.label}
              </span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={disabled}
                aria-label={`Retirer ${item.label}`}
                onClick={() =>
                  onChange(
                    value.filter((selected) => selected.value !== item.value),
                  )
                }
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p
        id={`${id}-hint`}
        className={compact ? 'sr-only' : 'text-xs text-muted-foreground'}
      >
        {relation.many
          ? 'Plusieurs éléments peuvent être sélectionnés.'
          : 'Un seul élément peut être sélectionné.'}{' '}
        Les éléments déjà affectés sont exclus si la relation l’exige.
      </p>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

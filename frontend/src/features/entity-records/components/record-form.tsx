import { useEffect, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DraftProtection } from '@/components/draft-protection'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { SheetFooter } from '@/components/ui/sheet'
import { toast } from '@/components/ui/toast'
import { ApiError } from '@/lib/api/client'
import {
  buildRecordPayload,
  createRecord,
  createRecordError,
  initialDraft,
  recordRootKey,
  relationKey,
  updateRecord,
} from '../creation'
import type { CreateRecordPayload, CreationSchema } from '../creation'
import { RelationInput } from './relation-input'
import { ScalarInput } from './scalar-input'

const versionConflictDetails = [
  'Record schema version conflict',
  'Record version conflict',
]

/** The record or its type changed since the form was opened. */
const isVersionConflict = (error: unknown) =>
  error instanceof ApiError &&
  error.status === 409 &&
  versionConflictDetails.includes(error.detail ?? '')

export function RecordForm({
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
  const reload = async () => {
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
  }
  const [uploadingFields, setUploadingFields] = useState<string[]>([])
  const pending = mutation.isPending || reloadBusy || uploadingFields.length > 0
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
  const versionConflict = isVersionConflict(mutation.error)
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
    // A version conflict stays visible until the form is reloaded.
    if (!versionConflict) mutation.reset()
  }
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
                  organizationId={organizationId}
                  onUploadBusy={(busy) =>
                    setUploadingFields((previous) =>
                      busy
                        ? [...new Set([...previous, field.id])]
                        : previous.filter((id) => id !== field.id),
                    )
                  }
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
      <ConfirmDialog
        open={reloading}
        onOpenChange={(open) => {
          if (!reloadBusy) setReloading(open)
        }}
        title="Recharger le formulaire ?"
        description="Les valeurs saisies seront abandonnées pour charger la configuration actuelle."
        confirmLabel="Recharger"
        disabled={reloadBusy}
        onConfirm={reload}
      />
    </>
  )
}

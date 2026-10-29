import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { toast } from '@/components/ui/toast'
import {
  entityTypeError,
  entityTypeSchema,
  toTechnicalName,
} from '../entity-types'
import type { EntityType } from '../entity-types'
import { useSaveEntityType } from '../mutations'

export function EntityTypeFormSheet({
  organizationId,
  entityType,
  onClose,
}: {
  organizationId: string
  entityType?: EntityType
  onClose: () => void
}) {
  const mutation = useSaveEntityType(organizationId)
  const [identifierEdited, setIdentifierEdited] = useState(!!entityType)
  const form = useForm({
    defaultValues: {
      name: entityType?.name ?? '',
      technical_name: entityType?.technical_name ?? '',
      description: entityType?.description ?? '',
    },
    validators: { onChange: entityTypeSchema, onSubmit: entityTypeSchema },
    onSubmit: async ({ value }) => {
      try {
        const saved = await mutation.mutateAsync({
          values: value,
          id: entityType?.id,
        })
        toast.add({
          title: entityType ? 'Type d’entité modifié' : 'Type d’entité créé',
          description: saved.name,
          type: 'success',
        })
        onClose()
      } catch {
        /* Keep the drawer open with its error and values. */
      }
    },
  })
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose()
      }}
    >
      <SheetContent
        showCloseButton={!mutation.isPending}
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
      >
        <SheetHeader className="shrink-0 border-b p-6 pr-14">
          <SheetTitle>
            {entityType
              ? 'Modifier le type d’entité'
              : 'Créer un type d’entité'}
          </SheetTitle>
          <SheetDescription>
            Définissez le nom, l’identifiant technique et la description.
          </SheetDescription>
        </SheetHeader>
        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            if (!mutation.isPending) void form.handleSubmit()
          }}
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
            <form.Field name="name">
              {(field) => {
                const invalid =
                  field.state.meta.isTouched &&
                  field.state.meta.errors.length > 0
                return (
                  <Field data-invalid={invalid}>
                    <FieldLabel htmlFor="entity-type-name">
                      Nom affiché
                    </FieldLabel>
                    <Input
                      id="entity-type-name"
                      autoFocus
                      autoComplete="off"
                      maxLength={255}
                      value={field.state.value}
                      disabled={mutation.isPending}
                      onBlur={field.handleBlur}
                      onChange={(event) => {
                        field.handleChange(event.target.value)
                        if (!identifierEdited)
                          form.setFieldValue(
                            'technical_name',
                            toTechnicalName(event.target.value),
                          )
                        mutation.reset()
                      }}
                      aria-invalid={invalid}
                      aria-describedby={
                        invalid ? 'entity-type-name-error' : undefined
                      }
                    />
                    <FieldError
                      id="entity-type-name-error"
                      errors={invalid ? field.state.meta.errors : []}
                    />
                  </Field>
                )
              }}
            </form.Field>
            <form.Field name="technical_name">
              {(field) => {
                const invalid =
                  field.state.meta.isTouched &&
                  field.state.meta.errors.length > 0
                return (
                  <Field data-invalid={invalid}>
                    <FieldLabel htmlFor="entity-type-identifier">
                      Identifiant technique
                    </FieldLabel>
                    <Input
                      id="entity-type-identifier"
                      maxLength={100}
                      spellCheck={false}
                      autoCapitalize="none"
                      autoComplete="off"
                      className="font-mono"
                      value={field.state.value}
                      readOnly={!!entityType}
                      disabled={mutation.isPending}
                      onBlur={field.handleBlur}
                      onChange={(event) => {
                        setIdentifierEdited(true)
                        field.handleChange(event.target.value)
                        mutation.reset()
                      }}
                      aria-invalid={invalid}
                      aria-describedby={`entity-type-identifier-hint${invalid ? ' entity-type-identifier-error' : ''}`}
                    />
                    <p
                      id="entity-type-identifier-hint"
                      className="text-xs text-muted-foreground"
                    >
                      {entityType
                        ? 'L’identifiant technique ne peut plus être modifié.'
                        : 'Exemple : client ou project_task. Unique dans l’organisation et immuable après création.'}
                    </p>
                    <FieldError
                      id="entity-type-identifier-error"
                      errors={invalid ? field.state.meta.errors : []}
                    />
                  </Field>
                )
              }}
            </form.Field>
            <form.Field name="description">
              {(field) => {
                const invalid =
                  field.state.meta.isTouched &&
                  field.state.meta.errors.length > 0
                return (
                  <Field data-invalid={invalid}>
                    <FieldLabel htmlFor="entity-type-description">
                      Description (facultative)
                    </FieldLabel>
                    <Textarea
                      id="entity-type-description"
                      maxLength={2000}
                      rows={4}
                      value={field.state.value}
                      disabled={mutation.isPending}
                      onBlur={field.handleBlur}
                      onChange={(event) => {
                        field.handleChange(event.target.value)
                        mutation.reset()
                      }}
                      aria-invalid={invalid}
                      aria-describedby={
                        invalid ? 'entity-type-description-error' : undefined
                      }
                    />
                    <FieldError
                      id="entity-type-description-error"
                      errors={invalid ? field.state.meta.errors : []}
                    />
                  </Field>
                )
              }}
            </form.Field>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Les champs système id, created_at, updated_at, created_by et
              updated_by sont implicites. Les champs personnalisés, relations et
              affichages se règlent depuis « Configurer ».
            </p>
            {mutation.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {entityTypeError(mutation.error)}
                </AlertDescription>
              </Alert>
            )}
          </div>
          <SheetFooter className="mt-0 shrink-0 border-t bg-muted/30 px-6 py-4 sm:flex-row sm:justify-end [&>button]:w-full sm:[&>button]:w-auto">
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={onClose}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              {mutation.isPending
                ? 'Enregistrement…'
                : entityType
                  ? 'Enregistrer'
                  : 'Créer le type d’entité'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

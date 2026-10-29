import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import {
  organizationError,
  organizationSchema,
  toSlug,
  useSaveOrganization,
} from '../organizations'
import type { Organization } from '../organizations'

export function OrganizationFormSheet({
  organization,
  onClose,
  onSaved,
}: {
  organization?: Organization
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const save = useSaveOrganization()
  const [slugEdited, setSlugEdited] = useState(!!organization)
  const form = useForm({
    defaultValues: {
      name: organization?.name ?? '',
      slug: organization?.slug ?? '',
    },
    validators: { onChange: organizationSchema, onSubmit: organizationSchema },
    onSubmit: async ({ value }) => {
      try {
        const saved = await save.mutateAsync({
          id: organization?.id,
          values: value,
        })
        onSaved(
          organization
            ? `L’organisation « ${saved.name} » a été modifiée.`
            : `L’organisation « ${saved.name} » a été créée.`,
        )
        onClose()
      } catch {
        /* The mutation error is rendered inside the drawer. */
      }
    },
  })
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose()
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={!save.isPending}
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
      >
        <SheetHeader className="shrink-0 border-b px-6 py-6 pr-14">
          <SheetTitle>
            {organization
              ? 'Modifier l’organisation'
              : 'Créer une organisation'}
          </SheetTitle>
          <SheetDescription>
            Renseignez le nom et l’identifiant de l’organisation.
          </SheetDescription>
        </SheetHeader>
        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            if (!save.isPending) void form.handleSubmit()
          }}
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6">
            <form.Field name="name">
              {(field) => {
                const invalid =
                  field.state.meta.isTouched &&
                  field.state.meta.errors.length > 0
                return (
                  <Field data-invalid={invalid}>
                    <FieldLabel htmlFor="organization-name">Nom</FieldLabel>
                    <Input
                      id="organization-name"
                      autoComplete="organization"
                      autoFocus
                      value={field.state.value}
                      maxLength={255}
                      disabled={save.isPending}
                      onBlur={field.handleBlur}
                      onChange={(event) => {
                        field.handleChange(event.target.value)
                        if (!slugEdited)
                          form.setFieldValue('slug', toSlug(event.target.value))
                        save.reset()
                      }}
                      aria-invalid={invalid}
                      aria-describedby={
                        invalid ? 'organization-name-error' : undefined
                      }
                    />
                    <FieldError
                      id="organization-name-error"
                      errors={invalid ? field.state.meta.errors : []}
                    />
                  </Field>
                )
              }}
            </form.Field>
            <form.Field name="slug">
              {(field) => {
                const invalid =
                  field.state.meta.isTouched &&
                  field.state.meta.errors.length > 0
                return (
                  <Field data-invalid={invalid}>
                    <FieldLabel htmlFor="organization-slug">
                      Identifiant
                    </FieldLabel>
                    <Input
                      id="organization-slug"
                      value={field.state.value}
                      maxLength={100}
                      spellCheck={false}
                      autoCapitalize="none"
                      disabled={save.isPending}
                      onBlur={field.handleBlur}
                      onChange={(event) => {
                        setSlugEdited(true)
                        field.handleChange(event.target.value)
                        save.reset()
                      }}
                      aria-invalid={invalid}
                      aria-describedby={`organization-slug-hint${invalid ? ' organization-slug-error' : ''}`}
                    />
                    <p
                      id="organization-slug-hint"
                      className="text-xs text-muted-foreground"
                    >
                      Exemple : mon-organisation. Cet identifiant doit être
                      unique.
                    </p>
                    <FieldError
                      id="organization-slug-error"
                      errors={invalid ? field.state.meta.errors : []}
                    />
                  </Field>
                )
              }}
            </form.Field>
            {save.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {organizationError(save.error, 'save')}
                </AlertDescription>
              </Alert>
            )}
          </div>
          <SheetFooter className="mt-0 shrink-0 border-t bg-muted/30 px-6 py-4 sm:flex-row sm:justify-end [&>button]:w-full sm:[&>button]:w-auto">
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={onClose}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              {save.isPending
                ? 'Enregistrement…'
                : organization
                  ? 'Enregistrer'
                  : 'Créer l’organisation'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

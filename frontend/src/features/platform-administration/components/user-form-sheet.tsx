import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { LoaderCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useCreateUser, userError, userSchema } from '../users'
import type { UserInput } from '../users'
import { searchOrganizationOptions } from '../organizations'
import { AsyncCombobox } from '@/components/inputs/async-combobox'
import type { AsyncOption } from '@/components/inputs/async-combobox'

export function UserFormSheet({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: (message: string, type?: 'success' | 'warning') => void
}) {
  const mutation = useCreateUser()
  const [selected, setSelected] = useState<AsyncOption | null>(null)
  const form = useForm({
    defaultValues: {
      email: '',
      organizationId: '',
      role: 'organization_user',
    } as UserInput,
    validators: { onChange: userSchema, onSubmit: userSchema },
    onSubmit: async ({ value }) => {
      try {
        const result = await mutation.mutateAsync(value)
        onSaved(
          result.invitation_queued
            ? `Le compte ${result.user.email} a été créé. L’invitation a été mise en file d’envoi.`
            : `Le compte ${result.user.email} a été créé, mais l’invitation n’a pas pu être programmée. Vérifiez le service d’envoi.`,
          result.invitation_queued ? 'success' : 'warning',
        )
        onClose()
      } catch {
        /* Render the mutation error without closing the form. */
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
        side="right"
        showCloseButton={!mutation.isPending}
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
      >
        <SheetHeader className="shrink-0 border-b px-6 py-6 pr-14">
          <SheetTitle>Créer un utilisateur</SheetTitle>
          <SheetDescription>
            Un lien d’activation sera envoyé pour définir son mot de passe.
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
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6">
            <form.Field name="email">
              {(field) => {
                const invalid =
                  field.state.meta.isTouched &&
                  field.state.meta.errors.length > 0
                return (
                  <Field data-invalid={invalid}>
                    <FieldLabel htmlFor="user-email">Adresse e-mail</FieldLabel>
                    <Input
                      id="user-email"
                      type="email"
                      autoFocus
                      autoComplete="off"
                      value={field.state.value}
                      maxLength={320}
                      disabled={mutation.isPending}
                      onChange={(event) => {
                        field.handleChange(event.target.value)
                        mutation.reset()
                      }}
                      onBlur={field.handleBlur}
                      aria-invalid={invalid}
                      aria-describedby={
                        invalid ? 'user-email-error' : undefined
                      }
                    />
                    <FieldError
                      id="user-email-error"
                      errors={invalid ? field.state.meta.errors : []}
                    />
                  </Field>
                )
              }}
            </form.Field>
            <form.Field name="organizationId">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="user-organization">
                    Organisation (facultatif)
                  </FieldLabel>
                  <AsyncCombobox
                    id="user-organization"
                    value={selected}
                    onChange={(option) => {
                      setSelected(option)
                      field.handleChange(option?.value ?? '')
                    }}
                    onBlur={field.handleBlur}
                    queryKey={['platform', 'organizations', 'autocomplete']}
                    loadOptions={searchOrganizationOptions}
                    placeholder="Rechercher une organisation…"
                    emptyMessage="Aucune organisation active trouvée."
                    disabled={mutation.isPending}
                    describedBy="user-organization-hint"
                  />
                  <p
                    id="user-organization-hint"
                    className="text-xs text-muted-foreground"
                  >
                    Sélectionnez une proposition pour associer une organisation,
                    ou laissez le champ vide.
                  </p>
                </Field>
              )}
            </form.Field>
            <form.Subscribe selector={(state) => state.values.organizationId}>
              {(organizationId) =>
                organizationId ? (
                  <form.Field name="role">
                    {(field) => (
                      <Field>
                        <FieldLabel htmlFor="user-role">
                          Rôle dans l’organisation
                        </FieldLabel>
                        <NativeSelect
                          id="user-role"
                          className="w-full [&_select]:h-10"
                          value={field.state.value}
                          disabled={mutation.isPending}
                          onChange={(event) =>
                            field.handleChange(
                              event.target.value as UserInput['role'],
                            )
                          }
                        >
                          <NativeSelectOption value="organization_user">
                            Utilisateur
                          </NativeSelectOption>
                          <NativeSelectOption value="organization_admin">
                            Administrateur
                          </NativeSelectOption>
                        </NativeSelect>
                      </Field>
                    )}
                  </form.Field>
                ) : null
              }
            </form.Subscribe>
            {mutation.isError && (
              <Alert variant="destructive">
                <AlertDescription>{userError(mutation.error)}</AlertDescription>
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
              {mutation.isPending ? 'Création…' : 'Créer l’utilisateur'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

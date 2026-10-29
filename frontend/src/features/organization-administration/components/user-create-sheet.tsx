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
import { toast } from '@/components/ui/toast'
import type { UserOrganization } from '@/features/auth'
import { organizationUserError, organizationUserSchema } from '../users'
import type { OrganizationUserInput } from '../users'
import { useCreateOrganizationUser } from '../mutations'

export function OrganizationUserCreateSheet({
  organization,
  onClose,
}: {
  organization: UserOrganization
  onClose: () => void
}) {
  const mutation = useCreateOrganizationUser(organization.id)
  const form = useForm({
    defaultValues: {
      email: '',
      role: 'organization_user',
    } as OrganizationUserInput,
    validators: {
      onChange: organizationUserSchema,
      onSubmit: organizationUserSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        const result = await mutation.mutateAsync(value)
        toast.add({
          title: 'Utilisateur créé',
          description: `${result.user.email} · ${result.invitation_queued ? 'Invitation mise en file d’envoi.' : 'L’invitation n’a pas pu être mise en file. Contactez un administrateur de la plateforme.'}`,
          type: result.invitation_queued ? 'success' : 'warning',
          timeout: result.invitation_queued ? 4500 : 0,
        })
        onClose()
      } catch {
        /* Keep the form and display the server error. */
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
        <SheetHeader className="shrink-0 border-b px-6 py-6 pr-14">
          <SheetTitle>Créer un utilisateur</SheetTitle>
          <SheetDescription>
            Le compte sera lié à {organization.name}. Un lien d’activation lui
            permettra de définir son mot de passe.
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
            <form.Field name="email">
              {(field) => {
                const invalid =
                  field.state.meta.isTouched &&
                  field.state.meta.errors.length > 0
                return (
                  <Field data-invalid={invalid}>
                    <FieldLabel htmlFor="organization-user-email">
                      Adresse e-mail
                    </FieldLabel>
                    <Input
                      id="organization-user-email"
                      type="email"
                      autoFocus
                      autoComplete="off"
                      maxLength={320}
                      disabled={mutation.isPending}
                      value={field.state.value}
                      onChange={(event) => {
                        field.handleChange(event.target.value)
                        mutation.reset()
                      }}
                      onBlur={field.handleBlur}
                      aria-invalid={invalid}
                      aria-describedby={
                        invalid ? 'organization-user-email-error' : undefined
                      }
                    />
                    <FieldError
                      id="organization-user-email-error"
                      errors={invalid ? field.state.meta.errors : []}
                    />
                  </Field>
                )
              }}
            </form.Field>
            <form.Field name="role">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="organization-user-role">
                    Rôle dans l’organisation
                  </FieldLabel>
                  <NativeSelect
                    id="organization-user-role"
                    className="w-full [&_select]:h-10"
                    value={field.state.value}
                    disabled={mutation.isPending}
                    onChange={(event) =>
                      field.handleChange(
                        event.target.value as OrganizationUserInput['role'],
                      )
                    }
                    onBlur={field.handleBlur}
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
            {mutation.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {organizationUserError(mutation.error, 'create')}
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
              {mutation.isPending ? 'Création…' : 'Créer l’utilisateur'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

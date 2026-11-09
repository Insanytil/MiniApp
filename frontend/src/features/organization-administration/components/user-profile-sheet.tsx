import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { toast } from '@/components/ui/toast'
import { errorMessage } from '@/lib/api/client'
import { recordRootKey } from '@/features/entity-records/creation'
import {
  organizationUserProfileSchema,
  organizationUsersKey,
  updateOrganizationUserProfile,
} from '../users'
import type { OrganizationUser, OrganizationUserProfileInput } from '../users'

export function OrganizationUserProfileSheet({
  user,
  organizationId,
  organizationName,
  onClose,
}: {
  user: OrganizationUser
  organizationId: string
  organizationName: string
  onClose: () => void
}) {
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: (value: OrganizationUserProfileInput) =>
      updateOrganizationUserProfile(organizationId, user.id, value),
    retry: false,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: organizationUsersKey(organizationId),
        }),
        client.invalidateQueries({ queryKey: recordRootKey(organizationId) }),
      ])
      toast.add({
        title: 'Profil enregistré',
        description: user.email,
        type: 'success',
      })
      onClose()
    },
  })
  const form = useForm({
    defaultValues: { first_name: user.first_name, last_name: user.last_name },
    validators: {
      onChange: organizationUserProfileSchema,
      onSubmit: organizationUserProfileSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync(value)
      } catch {
        /* Keep values on failure. */
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
          <SheetTitle>Profil dans l’organisation</SheetTitle>
          <SheetDescription>
            {user.email} · {organizationName}
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
            {(['first_name', 'last_name'] as const).map((name) => (
              <form.Field key={name} name={name}>
                {(field) => {
                  const invalid =
                    field.state.meta.isTouched &&
                    field.state.meta.errors.length > 0
                  return (
                    <Field data-invalid={invalid}>
                      <FieldLabel htmlFor={`profile-${name}`}>
                        {name === 'first_name' ? 'Prénom' : 'Nom'}
                      </FieldLabel>
                      <Input
                        id={`profile-${name}`}
                        autoComplete={
                          name === 'first_name' ? 'given-name' : 'family-name'
                        }
                        value={field.state.value}
                        maxLength={100}
                        disabled={mutation.isPending}
                        onBlur={field.handleBlur}
                        onChange={(event) => {
                          field.handleChange(event.target.value)
                          mutation.reset()
                        }}
                        aria-invalid={invalid}
                        aria-describedby={
                          invalid ? `profile-${name}-error` : undefined
                        }
                      />
                      <FieldError
                        id={`profile-${name}-error`}
                        errors={invalid ? field.state.meta.errors : []}
                      />
                    </Field>
                  )
                }}
              </form.Field>
            ))}
            <p className="text-sm text-muted-foreground">
              Ces informations sont propres à cette organisation. Si aucun nom
              n’est renseigné, l’adresse e-mail sera affichée.
            </p>
            {mutation.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {errorMessage(mutation.error)}
                </AlertDescription>
              </Alert>
            )}
          </div>
          <SheetFooter className="mt-0 shrink-0 border-t p-6 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={onClose}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <LoaderCircle className="animate-spin" />}
              Enregistrer
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

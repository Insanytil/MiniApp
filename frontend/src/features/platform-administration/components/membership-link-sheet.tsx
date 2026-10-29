import { useCallback, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { LoaderCircle } from 'lucide-react'
import { AsyncCombobox } from '@/components/inputs/async-combobox'
import type { AsyncOption } from '@/components/inputs/async-combobox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
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
import { searchOrganizationOptions } from '../organizations'
import type { Organization } from '../organizations'
import { searchUsersForOrganization } from '../users'
import type { PlatformUser } from '../users'
import {
  membershipLinkError,
  useAddOrganizationMember,
} from '../use-add-organization-member'
import type { MembershipRole } from '../user-memberships'

type Props = { onClose: () => void } & (
  | { organization: Organization; user?: never }
  | { user: PlatformUser; organization?: never }
)
const schema = z.object({
  targetId: z.string().min(1, 'Sélectionnez une proposition dans la liste.'),
  role: z.enum(['organization_user', 'organization_admin']),
})

export function MembershipLinkSheet({ user, organization, onClose }: Props) {
  const mutation = useAddOrganizationMember()
  const [selected, setSelected] = useState<AsyncOption | null>(null)
  const form = useForm({
    defaultValues: {
      targetId: '',
      role: 'organization_user' as MembershipRole,
    },
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: async ({ value }) => {
      if (!selected || selected.disabled) return
      try {
        await mutation.mutateAsync({
          user: user
            ? { id: user.id, email: user.email }
            : { id: value.targetId, email: selected.label },
          organization: organization
            ? { id: organization.id, name: organization.name }
            : { id: value.targetId, name: selected.label },
          role: value.role,
        })
        onClose()
      } catch {
        /* Keep the selection and show the error in the drawer. */
      }
    },
  })
  const loadOptions = useCallback(
    async (search: string, signal: AbortSignal) => {
      if (organization)
        return searchUsersForOrganization(organization.id, search, signal)
      const result = await searchOrganizationOptions(search, signal, false)
      return {
        ...result,
        items: result.items.map((option) => {
          const membership = user.memberships.find(
            (item) => item.organization_id === option.value,
          )
          return {
            ...option,
            disabled: !!membership,
            description: membership
              ? `Déjà liée · ${membership.is_active ? 'accès actif' : 'accès désactivé'}`
              : option.description,
          }
        }),
      }
    },
    [organization, user],
  )

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
          <SheetTitle>
            {organization ? 'Ajouter un membre' : 'Lier à une organisation'}
          </SheetTitle>
          <SheetDescription>
            {organization
              ? 'Sélectionnez un utilisateur existant et son rôle dans cette organisation.'
              : 'Sélectionnez une organisation existante et le rôle de cet utilisateur.'}
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
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-6">
            <div className="space-y-1 rounded-lg bg-muted/60 px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {organization ? 'Organisation' : 'Utilisateur'}
              </p>
              <p className="font-medium break-words">
                {organization?.name ?? user?.email}
              </p>
            </div>
            {organization && !organization.is_active && (
              <Alert>
                <AlertDescription>
                  L’organisation est suspendue. Le membre sera ajouté, mais ne
                  pourra y accéder qu’après sa réactivation.
                </AlertDescription>
              </Alert>
            )}
            {user && (!user.is_active || !user.is_verified) && (
              <Alert>
                <AlertDescription>
                  {!user.is_active
                    ? 'Le compte est suspendu. L’association ne réactive pas le compte.'
                    : 'Le compte doit encore être activé par e-mail avant de pouvoir se connecter.'}
                </AlertDescription>
              </Alert>
            )}
            <form.Field name="targetId">
              {(field) => {
                const invalid =
                  field.state.meta.isTouched &&
                  field.state.meta.errors.length > 0
                return (
                  <Field data-invalid={invalid}>
                    <FieldLabel htmlFor="membership-target">
                      {organization ? 'Utilisateur' : 'Organisation'}
                    </FieldLabel>
                    <AsyncCombobox
                      id="membership-target"
                      value={selected}
                      onChange={(option) => {
                        setSelected(option)
                        field.handleChange(option?.value ?? '')
                        mutation.reset()
                      }}
                      onBlur={field.handleBlur}
                      queryKey={
                        organization
                          ? [
                              'platform',
                              'users',
                              'membership-options',
                              organization.id,
                            ]
                          : [
                              'platform',
                              'organizations',
                              'membership-options',
                              user.id,
                            ]
                      }
                      loadOptions={loadOptions}
                      placeholder={
                        organization
                          ? 'Rechercher un utilisateur par e-mail…'
                          : 'Rechercher une organisation…'
                      }
                      maxLength={organization ? 320 : 255}
                      emptyMessage={
                        organization
                          ? 'Aucun utilisateur trouvé.'
                          : 'Aucune organisation trouvée.'
                      }
                      disabled={mutation.isPending}
                      invalid={invalid}
                      describedBy={`membership-target-hint${invalid ? ' membership-target-error' : ''}`}
                    />
                    <p
                      id="membership-target-hint"
                      className="text-xs text-muted-foreground"
                    >
                      Les associations existantes sont indiquées et ne peuvent
                      pas être ajoutées une seconde fois.
                    </p>
                    <FieldError
                      id="membership-target-error"
                      errors={invalid ? field.state.meta.errors : []}
                    />
                  </Field>
                )
              }}
            </form.Field>
            <form.Field name="role">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="membership-role">
                    Rôle dans l’organisation
                  </FieldLabel>
                  <NativeSelect
                    id="membership-role"
                    className="w-full [&_select]:h-10"
                    disabled={mutation.isPending}
                    value={field.state.value}
                    onChange={(event) =>
                      field.handleChange(event.target.value as MembershipRole)
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
            {mutation.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {membershipLinkError(mutation.error)}
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
                : organization
                  ? 'Ajouter le membre'
                  : 'Lier l’organisation'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

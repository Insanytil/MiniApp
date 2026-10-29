import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { CircleCheck, KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { PasswordInput } from '@/components/inputs/password-input'
import {
  acceptPasswordLink,
  isExpiredPasswordLink,
  isValidPasswordToken,
  passwordFormSchema,
  passwordLinkError,
  passwordLinkQuery,
} from '../password-links'
import type { PasswordLinkKind } from '../password-links'
import { clearSession, sessionKey } from '../session'
import type { CurrentUser } from '../session'

export function PasswordLinkPage({
  kind,
  token,
}: {
  kind: PasswordLinkKind
  token: string | undefined
}) {
  const client = useQueryClient()
  const [completedEmail, setCompletedEmail] = useState<string | null>(null)
  const [returnToHome, setReturnToHome] = useState(false)
  const options = passwordLinkQuery(kind, token)
  const link = useQuery({
    ...options,
    enabled: isValidPasswordToken(token) && !completedEmail,
  })
  const mutation = useMutation({
    mutationFn: (password: string) =>
      acceptPasswordLink(kind, token ?? '', password),
    retry: false,
    gcTime: 0,
  })
  const form = useForm({
    defaultValues: { password: '', confirmation: '' },
    validators: { onChange: passwordFormSchema, onSubmit: passwordFormSchema },
    onSubmit: async ({ value }) => {
      if (!link.data || mutation.isPending || completedEmail) return
      try {
        await mutation.mutateAsync(value.password)
      } catch {
        return
      }
      const email = link.data.email
      const user = client.getQueryData<CurrentUser | null>(sessionKey)
      const resetsCurrentUser =
        kind === 'reset' && user?.email.toLowerCase() === email.toLowerCase()
      setReturnToHome(!!user && !resetsCurrentUser)
      setCompletedEmail(email)
      form.reset()
      mutation.reset()
      // Only this account's sessions are revoked by a reset. Keep a different
      // signed-in account intact when its owner follows somebody else's link.
      if (resetsCurrentUser) {
        await clearSession(client)
      } else if (user?.email.toLowerCase() === email.toLowerCase()) {
        client.removeQueries({ queryKey: sessionKey })
      }
      client.removeQueries({ queryKey: options.queryKey, exact: true })
    },
  })

  const activation = kind === 'activation'
  const invalid =
    !isValidPasswordToken(token) ||
    isExpiredPasswordLink(link.error) ||
    isExpiredPasswordLink(mutation.error)
  const title = completedEmail
    ? activation
      ? 'Votre compte est activé'
      : 'Mot de passe mis à jour'
    : invalid
      ? 'Ce lien ne peut pas être utilisé'
      : activation
        ? 'Activez votre compte'
        : 'Réinitialisez votre mot de passe'

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 px-5 py-10 sm:px-8">
      <section
        aria-labelledby="password-link-title"
        className="w-full max-w-md"
      >
        <h1 className="mb-8 text-center text-3xl font-semibold tracking-tight">
          MiniApp
        </h1>
        <Card className="gap-6 rounded-2xl py-6 shadow-sm sm:py-8">
          <CardHeader className="gap-3 px-5 sm:px-8">
            <div className="mb-1 flex size-10 items-center justify-center rounded-xl bg-muted">
              {completedEmail ? (
                <CircleCheck className="size-5" aria-hidden="true" />
              ) : activation ? (
                <ShieldCheck className="size-5" aria-hidden="true" />
              ) : (
                <KeyRound className="size-5" aria-hidden="true" />
              )}
            </div>
            <CardTitle>
              <h2
                id="password-link-title"
                className="text-xl font-semibold tracking-tight"
              >
                {title}
              </h2>
            </CardTitle>
            <CardDescription>
              {completedEmail ? (
                <span>
                  Votre mot de passe a été enregistré pour{' '}
                  <strong className="break-all font-medium text-foreground">
                    {completedEmail}
                  </strong>
                  .
                </span>
              ) : invalid ? (
                'Demandez un nouveau lien à votre administrateur.'
              ) : activation ? (
                'Définissez votre mot de passe pour vérifier votre adresse e-mail et activer votre compte.'
              ) : (
                'Choisissez un nouveau mot de passe pour votre compte.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-5 sm:px-8">
            {completedEmail ? (
              <div className="space-y-5" role="status">
                <p className="text-sm text-muted-foreground">
                  {activation
                    ? 'Vous pouvez maintenant vous connecter à votre espace.'
                    : 'Vos anciennes sessions ont été déconnectées. Utilisez votre nouveau mot de passe pour vous reconnecter.'}
                </p>
                <Link
                  to={returnToHome ? '/home' : '/login'}
                  replace
                  className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {returnToHome ? 'Retour à mon espace' : 'Se connecter'}
                </Link>
              </div>
            ) : invalid ? (
              <div className="space-y-5">
                <Alert variant="destructive">
                  <AlertDescription>
                    {!token
                      ? 'Le lien ne contient pas de jeton. Ouvrez le lien complet reçu par e-mail.'
                      : 'Ce lien est invalide, a expiré ou a déjà été utilisé.'}
                  </AlertDescription>
                </Alert>
                <LoginLink />
              </div>
            ) : link.isPending ? (
              <div
                className="flex items-center gap-3 py-5 text-sm text-muted-foreground"
                role="status"
              >
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
                Vérification de votre lien…
              </div>
            ) : link.isError ? (
              <div className="space-y-4">
                <Alert variant="destructive">
                  <AlertDescription>
                    {passwordLinkError(link.error)}
                  </AlertDescription>
                </Alert>
                <Button
                  variant="outline"
                  disabled={link.isFetching}
                  onClick={() => void link.refetch()}
                >
                  Réessayer
                </Button>
                <LoginLink />
              </div>
            ) : (
              <form
                noValidate
                className="space-y-5"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!mutation.isPending) void form.handleSubmit()
                }}
              >
                <p className="break-all rounded-lg bg-muted/60 px-3 py-2 text-sm">
                  {link.data?.email}
                </p>
                <form.Field name="password">
                  {(field) => {
                    const invalidField =
                      field.state.meta.isTouched &&
                      field.state.meta.errors.length > 0
                    return (
                      <Field data-invalid={invalidField}>
                        <FieldLabel htmlFor="new-password">
                          Nouveau mot de passe
                        </FieldLabel>
                        <PasswordInput
                          id="new-password"
                          name={field.name}
                          value={field.state.value}
                          autoComplete="new-password"
                          autoCapitalize="none"
                          spellCheck={false}
                          maxLength={2048}
                          disabled={mutation.isPending}
                          onChange={(event) => {
                            field.handleChange(event.target.value)
                            mutation.reset()
                          }}
                          onBlur={field.handleBlur}
                          aria-invalid={invalidField}
                          aria-describedby={`password-hint${invalidField ? ' password-error' : ''}`}
                        />
                        <p
                          id="password-hint"
                          className="text-xs text-muted-foreground"
                        >
                          Au moins 15 caractères. Vous pouvez utiliser une
                          phrase de passe.
                        </p>
                        <FieldError
                          id="password-error"
                          errors={invalidField ? field.state.meta.errors : []}
                        />
                      </Field>
                    )
                  }}
                </form.Field>
                <form.Field name="confirmation">
                  {(field) => {
                    const invalidField =
                      field.state.meta.isTouched &&
                      field.state.meta.errors.length > 0
                    return (
                      <Field data-invalid={invalidField}>
                        <FieldLabel htmlFor="confirm-password">
                          Confirmer le mot de passe
                        </FieldLabel>
                        <PasswordInput
                          id="confirm-password"
                          name={field.name}
                          value={field.state.value}
                          autoComplete="new-password"
                          autoCapitalize="none"
                          spellCheck={false}
                          maxLength={2048}
                          disabled={mutation.isPending}
                          onChange={(event) => {
                            field.handleChange(event.target.value)
                            mutation.reset()
                          }}
                          onBlur={field.handleBlur}
                          aria-invalid={invalidField}
                          aria-describedby={
                            invalidField ? 'confirmation-error' : undefined
                          }
                        />
                        <FieldError
                          id="confirmation-error"
                          errors={invalidField ? field.state.meta.errors : []}
                        />
                      </Field>
                    )
                  }}
                </form.Field>
                {mutation.isError && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {passwordLinkError(mutation.error)}
                    </AlertDescription>
                  </Alert>
                )}
                <form.Subscribe selector={(state) => state.isSubmitting}>
                  {(submitting) => (
                    <Button
                      type="submit"
                      className="h-11 w-full"
                      disabled={mutation.isPending || submitting}
                    >
                      {(mutation.isPending || submitting) && (
                        <LoaderCircle
                          className="size-4 animate-spin"
                          aria-hidden="true"
                        />
                      )}
                      {mutation.isPending || submitting
                        ? 'Enregistrement…'
                        : activation
                          ? 'Activer mon compte'
                          : 'Enregistrer le mot de passe'}
                    </Button>
                  )}
                </form.Subscribe>
                <LoginLink />
              </form>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  )
}

function LoginLink() {
  return (
    <Link
      to="/login"
      replace
      className="block text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      Retour à la connexion
    </Link>
  )
}

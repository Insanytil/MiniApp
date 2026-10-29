import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

import { useLogin } from '../mutations'
import { errorMessage } from '@/lib/api/client'

const emailSchema = z.email('Saisissez une adresse e-mail valide.')

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false)
  const login = useLogin()
  const form = useForm({
    defaultValues: { email: '', password: '' },
    onSubmit: async ({ value }) => {
      try {
        await login.mutateAsync({
          email: value.email.trim(),
          password: value.password,
        })
      } catch {
        // The mutation exposes the error below; never log credentials.
      }
    },
  })

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        login.reset()
        void form.handleSubmit()
      }}
    >
      <form.Field
        name="email"
        validators={{
          onBlur: ({ value }) =>
            emailSchema.safeParse(value).error?.issues[0]?.message,
          onSubmit: ({ value }) =>
            emailSchema.safeParse(value).error?.issues[0]?.message,
        }}
      >
        {(field) => {
          const invalid = field.state.meta.errors.length > 0
          return (
            <div className="space-y-2.5">
              <Label htmlFor="email">Adresse e-mail</Label>
              <Input
                id="email"
                name={field.name}
                type="email"
                autoComplete="username"
                placeholder="vous@organisation.com"
                className="h-12 rounded-xl bg-background px-4"
                value={field.state.value}
                onChange={(event) => {
                  field.handleChange(event.target.value)
                  login.reset()
                }}
                onBlur={field.handleBlur}
                aria-invalid={invalid}
                aria-describedby={invalid ? 'email-error' : undefined}
                disabled={login.isPending}
                required
              />
              {invalid && (
                <p
                  id="email-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {field.state.meta.errors.join(' ')}
                </p>
              )}
            </div>
          )
        }}
      </form.Field>

      <form.Field
        name="password"
        validators={{
          onBlur: ({ value }) =>
            !value ? 'Saisissez votre mot de passe.' : undefined,
          onSubmit: ({ value }) =>
            !value ? 'Saisissez votre mot de passe.' : undefined,
        }}
      >
        {(field) => {
          const invalid = field.state.meta.errors.length > 0
          return (
            <div className="space-y-2.5">
              <Label htmlFor="password">Mot de passe</Label>
              <div className="relative">
                <Input
                  id="password"
                  name={field.name}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Votre mot de passe"
                  className="h-12 rounded-xl bg-background pr-12 pl-4"
                  value={field.state.value}
                  onChange={(event) => {
                    field.handleChange(event.target.value)
                    login.reset()
                  }}
                  onBlur={field.handleBlur}
                  aria-invalid={invalid}
                  aria-describedby={invalid ? 'password-error' : undefined}
                  disabled={login.isPending}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 text-muted-foreground"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={
                    showPassword
                      ? 'Masquer le mot de passe'
                      : 'Afficher le mot de passe'
                  }
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
              {invalid && (
                <p
                  id="password-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {field.state.meta.errors.join(' ')}
                </p>
              )}
            </div>
          )
        }}
      </form.Field>

      {login.isError && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(login.error)}</AlertDescription>
        </Alert>
      )}

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button
            type="submit"
            disabled={isSubmitting || login.isPending}
            className="h-12 w-full rounded-xl text-sm"
          >
            {(isSubmitting || login.isPending) && (
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
            )}
            {isSubmitting || login.isPending ? 'Connexion…' : 'Se connecter'}
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}

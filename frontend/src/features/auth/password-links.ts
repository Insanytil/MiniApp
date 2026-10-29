import { queryOptions } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '@/lib/api'
import { ApiError } from '@/lib/api/client'

export type PasswordLinkKind = 'activation' | 'reset'
export interface PasswordLinkInfo {
  email: string
  expires_at: string
}

const endpoints: Record<PasswordLinkKind, string> = {
  activation: '/auth/invitations',
  reset: '/auth/password-resets',
}

export function parsePasswordLinkSearch(search: Record<string, unknown>) {
  return { token: typeof search.token === 'string' ? search.token : undefined }
}

export function isValidPasswordToken(
  token: string | undefined,
): token is string {
  return !!token && /^[A-Za-z0-9_-]{20,256}$/.test(token)
}

export const passwordFormSchema = z
  .object({
    password: z
      .string()
      .refine(
        (password) => Array.from(password).length >= 15,
        'Utilisez au moins 15 caractères.',
      )
      .refine(
        (password) => Array.from(password).length <= 1024,
        'Utilisez au maximum 1024 caractères.',
      ),
    confirmation: z.string().min(1, 'Confirmez votre mot de passe.'),
  })
  .refine((values) => values.password === values.confirmation, {
    message: 'Les mots de passe ne correspondent pas.',
    path: ['confirmation'],
  })

export function passwordLinkQuery(
  kind: PasswordLinkKind,
  token: string | undefined,
) {
  return queryOptions({
    queryKey: ['auth', 'password-link', kind, token],
    queryFn: ({ signal }) => {
      if (!isValidPasswordToken(token))
        throw new Error('Ce lien est incomplet ou invalide.')
      return api.request<PasswordLinkInfo>(
        `${endpoints[kind]}/${encodeURIComponent(token)}`,
        { signal, authenticated: false },
      )
    },
    enabled: isValidPasswordToken(token),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

export function acceptPasswordLink(
  kind: PasswordLinkKind,
  token: string,
  password: string,
) {
  if (!isValidPasswordToken(token))
    throw new Error('Ce lien est incomplet ou invalide.')
  return api.request<void>(`${endpoints[kind]}/accept`, {
    method: 'POST',
    body: { token, password },
    authenticated: false,
  })
}

export function isExpiredPasswordLink(error: unknown) {
  return error instanceof ApiError && error.status === 404
}

export function passwordLinkError(error: unknown) {
  if (isExpiredPasswordLink(error))
    return 'Ce lien a expiré, a déjà été utilisé ou n’est plus valide.'
  if (error instanceof ApiError && error.status === 422)
    return 'Le mot de passe n’a pas été accepté. Vérifiez qu’il contient entre 15 et 1024 caractères.'
  return error instanceof Error
    ? error.message
    : 'L’opération a échoué. Veuillez réessayer.'
}

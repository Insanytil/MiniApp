import { api } from '@/lib/api'
import { ApiError } from '@/lib/api/client'

export type UserEmailAction = 'verification' | 'password-reset'

export const userEmailActions = {
  verification: {
    label: 'Renvoyer le mail d’activation',
    pending: 'Préparation de l’invitation…',
    queued: 'Invitation programmée',
    endpoint: 'verification-email',
  },
  'password-reset': {
    label: 'Envoyer un lien de réinitialisation de mot de passe',
    pending: 'Préparation du lien de réinitialisation…',
    queued: 'Lien de réinitialisation programmé',
    endpoint: 'password-reset-email',
  },
} as const

export function userEmailActionFor(user: {
  is_verified: boolean
}): UserEmailAction {
  return user.is_verified ? 'password-reset' : 'verification'
}

export function sendUserEmail(userId: string, action: UserEmailAction) {
  return api.request<{ queued: boolean }>(
    `/platform/users/${encodeURIComponent(userId)}/${userEmailActions[action].endpoint}`,
    { method: 'POST' },
  )
}

export function userEmailError(error: unknown, action: UserEmailAction) {
  if (error instanceof ApiError && error.status === 409) {
    return action === 'verification'
      ? 'Ce compte est déjà activé.'
      : 'Ce compte doit d’abord être activé avant de demander une réinitialisation.'
  }
  if (error instanceof ApiError && error.status === 404)
    return 'Ce compte n’existe plus. La liste va être actualisée.'
  return error instanceof Error
    ? error.message
    : 'La demande d’envoi a échoué. Veuillez réessayer.'
}

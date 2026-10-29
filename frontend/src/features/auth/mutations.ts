import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { api } from '@/lib/api'
import { ApiError } from '@/lib/api/client'
import { clearSession, refreshSession } from './session'

export function useLogin() {
  const client = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      try {
        await api.request<void>('/auth/login', {
          method: 'POST',
          body: credentials,
          authenticated: false,
        })
      } catch (error) {
        if (error instanceof ApiError && error.status === 401)
          throw new Error(
            'Adresse e-mail ou mot de passe incorrect, ou compte non activé.',
          )
        throw error
      }
      await clearSession(client)
      const user = await refreshSession(client)
      if (!user)
        throw new Error(
          'La session n’a pas pu être ouverte. Veuillez réessayer.',
        )
      return user
    },
    onSuccess: async () => {
      await router.invalidate()
      await router.navigate({ to: '/home', replace: true })
    },
  })
}

export function useLogout() {
  const client = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: async () => {
      try {
        await api.request<void>('/auth/logout', {
          method: 'POST',
          authenticated: false,
        })
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) throw error
      }
      await clearSession(client)
    },
    onSuccess: async () => {
      await router.navigate({ to: '/login', replace: true })
      await router.invalidate()
    },
  })
}

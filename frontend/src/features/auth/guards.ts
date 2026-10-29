import { redirect } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { sessionQuery } from './session'
import { api } from '@/lib/api'
import {
  readOrganizationSelection,
  resolveOrganization,
} from '@/features/organizations/selection'

export async function requireAuthentication(queryClient: QueryClient) {
  const user = await queryClient.ensureQueryData(sessionQuery)
  if (!user) throw redirect({ to: '/login', replace: true })
  const organization = resolveOrganization(
    user,
    readOrganizationSelection(user.id),
  )
  api.setOrganization(organization?.id ?? null)
  return { user }
}

export async function requireGuest(queryClient: QueryClient) {
  const user = await queryClient.ensureQueryData(sessionQuery)
  if (user) throw redirect({ to: '/home', replace: true })
}

export async function requirePlatformAdmin(queryClient: QueryClient) {
  const { user } = await requireAuthentication(queryClient)
  if (!user.is_superuser) throw redirect({ to: '/home', replace: true })
  return { user }
}

export async function requireOrganizationAdmin(queryClient: QueryClient) {
  const { user } = await requireAuthentication(queryClient)
  const organization = resolveOrganization(
    user,
    readOrganizationSelection(user.id),
  )
  if (user.is_superuser || organization?.role !== 'organization_admin')
    throw redirect({ to: '/home', replace: true })
  return { user, organization }
}

export async function requireOrganizationMember(queryClient: QueryClient) {
  const { user } = await requireAuthentication(queryClient)
  const organization = resolveOrganization(
    user,
    readOrganizationSelection(user.id),
  )
  if (!organization) throw redirect({ to: '/home', replace: true })
  return { user, organization }
}

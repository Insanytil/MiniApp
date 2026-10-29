import type { CurrentUser } from '@/features/auth/session'

const storageKey = 'miniapp.active-organization'

export function readOrganizationSelection(userId: string): string | null {
  try {
    const stored: unknown = JSON.parse(
      sessionStorage.getItem(storageKey) ?? 'null',
    )
    if (
      stored &&
      typeof stored === 'object' &&
      'userId' in stored &&
      stored.userId === userId &&
      'organizationId' in stored &&
      typeof stored.organizationId === 'string'
    )
      return stored.organizationId
  } catch {
    /* Storage can be unavailable in private browsing. */
  }
  return null
}

export function saveOrganizationSelection(
  userId: string,
  organizationId: string | null,
) {
  try {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({ userId, organizationId }),
    )
  } catch {
    /* Selection remains available in memory. */
  }
}

export function clearOrganizationSelection() {
  try {
    sessionStorage.removeItem(storageKey)
  } catch {
    /* Storage is optional. */
  }
}

export function resolveOrganization(
  user: CurrentUser,
  selectedId: string | null,
) {
  return (
    user.organizations.find((organization) => organization.id === selectedId) ??
    user.organizations.find(
      (organization) => organization.id === user.default_organization_id,
    ) ??
    user.organizations[0] ??
    null
  )
}

// Use this prefix for all organization data; the ID is mandatory in cache keys.
export function organizationQueryKey(
  organizationId: string,
  ...parts: readonly unknown[]
) {
  return ['organizations', organizationId, ...parts] as const
}

import { api } from '@/lib/api'

export function setUserOrganizationAccess(
  userId: string,
  organizationId: string,
  isActive: boolean,
) {
  return api.request<void>(
    `/platform/users/${encodeURIComponent(userId)}/organizations/${encodeURIComponent(organizationId)}`,
    { method: 'PATCH', body: { is_active: isActive } },
  )
}

export type MembershipRole = 'organization_admin' | 'organization_user'

export function addOrganizationMember(
  organizationId: string,
  userId: string,
  role: MembershipRole,
) {
  return api.request<void>(
    `/platform/organizations/${encodeURIComponent(organizationId)}/members`,
    { method: 'POST', body: { user_id: userId, role } },
  )
}

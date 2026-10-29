import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { listSearchParams } from '@/components/data-table/server-pagination'
import type {
  ListParams,
  PageResponse,
} from '@/components/data-table/server-pagination'
import { organizationKeys } from './organizations'

export interface OrganizationMember {
  user_id: string
  email: string
  user_is_active: boolean
  user_is_verified: boolean
  is_superuser: boolean
  role: 'organization_admin' | 'organization_user'
  membership_is_active: boolean
}
export const organizationMembersQuery = (id: string, params: ListParams) =>
  queryOptions({
    queryKey: [...organizationKeys, id, 'members', params],
    queryFn: ({ signal }) =>
      api.request<PageResponse<OrganizationMember>>(
        `/platform/organizations/${encodeURIComponent(id)}/members?${listSearchParams(params)}`,
        { signal },
      ),
    staleTime: 0,
  })

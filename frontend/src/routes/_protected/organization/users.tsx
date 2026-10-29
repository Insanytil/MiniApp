import { createFileRoute } from '@tanstack/react-router'
import { OrganizationUsersPage } from '@/features/organization-administration/components/users-page'

export const Route = createFileRoute('/_protected/organization/users')({
  component: OrganizationUsersPage,
})

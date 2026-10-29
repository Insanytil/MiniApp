import { createFileRoute } from '@tanstack/react-router'
import { OrganizationsPage } from '@/features/platform-administration/components/organizations-page'

export const Route = createFileRoute('/_protected/platform/organizations')({
  component: OrganizationsPage,
})

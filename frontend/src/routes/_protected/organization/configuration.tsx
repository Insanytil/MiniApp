import { createFileRoute } from '@tanstack/react-router'
import { OrganizationConfigurationPage } from '@/features/organization-administration/components/configuration-page'

export const Route = createFileRoute('/_protected/organization/configuration')({
  component: OrganizationConfigurationPage,
})

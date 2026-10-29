import { createFileRoute } from '@tanstack/react-router'
import { OrganizationNavigationPage } from '@/features/organization-navigation/components/navigation-page'

export const Route = createFileRoute('/_protected/organization/navigation')({
  component: OrganizationNavigationPage,
})

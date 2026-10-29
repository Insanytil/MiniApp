import { createFileRoute } from '@tanstack/react-router'
import { OrganizationJobsPage } from '@/features/organization-administration/components/jobs-page'

export const Route = createFileRoute('/_protected/organization/jobs')({
  component: OrganizationJobsPage,
})

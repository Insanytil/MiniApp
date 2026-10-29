import { useAuth } from '@/features/auth'
import { JobsPage } from '@/features/platform-administration/components/jobs-page'

export function OrganizationJobsPage() {
  const { organization } = useAuth()
  return organization ? (
    <JobsPage key={organization.id} organization={organization} />
  ) : null
}

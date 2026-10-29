import { createFileRoute } from '@tanstack/react-router'
import { JobsPage } from '@/features/platform-administration/components/jobs-page'

export const Route = createFileRoute('/_protected/platform/jobs')({
  component: JobsPage,
})

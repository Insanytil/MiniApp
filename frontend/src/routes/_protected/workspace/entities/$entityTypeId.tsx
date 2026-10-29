import { createFileRoute } from '@tanstack/react-router'
import { EntityRecordsPage } from '@/features/entity-records/components/records-page'

export const Route = createFileRoute(
  '/_protected/workspace/entities/$entityTypeId',
)({ component: RecordsRoute })
function RecordsRoute() {
  const { entityTypeId } = Route.useParams()
  return <EntityRecordsPage entityTypeId={entityTypeId} />
}

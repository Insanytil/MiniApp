import { createFileRoute } from '@tanstack/react-router'
import { EntityConfigurationPage } from '@/features/entity-types/components/entity-configuration-page'

export const Route = createFileRoute(
  '/_protected/organization/entity-types/$entityTypeId',
)({ component: ConfigurationRoute })
function ConfigurationRoute() {
  const { entityTypeId } = Route.useParams()
  return <EntityConfigurationPage entityTypeId={entityTypeId} />
}

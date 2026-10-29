from sqlalchemy import select

from app.models.entity_type import EntityType
from app.models.organization import Organization
from app.modules.organization_navigation.rules import (
    NavigationConflictError, resolve_navigation, supported_navigation, validate_navigation,
)


class OrganizationNavigationService:
    def __init__(self, db):
        self.db = db

    async def get_menu(self, organization_id):
        organization = await self.db.scalar(select(Organization).where(Organization.id == organization_id))
        types = list((await self.db.execute(select(EntityType.id, EntityType.name, EntityType.technical_name)
                     .where(EntityType.organization_id == organization_id).order_by(EntityType.name, EntityType.id))).all())
        names = {str(item.id): item.name for item in types}
        document = {**organization.navigation, 'nodes': supported_navigation(organization.navigation['nodes'])}
        return {
            'version': organization.navigation_version,
            'document': document,
            'resolved_nodes': resolve_navigation(document['nodes'], names),
            'entity_types': [{'id': item.id, 'name': item.name, 'technical_name': item.technical_name} for item in types],
        }

    async def save_menu(self, organization_id, actor_id, payload):
        # Refresh the identity map after obtaining the lock: authentication may
        # already have loaded this Organization before another writer committed.
        organization = await self.db.scalar(select(Organization).where(Organization.id == organization_id)
                                             .with_for_update().execution_options(populate_existing=True))
        if organization.navigation_version != payload.expected_version:
            raise NavigationConflictError()
        type_ids = set((await self.db.scalars(select(EntityType.id).where(EntityType.organization_id == organization_id))).all())
        document = payload.document.model_dump(mode='json')
        validate_navigation(document['nodes'], {str(identity) for identity in type_ids})
        organization.navigation = document
        organization.navigation_version += 1
        organization.navigation_updated_by = actor_id
        await self.db.commit()
        return await self.get_menu(organization_id)

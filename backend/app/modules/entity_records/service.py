from app.modules.entity_records.editing import RecordConflictError, validate_replacement
import uuid
from sqlalchemy.exc import IntegrityError
from app.modules.entity_types.configuration_rules import relation_catalog
from app.modules.entity_records.creation import (
    RecordValidationError, RecordSchemaConflictError, creation_relations,
    validate_values, validate_assignments, check_capacity,
)
from app.modules.entity_records.presentation import present_record

from app.modules.entity_types.configuration_rules import all_fields, navigations
from app.modules.entity_types.definitions import EntityTypeNotFoundError
from app.modules.entity_records.presentation import default_view, project_rows, record_values


class EntityRecordNotFoundError(Exception):
    pass


class EntityRecordService:
    def __init__(self, repository):
        self.repository = repository

    async def list_records(self, organization_id, entity_type_id, params):
        catalog = {str(item.id): item for item in await self.repository.catalog(organization_id)}
        entity_type = catalog.get(str(entity_type_id))
        if entity_type is None:
            raise EntityTypeNotFoundError()
        records, total = await self.repository.list_records(organization_id, entity_type_id, params)
        view_id = getattr(params, 'view_id', None)
        view = next((v for v in entity_type.configuration['views'] if v['id'] == str(view_id)), None) if view_id else default_view(entity_type)
        if view is None: raise EntityTypeNotFoundError()
        paths = {(path['id'], path['direction']): path for path in navigations(str(entity_type_id),
                     {identity: item.configuration for identity, item in catalog.items()})}
        needed = {(column['relation_id'], column['direction']) for column in view['columns'] if column['kind'] in ('relation', 'count')}
        groups, related = await self.repository.related_groups(organization_id, [record.id for record in records],
                                                               [paths[key] for key in needed if key in paths])
        return {
            'entity_type': {'id': entity_type.id, 'name': entity_type.name, 'technical_name': entity_type.technical_name},
            'view': {'id': view['id'], 'name': view['name'], 'columns': [{'id': c['id'], 'label': c['label']} for c in view['columns']]},
            'items': project_rows(records, entity_type, view, catalog, paths, groups, related),
            'pagination': {'page': params.page, 'page_size': params.page_size, 'total': total,
                           'total_pages': (total + params.page_size - 1) // params.page_size},
        }

    async def detail(self, organization_id, entity_type_id, record_id):
        types = {item.id: item for item in await self.repository.catalog(organization_id)}
        entity_type = types.get(entity_type_id)
        if entity_type is None:
            raise EntityTypeNotFoundError()
        record = await self.repository.get_record(organization_id, entity_type_id, record_id)
        if record is None:
            raise EntityRecordNotFoundError()
        values = record_values(record)
        return {'id': record.id, 'entity_type_name': entity_type.name,
                'fields': [{**field, 'value': values.get(field['id'])} for field in all_fields(entity_type.id, entity_type.configuration)]}


    async def creation_schema(self, organization_id, entity_type_id):
        catalog = {str(item.id): item for item in await self.repository.catalog(organization_id)}
        entity_type = catalog.get(str(entity_type_id))
        if entity_type is None:
            raise EntityTypeNotFoundError()
        paths = creation_relations(entity_type_id, {identity: item.configuration for identity, item in catalog.items()})
        return {'id': entity_type.id, 'name': entity_type.name, 'configuration_version': entity_type.configuration_version,
                'fields': entity_type.configuration['fields'], 'relations': [
                    {**path, 'target_types': [{'id': target, 'name': catalog[target].name} for target in path['type_ids']]}
                    for path in paths]}

    async def create(self, organization_id, entity_type_id, actor_id, payload):
        # Schema changes, menu changes and record writes share the same org lock.
        await self.repository.lock_writes(organization_id)
        types = await self.repository.catalog(organization_id)
        catalog = {str(item.id): item.configuration for item in types}
        entity_type = next((item for item in types if item.id == entity_type_id), None)
        if entity_type is None:
            raise EntityTypeNotFoundError()
        if entity_type.configuration_version != payload.expected_configuration_version:
            raise RecordSchemaConflictError()
        values = validate_values(entity_type.configuration['fields'], {str(key): value for key, value in payload.values.items()})
        assignments = [item.model_dump(mode='json') for item in payload.relations]
        ids = {uuid.UUID(identity) for assignment in assignments for identity in assignment['record_ids']}
        related = await self.repository.get_records(organization_id, ids)
        record_id = uuid.uuid4()
        edges = validate_assignments(str(entity_type_id), catalog, assignments, related, record_id)
        counts = await self.repository.link_counts(organization_id, edges)
        check_capacity(catalog, edges, counts, record_id)
        try:
            await self.repository.insert_record(organization_id, entity_type_id, actor_id, record_id, values, edges)
            await self.repository.commit()
        except IntegrityError:
            await self.repository.rollback()
            raise RecordValidationError([{'field': None, 'message': 'Un élément lié a changé. Actualisez le formulaire et réessayez.'}]) from None
        except Exception:
            await self.repository.rollback()
            raise
        return {'id': record_id, 'entity_type_id': entity_type_id}

    async def options(self, organization_id, entity_type_id, params):
        catalog = {str(item.id): item for item in await self.repository.catalog(organization_id)}
        if str(entity_type_id) not in catalog:
            raise EntityTypeNotFoundError()
        configurations = {identity: item.configuration for identity, item in catalog.items()}
        path = next((item for item in creation_relations(entity_type_id, configurations)
                     if item['id'] == str(params.relation_id) and item['direction'] == params.direction), None)
        if path is None:
            raise RecordValidationError([{'field': None, 'message': 'Cette relation n’est pas accessible depuis ce type.'}])
        relation = relation_catalog(configurations)[path['id']][1]
        records, total = await self.repository.relation_options(organization_id, path, relation, params)
        return {'items': [present_record(record, catalog[str(record.entity_type_id)]) for record in records],
                'pagination': {'page': params.page, 'page_size': params.page_size, 'total': total,
                               'total_pages': (total + params.page_size - 1) // params.page_size}}

    async def edit_schema(self, organization_id, entity_type_id, record_id):
        # The same lock keeps schema, values, relations and version in one coherent snapshot.
        await self.repository.lock_writes(organization_id)
        schema = await self.creation_schema(organization_id, entity_type_id)
        record = await self.repository.get_record(organization_id, entity_type_id, record_id)
        if record is None:
            raise EntityRecordNotFoundError()
        edges = await self.repository.record_edges(organization_id, record_id)
        ids = {uuid.UUID(identity) for _, source, target in edges for identity in (source, target)}
        related = await self.repository.get_records(organization_id, ids)
        catalog = {str(item.id): item for item in await self.repository.catalog(organization_id)}
        selections = {}
        for path in schema['relations']:
            identities = {target if path['direction'] == 'outgoing' else source for relation, source, target in edges
                if relation == path['id'] and (source if path['direction'] == 'outgoing' else target) == str(record_id)}
            selections[f"relation:{path['id']}:{path['direction']}"] = [
                {'value': identity, 'label': present_record(related[identity], catalog[str(related[identity].entity_type_id)])['title']}
                for identity in sorted(identities) if identity in related]
        return {**schema, 'record_id': record.id, 'updated_at': record.updated_at,
                'values': record.values, 'selections': selections}

    async def update(self, organization_id, entity_type_id, record_id, actor_id, payload):
        await self.repository.lock_writes(organization_id)
        types = await self.repository.catalog(organization_id)
        catalog = {str(item.id): item.configuration for item in types}
        entity_type = next((item for item in types if item.id == entity_type_id), None)
        if entity_type is None:
            raise EntityTypeNotFoundError()
        record = await self.repository.get_record(organization_id, entity_type_id, record_id)
        if record is None:
            raise EntityRecordNotFoundError()
        if entity_type.configuration_version != payload.expected_configuration_version:
            raise RecordSchemaConflictError()
        if record.updated_at != payload.expected_updated_at:
            raise RecordConflictError()
        values = validate_values(entity_type.configuration['fields'], {str(key): value for key, value in payload.values.items()})
        assignments = [item.model_dump(mode='json') for item in payload.relations]
        old_edges = await self.repository.record_edges(organization_id, record_id)
        for assignment in assignments:
            previous = sum(1 for relation, source, target in old_edges if relation == assignment['relation_id']
                and (source if assignment['direction'] == 'outgoing' else target) == str(record_id))
            if len(assignment['record_ids']) > max(100, previous):
                raise RecordValidationError([{'field': f"relation:{assignment['relation_id']}:{assignment['direction']}",
                    'message': '100 sélections maximum ; une collection existante plus grande peut être conservée ou réduite.'}])
        ids = {uuid.UUID(identity) for assignment in assignments for identity in assignment['record_ids']}
        related = await self.repository.get_records(organization_id, ids)
        edges = validate_assignments(str(entity_type_id), catalog, assignments, related, record_id)
        # A self link appears in both directions and must be edited consistently.
        for relation, source, target in edges:
            if source == target == str(record_id):
                selected = {a['direction'] for a in assignments if a['relation_id'] == relation and str(record_id) in a['record_ids']}
                if selected != {'outgoing', 'incoming'}:
                    raise RecordValidationError([{'field': None, 'message': 'Un lien vers cet enregistrement doit être sélectionné dans les deux sens de la relation.'}])
        edges = sorted(set(edges))
        counts = await self.repository.link_counts(organization_id, list(set(old_edges + edges)))
        validate_replacement(catalog, old_edges, edges, counts, record_id)
        try:
            await self.repository.replace_record(organization_id, record, actor_id, values, old_edges, edges)
            await self.repository.commit()
        except IntegrityError:
            await self.repository.rollback()
            raise RecordValidationError([{'field': None, 'message': 'Un élément lié a changé. Rechargez le formulaire et réessayez.'}]) from None
        except Exception:
            await self.repository.rollback()
            raise
        return {'id': record_id, 'entity_type_id': entity_type_id}

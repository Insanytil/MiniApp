"""Entity definition rules and scoped service tests, without DB dependencies."""
import ast
import runpy
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

ROOT = Path(__file__).resolve().parents[1]
definitions = runpy.run_path(str(ROOT / 'app/modules/entity_types/definitions.py'))
rules = runpy.run_path(str(ROOT / 'app/modules/entity_types/configuration_rules.py'))


class Response(SimpleNamespace):
    def model_dump(self):
        return vars(self)


class IntegrityError(Exception):
    def __init__(self, constraint_name):
        self.orig = SimpleNamespace(constraint_name=constraint_name)


source = ROOT / 'app/modules/entity_types/service.py'
service_class = next(node for node in ast.parse(source.read_text()).body if isinstance(node, ast.ClassDef))
namespace = {**definitions, **rules, 'IntegrityError': IntegrityError, 'EntityTypeResponse': Response, 'EntityTypeConfigurationResponse': Response}
exec(compile('from __future__ import annotations\n' + ast.unparse(service_class), str(source), 'exec'), namespace)
Service = namespace['EntityTypeService']


class DefinitionTests(unittest.TestCase):
    def test_names_are_trimmed_and_empty_names_rejected(self):
        self.assertEqual(definitions['normalize_name'](' Client '), 'Client')
        for name in (' ', 'a' * 256):
            with self.assertRaises(ValueError):
                definitions['normalize_name'](name)

    def test_technical_identifiers_use_stable_lowercase_ascii_format(self):
        for value in ('client', 'project_task', 'client2'):
            self.assertEqual(definitions['validate_technical_name'](value), value)
        for value in ('', 'Client', ' client', 'project-task', '1client', 'client_', 'client__task', 'équipe', 'a' * 101):
            with self.assertRaises(ValueError, msg=value):
                definitions['validate_technical_name'](value)

    def test_system_field_definitions_are_fixed(self):
        self.assertEqual(definitions['SYSTEM_FIELD_NAMES'], ('id', 'created_at', 'updated_at', 'created_by', 'updated_by'))


class EntityTypeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.org, self.actor, self.entity_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        self.entity = SimpleNamespace(id=self.entity_id, name='Client', technical_name='client', description=None,
            organization_id=self.org, created_at='created', updated_at='updated', created_by='original', updated_by='original', configuration=rules['empty_configuration'](), configuration_version=1)
        self.repo = SimpleNamespace(get_by_technical_name=AsyncMock(return_value=None),
            get_by_id=AsyncMock(return_value=self.entity), create=AsyncMock(return_value=self.entity),
            list_types=AsyncMock(return_value=([self.entity], 1)), delete=AsyncMock(),
            catalog=AsyncMock(return_value=[self.entity]), lock_configuration=AsyncMock(),
            has_records=AsyncMock(return_value=False), used_in_menu=AsyncMock(return_value=False),
            definition_counts=AsyncMock(return_value={str(self.entity_id): {"fields": 0, "relations": 0}}))
        self.db = SimpleNamespace(commit=AsyncMock(), rollback=AsyncMock(), refresh=AsyncMock())
        self.service = Service(self.db, self.repo)

    async def test_creation_captures_organization_and_actor(self):
        payload = SimpleNamespace(technical_name='client', model_dump=lambda: {'name': 'Client', 'technical_name': 'client', 'description': None})
        response = await self.service.create(organization_id=self.org, actor_id=self.actor, payload=payload)
        self.repo.create.assert_awaited_once_with(organization_id=self.org, created_by=self.actor,
            updated_by=self.actor, name='Client', technical_name='client', description=None)
        self.assertEqual(response.fields_count, 0)
        self.assertEqual(response.relations_count, 0)
        self.assertEqual(response.system_fields, definitions['SYSTEM_FIELD_NAMES'])
        self.db.commit.assert_awaited_once()

    async def test_duplicate_identifier_checks_only_the_authorized_organization(self):
        self.repo.get_by_technical_name.return_value = self.entity
        with self.assertRaises(definitions['EntityTypeAlreadyExistsError']):
            await self.service.create(organization_id=self.org, actor_id=self.actor,
                payload=SimpleNamespace(technical_name='client'))
        self.repo.get_by_technical_name.assert_awaited_once_with(organization_id=self.org, technical_name='client')
        self.repo.create.assert_not_awaited()
        self.db.commit.assert_not_awaited()

    async def test_concurrent_duplicate_creation_rolls_back_and_becomes_conflict(self):
        self.repo.create.side_effect = IntegrityError('uq_entity_types_organization_technical_name')
        with self.assertRaises(definitions['EntityTypeAlreadyExistsError']):
            await self.service.create(organization_id=self.org, actor_id=self.actor,
                payload=SimpleNamespace(technical_name='client', model_dump=lambda: {}))
        self.db.rollback.assert_awaited_once()
        self.db.commit.assert_not_awaited()

    async def test_unrelated_integrity_errors_are_not_misreported_as_duplicates(self):
        self.repo.create.side_effect = IntegrityError('some_other_constraint')
        with self.assertRaises(IntegrityError):
            await self.service.create(organization_id=self.org, actor_id=self.actor,
                payload=SimpleNamespace(technical_name='client', model_dump=lambda: {}))
        self.db.rollback.assert_awaited_once()

    async def test_update_changes_display_information_and_preserves_identifier_and_creator(self):
        result = await self.service.update(organization_id=self.org, actor_id=self.actor,
            entity_type_id=self.entity_id, payload=SimpleNamespace(model_dump=lambda **kw: {
                'name': 'Clients', 'description': 'Customer records', 'technical_name': 'hacked',
                'organization_id': uuid.uuid4(), 'created_by': self.actor,
            }))
        self.repo.get_by_id.assert_awaited_once_with(organization_id=self.org, entity_type_id=self.entity_id)
        self.assertEqual(result.name, 'Clients')
        self.assertEqual(self.entity.technical_name, 'client')
        self.assertEqual(self.entity.created_by, 'original')
        self.assertEqual(self.entity.updated_by, self.actor)
        self.assertEqual(self.entity.organization_id, self.org)

    async def test_noop_update_does_not_change_audit_or_commit(self):
        await self.service.update(organization_id=self.org, actor_id=self.actor,
            entity_type_id=self.entity_id, payload=SimpleNamespace(model_dump=lambda **kw: {'name': 'Client'}))
        self.assertEqual(self.entity.updated_by, 'original')
        self.db.commit.assert_not_awaited()

    async def test_outside_organization_targets_cannot_be_updated_or_deleted(self):
        self.repo.get_by_id.return_value = None
        self.repo.catalog.return_value = []
        with self.assertRaises(definitions['EntityTypeNotFoundError']):
            await self.service.update(organization_id=self.org, actor_id=self.actor,
                entity_type_id=self.entity_id, payload=SimpleNamespace())
        with self.assertRaises(definitions['EntityTypeNotFoundError']):
            await self.service.delete(organization_id=self.org, entity_type_id=self.entity_id)
        self.db.commit.assert_not_awaited()
        self.repo.delete.assert_not_awaited()

    async def test_deletion_and_list_use_scoped_repository(self):
        await self.service.delete(organization_id=self.org, entity_type_id=self.entity_id)
        self.repo.lock_configuration.assert_awaited_once_with(self.org)
        self.repo.catalog.assert_awaited_once_with(self.org)
        items, total = await self.service.list_types(organization_id=self.org,
            params=SimpleNamespace(search='cli', offset=20, page_size=20))
        self.repo.list_types.assert_awaited_once_with(organization_id=self.org, search='cli', offset=20, limit=20)
        self.assertEqual(total, 1)
        self.assertEqual(items[0].technical_name, 'client')
        self.assertFalse(hasattr(items[0], 'organization_id'))

    async def test_stale_configuration_cannot_overwrite_new_version(self):
        payload = SimpleNamespace(expected_version=2)
        with self.assertRaises(rules['ConfigurationConflictError']):
            await self.service.save_configuration(organization_id=self.org, actor_id=self.actor,
                entity_type_id=self.entity_id, payload=payload)
        self.db.commit.assert_not_awaited()

    async def test_configuration_save_records_actor_version_and_payload(self):
        config = rules['empty_configuration']()
        result = await self.service.save_configuration(organization_id=self.org, actor_id=self.actor,
            entity_type_id=self.entity_id, payload=SimpleNamespace(expected_version=1,
                configuration=SimpleNamespace(model_dump=lambda **kw: config)))
        self.assertEqual(result.configuration_version, 2)
        self.assertEqual(self.entity.updated_by, self.actor)
        self.assertEqual(result.configuration, config)
        self.db.commit.assert_awaited_once()

    async def test_configuration_cannot_update_an_outside_organization_type(self):
        self.repo.catalog.return_value = []
        with self.assertRaises(definitions['EntityTypeNotFoundError']):
            await self.service.save_configuration(organization_id=self.org, actor_id=self.actor,
                entity_type_id=self.entity_id, payload=SimpleNamespace(expected_version=1))
        self.db.commit.assert_not_awaited()

    def test_relation_counter_counts_incoming_and_outgoing_self_relations_once(self):
        second = uuid.uuid4()
        self.entity.configuration['relations'] = [
            {'target_type_ids': [str(self.entity.id)]},
            {'target_type_ids': [str(second)]},
        ]
        target = SimpleNamespace(id=second, configuration=rules['empty_configuration']())
        self.assertEqual(Service.relation_counts([self.entity, target]), {str(self.entity.id): 2, str(second): 1})

    async def test_type_used_in_menu_cannot_be_deleted(self):
        self.repo.used_in_menu.return_value = True
        with self.assertRaises(rules['ConfigurationError']):
            await self.service.delete(organization_id=self.org, entity_type_id=self.entity_id)
        self.repo.delete.assert_not_awaited()
        self.db.commit.assert_not_awaited()

    async def test_type_with_records_cannot_be_deleted(self):
        self.repo.has_records.return_value = True
        with self.assertRaises(rules['ConfigurationError']):
            await self.service.delete(organization_id=self.org, entity_type_id=self.entity_id)
        self.repo.delete.assert_not_awaited()

    async def test_required_field_addition_is_blocked_when_records_exist(self):
        self.repo.has_records.return_value = True
        candidate = rules['empty_configuration']()
        candidate['fields'] = [{'id': str(uuid.uuid4()), 'name': 'Name', 'technical_name': 'name', 'kind': 'text', 'required': True}]
        with self.assertRaises(rules['ConfigurationError']):
            await self.service.save_configuration(organization_id=self.org, actor_id=self.actor, entity_type_id=self.entity_id,
                payload=SimpleNamespace(expected_version=1, configuration=SimpleNamespace(model_dump=lambda **kw: candidate)))
        self.db.commit.assert_not_awaited()
        self.assertEqual(self.entity.configuration_version, 1)


if __name__ == '__main__':
    unittest.main()

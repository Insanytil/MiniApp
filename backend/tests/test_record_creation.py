"""Generic write validation and transaction behavior; no infrastructure required."""
import copy
import math
import re
import unittest
import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

from test_navigation_records import ROOT, metadata, presentation, load_definitions, NotFound

creation = load_definitions(ROOT / 'app/modules/entity_records/creation.py', {
    'math': math, 're': re, 'date': date, 'datetime': datetime, 'timezone': timezone,
    'safe_image': presentation['safe_image'], 'relation_catalog': metadata['relation_catalog'],
    'navigations': metadata['navigations'], 'MAX_NUMBER': 9007199254740991,
    'EMAIL': re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$'),
})


class IntegrityError(Exception): pass


services = load_definitions(ROOT / 'app/modules/entity_records/service.py', {
    **metadata, **presentation, **creation, 'uuid': uuid,
    'IntegrityError': IntegrityError, 'EntityTypeNotFoundError': NotFound,
})


def field(kind='text', required=False):
    return {'id': str(uuid.uuid4()), 'name': 'Valeur', 'technical_name': 'value', 'kind': kind, 'required': required}


class ValueTests(unittest.TestCase):
    def test_required_values_and_unknown_or_system_fields_are_rejected(self):
        definition = field(required=True)
        for value in (None, '', '  '):
            with self.assertRaises(creation['RecordValidationError']):
                creation['validate_values']([definition], {definition['id']: value})
        with self.assertRaises(creation['RecordValidationError']):
            creation['validate_values']([], {str(uuid.uuid4()): 'spoofed-system-value'})

    def test_false_and_zero_are_present_values(self):
        for kind, value in [('boolean', False), ('integer', 0), ('decimal', 0)]:
            definition = field(kind, True)
            self.assertEqual(creation['validate_values']([definition], {definition['id']: value}), {definition['id']: value})

    def test_optional_missing_values_are_omitted(self):
        definition = field()
        self.assertEqual(creation['validate_values']([definition], {}), {})
        self.assertEqual(creation['validate_values']([definition], {definition['id']: ' '}), {})

    def test_scalar_types_are_strict(self):
        for kind, invalid in [('text', {'unexpected': 'object'}), ('integer', True), ('integer', 1.2),
                              ('boolean', 'false'), ('decimal', '1.5'), ('decimal', float('nan')),
                              ('decimal', float('inf')), ('decimal', 10 ** 1000), ('integer', 9007199254740992)]:
            with self.assertRaises(ValueError, msg=f'{kind}:{type(invalid)}'):
                creation['field_value'](field(kind), invalid)

    def test_dates_and_timezone_are_validated_and_normalized(self):
        self.assertEqual(creation['field_value'](field('date'), '2024-02-29'), '2024-02-29')
        self.assertEqual(creation['field_value'](field('datetime'), '2024-01-01T12:00:00+02:00'), '2024-01-01T10:00:00+00:00')
        for kind, invalid in [('date', '2023-02-29'), ('date', '01/01/2024'), ('datetime', '2024-01-01T12:00:00')]:
            with self.assertRaises(ValueError): creation['field_value'](field(kind), invalid)

    def test_email_image_and_length_constraints(self):
        self.assertEqual(creation['field_value'](field('email'), ' user@example.com '), 'user@example.com')
        self.assertEqual(creation['field_value'](field('image'), '/images/photo.png'), '/images/photo.png')
        for kind, value in [('email', 'not-an-email'), ('image', 'javascript:alert(1)'), ('text', 'x' * 10001)]:
            with self.assertRaises(ValueError): creation['field_value'](field(kind), value)


class CreationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.org, self.actor, self.type_id, self.person_id = [uuid.uuid4() for _ in range(4)]
        self.definition = field(required=True)
        self.relation_id = str(uuid.uuid4())
        self.relation = {'id': self.relation_id, 'name': 'Personne', 'technical_name': 'person',
            'target_type_ids': [str(self.person_id)], 'inverse_name': 'Véhicules', 'source_max': 1,
            'target_max': None, 'required': True, 'on_delete': 'restrict'}
        config = metadata['empty_configuration']()
        config['fields'] = [self.definition]
        config['relations'] = [self.relation]
        self.type = SimpleNamespace(id=self.type_id, name='Véhicule', configuration_version=1, configuration=config)
        self.person = SimpleNamespace(id=self.person_id, name='Personne', configuration_version=1, configuration=metadata['empty_configuration']())
        self.target = SimpleNamespace(id=uuid.uuid4(), entity_type_id=self.person_id)
        self.events = []
        self.repo = SimpleNamespace(lock_writes=AsyncMock(side_effect=lambda *a: self.events.append('lock')),
            catalog=AsyncMock(return_value=[self.type, self.person]), get_records=AsyncMock(return_value={str(self.target.id): self.target}),
            link_counts=AsyncMock(return_value={}), insert_record=AsyncMock(side_effect=lambda *a: self.events.append('insert')),
            commit=AsyncMock(side_effect=lambda: self.events.append('commit')), rollback=AsyncMock())
        self.service = services['EntityRecordService'](self.repo)
        self.assignment = {'relation_id': self.relation_id, 'direction': 'outgoing', 'record_ids': [str(self.target.id)]}
        self.payload = SimpleNamespace(expected_configuration_version=1, values={uuid.UUID(self.definition['id']): '  Voiture  '},
            relations=[SimpleNamespace(model_dump=lambda **kw: copy.deepcopy(self.assignment))])

    async def test_create_captures_scope_actor_and_creates_record_and_links_in_one_commit(self):
        result = await self.service.create(self.org, self.type_id, self.actor, self.payload)
        self.assertEqual(self.events, ['lock', 'insert', 'commit'])
        args = self.repo.insert_record.await_args.args
        self.assertEqual(args[:3], (self.org, self.type_id, self.actor))
        self.assertEqual(args[3], result['id'])
        self.assertEqual(args[4], {self.definition['id']: 'Voiture'})
        self.assertEqual(args[5], [(self.relation_id, str(result['id']), str(self.target.id))])
        self.repo.catalog.assert_awaited_once_with(self.org)

    async def test_schema_conflict_or_wrong_organization_never_inserts(self):
        self.payload.expected_configuration_version = 2
        with self.assertRaises(creation['RecordSchemaConflictError']):
            await self.service.create(self.org, self.type_id, self.actor, self.payload)
        self.repo.insert_record.assert_not_awaited()
        with self.assertRaises(NotFound):
            await self.service.create(self.org, uuid.uuid4(), self.actor, self.payload)

    async def test_invalid_fields_never_write(self):
        self.payload.values = {}
        with self.assertRaises(creation['RecordValidationError']):
            await self.service.create(self.org, self.type_id, self.actor, self.payload)
        self.repo.insert_record.assert_not_awaited()
        self.repo.commit.assert_not_awaited()

    async def test_required_outgoing_relation_cannot_be_omitted(self):
        self.payload.relations = []
        with self.assertRaises(creation['RecordValidationError']):
            await self.service.create(self.org, self.type_id, self.actor, self.payload)
        self.repo.insert_record.assert_not_awaited()

    async def test_wrong_type_or_outside_organization_target_is_rejected(self):
        self.target.entity_type_id = uuid.uuid4()
        with self.assertRaises(creation['RecordValidationError']):
            await self.service.create(self.org, self.type_id, self.actor, self.payload)
        self.repo.get_records.return_value = {}
        with self.assertRaises(creation['RecordValidationError']):
            await self.service.create(self.org, self.type_id, self.actor, self.payload)
        self.repo.commit.assert_not_awaited()

    async def test_one_to_one_capacity_conflict_does_not_reassign_an_existing_link(self):
        self.relation['target_max'] = 1
        self.repo.link_counts.return_value = {(self.relation_id, 'target', str(self.target.id)): 1}
        with self.assertRaises(creation['RecordRelationConflictError']):
            await self.service.create(self.org, self.type_id, self.actor, self.payload)
        self.repo.insert_record.assert_not_awaited()
        self.repo.commit.assert_not_awaited()

    async def test_inverse_relation_is_optional_on_target_and_writes_canonical_edge(self):
        schema = await self.service.creation_schema(self.org, self.person_id)
        self.assertFalse(schema['relations'][0]['required'])
        self.assertTrue(schema['relations'][0]['many'])
        source = SimpleNamespace(id=uuid.uuid4(), entity_type_id=self.type_id)
        self.repo.get_records.return_value = {str(source.id): source}
        self.payload.values = {}
        self.assignment.update(direction='incoming', record_ids=[str(source.id)])
        result = await self.service.create(self.org, self.person_id, self.actor, self.payload)
        self.assertEqual(self.repo.insert_record.await_args.args[5], [(self.relation_id, str(source.id), str(result['id']))])

    async def test_duplicate_or_multiple_selection_in_single_relation_is_rejected(self):
        self.assignment['record_ids'] *= 2
        with self.assertRaises(creation['RecordValidationError']):
            await self.service.create(self.org, self.type_id, self.actor, self.payload)
        self.repo.commit.assert_not_awaited()

    async def test_failed_link_insert_rolls_back_the_entire_record(self):
        self.repo.insert_record.side_effect = IntegrityError()
        with self.assertRaises(creation['RecordValidationError']):
            await self.service.create(self.org, self.type_id, self.actor, self.payload)
        self.repo.rollback.assert_awaited_once()
        self.repo.commit.assert_not_awaited()

    async def test_commit_error_is_rolled_back_and_propagated(self):
        self.repo.commit.side_effect = RuntimeError('database unavailable')
        with self.assertRaises(RuntimeError):
            await self.service.create(self.org, self.type_id, self.actor, self.payload)
        self.repo.rollback.assert_awaited_once()

    async def test_type_without_custom_fields_or_relations_can_create_system_only_record(self):
        self.payload.values = {}
        self.payload.relations = []
        self.type.configuration = metadata['empty_configuration']()
        await self.service.create(self.org, self.type_id, self.actor, self.payload)
        self.assertEqual(self.repo.insert_record.await_args.args[4:], ({}, []))


if __name__ == '__main__': unittest.main()

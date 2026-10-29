"""Edit isolation, optimistic concurrency and relation integrity."""
import unittest
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import test_record_creation as fixtures
from test_record_creation import creation, metadata, services, IntegrityError
from test_navigation_records import ROOT, load_definitions

editing = load_definitions(ROOT / 'app/modules/entity_records/editing.py', {**metadata, **creation})
services.update(editing)


class EditingTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        fixtures.CreationTests.setUp(self)
        self.record_id = uuid.uuid4()
        self.timestamp = datetime(2026, 10, 25, tzinfo=timezone.utc)
        self.record = SimpleNamespace(id=self.record_id, updated_at=self.timestamp, values={self.definition['id']: 'old'})
        self.payload.expected_updated_at = self.timestamp
        self.edge = (self.relation_id, str(self.record_id), str(self.target.id))
        self.repo.get_record = AsyncMock(return_value=self.record)
        self.repo.record_edges = AsyncMock(return_value=[self.edge])
        self.repo.replace_record = AsyncMock()
        self.repo.link_counts.return_value = {
            (self.relation_id, 'source', str(self.record_id)): 1,
            (self.relation_id, 'target', str(self.target.id)): 1,
        }

    async def test_snapshot_contains_values_and_complete_relation_selections(self):
        self.target.values = {}
        self.target.created_at = self.target.updated_at = self.timestamp
        self.target.created_by = self.target.updated_by = self.actor
        result = await self.service.edit_schema(self.org, self.type_id, self.record_id)
        self.assertEqual(result['record_id'], self.record_id)
        self.assertEqual(result['updated_at'], self.timestamp)
        self.assertEqual(result['values'], self.record.values)
        self.assertEqual(result['selections'][f'relation:{self.relation_id}:outgoing'][0]['value'], str(self.target.id))
        self.repo.lock_writes.assert_awaited_once_with(self.org)
        self.repo.commit.assert_not_awaited()

    async def test_keep_existing_one_to_one_edge_without_counting_it_twice(self):
        self.relation['target_max'] = 1
        result = await self.service.update(self.org, self.type_id, self.record_id, self.actor, self.payload)
        self.assertEqual(result['id'], self.record_id)
        args = self.repo.replace_record.await_args.args
        self.assertEqual(args[:3], (self.org, self.record, self.actor))
        self.assertEqual(args[3], {self.definition['id']: 'Voiture'})
        self.assertEqual(args[-1], [self.edge])
        self.repo.commit.assert_awaited_once()
        self.repo.get_record.assert_awaited_once_with(self.org, self.type_id, self.record_id)

    async def test_stale_record_does_not_overwrite_another_edit(self):
        self.payload.expected_updated_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
        with self.assertRaises(editing['RecordConflictError']):
            await self.service.update(self.org, self.type_id, self.record_id, self.actor, self.payload)
        self.repo.replace_record.assert_not_awaited()
        self.repo.commit.assert_not_awaited()

    async def test_unknown_record_cannot_be_modified(self):
        self.repo.get_record.return_value = None
        with self.assertRaises(services['EntityRecordNotFoundError']):
            await self.service.update(self.org, self.type_id, self.record_id, self.actor, self.payload)
        self.repo.replace_record.assert_not_awaited()

    async def test_replacement_failure_rolls_back(self):
        self.repo.replace_record.side_effect = IntegrityError()
        with self.assertRaises(creation['RecordValidationError']):
            await self.service.update(self.org, self.type_id, self.record_id, self.actor, self.payload)
        self.repo.rollback.assert_awaited_once()
        self.repo.commit.assert_not_awaited()

    async def test_clearing_optional_field_removes_old_value(self):
        self.definition['required'] = False
        self.payload.values = {}
        await self.service.update(self.org, self.type_id, self.record_id, self.actor, self.payload)
        self.assertEqual(self.repo.replace_record.await_args.args[3], {})

    def test_removing_required_inverse_link_cannot_orphan_its_source(self):
        catalog = {str(self.type_id): self.type.configuration, str(self.person_id): self.person.configuration}
        with self.assertRaises(creation['RecordRelationConflictError']):
            editing['validate_replacement'](catalog, [self.edge], [], self.repo.link_counts.return_value, self.target.id)

    def test_removing_optional_inverse_link_is_allowed(self):
        self.relation['required'] = False
        catalog = {str(self.type_id): self.type.configuration, str(self.person_id): self.person.configuration}
        self.assertEqual(editing['validate_replacement'](catalog, [self.edge], [], self.repo.link_counts.return_value, self.target.id), [])

    async def test_outside_organization_target_is_rejected_on_edit(self):
        self.repo.get_records.return_value = {}
        with self.assertRaises(creation['RecordValidationError']):
            await self.service.update(self.org, self.type_id, self.record_id, self.actor, self.payload)
        self.repo.replace_record.assert_not_awaited()


if __name__ == '__main__': unittest.main()

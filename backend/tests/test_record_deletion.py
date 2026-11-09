import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

from app.modules.entity_records.creation import RecordRelationConflictError
from app.modules.entity_records.service import EntityRecordService


class RecordDeletionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.organization, self.type_id, self.record_id, self.actor = [uuid4() for _ in range(4)]
        self.relation = {
            'id': str(uuid4()), 'inverse_name': 'Fiches liées',
            'on_delete': 'restrict', 'required': False,
        }
        self.edge = (self.relation['id'], str(uuid4()), str(self.record_id))
        self.record = SimpleNamespace(id=self.record_id)
        self.repository = SimpleNamespace(
            lock_writes=AsyncMock(), get_record=AsyncMock(return_value=self.record),
            record_edges=AsyncMock(return_value=[self.edge]),
            catalog=AsyncMock(return_value=[
                SimpleNamespace(id=self.type_id, configuration={'relations': [self.relation]})
            ]),
            delete_record=AsyncMock(), commit=AsyncMock(),
        )
        self.service = EntityRecordService(self.repository)

    async def test_restrict_preserves_the_target(self):
        with self.assertRaises(RecordRelationConflictError):
            await self.service.delete(self.organization, self.type_id, self.record_id, self.actor)
        self.repository.delete_record.assert_not_awaited()
        self.repository.commit.assert_not_awaited()

    async def test_unlink_passes_existing_edges_to_transactional_delete(self):
        self.relation['on_delete'] = 'unlink'
        await self.service.delete(self.organization, self.type_id, self.record_id, self.actor)
        self.repository.lock_writes.assert_awaited_once_with(self.organization)
        self.repository.delete_record.assert_awaited_once_with(
            self.organization, self.record, self.actor, [self.edge],
        )
        self.repository.commit.assert_awaited_once()

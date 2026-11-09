"""Image references are scoped, ready and protected against concurrent deletion."""
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock
from app.modules.entity_records.creation import field_value, RecordValidationError
from app.modules.entity_records.presentation import safe_image, present_record
from app.modules.entity_records.service import EntityRecordService
from app.modules.entity_records.repository import EntityRecordRepository


class ImageReferenceTests(unittest.TestCase):
    def test_normalizes_file_reference_and_keeps_legacy_urls(self):
        identity = uuid.uuid4()
        field = {'kind': 'image', 'required': True}
        self.assertEqual(field_value(field, f'file:{str(identity).upper()}'), f'file:{identity}')
        self.assertEqual(field_value(field, 'https://example.org/photo.png'), 'https://example.org/photo.png')
        for invalid in ('file:other', 'file:../../x', 'javascript:alert(1)', 'http://example.org/x'):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                field_value(field, invalid)

    def test_presentation_keeps_reference_for_client_signing(self):
        file_id, type_id, record_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        ref = f'file:{file_id}'
        record = SimpleNamespace(id=record_id, entity_type_id=type_id, values={'image': ref},
            created_at=None, updated_at=None, created_by=None, updated_by=None)
        entity_type = SimpleNamespace(name='Photo', configuration={'fields': [{'id': 'image', 'kind': 'image'}],
            'display_profiles': [{'id': 'profile', 'is_default': True, 'title_fields': [], 'secondary_fields': [],
                                  'image_field': 'image', 'separator': ' '}]})
        self.assertEqual(safe_image(ref), ref)
        self.assertEqual(present_record(record, entity_type)['image'], ref)


class ImageLinkTests(unittest.IsolatedAsyncioTestCase):
    async def test_unavailable_cross_organization_or_non_image_file_is_rejected(self):
        file_id, org_id = uuid.uuid4(), uuid.uuid4()
        repository = SimpleNamespace(image_files=AsyncMock(return_value=set()))
        service = EntityRecordService(repository)
        with self.assertRaises(RecordValidationError) as error:
            await service.validate_image_files(org_id, [{'id': 'photo', 'kind': 'image'}], {'photo': f'file:{file_id}'})
        self.assertEqual(error.exception.issues[0]['field'], 'photo')
        repository.image_files.assert_awaited_once_with(org_id, {file_id})

    async def test_ready_image_links_without_replacing_reference_with_url(self):
        file_id, org_id = uuid.uuid4(), uuid.uuid4()
        repository = SimpleNamespace(image_files=AsyncMock(return_value={file_id}))
        values = {'photo': f'file:{file_id}'}
        await EntityRecordService(repository).validate_image_files(org_id, [{'id': 'photo', 'kind': 'image'}], values)
        self.assertEqual(values['photo'], f'file:{file_id}')

    async def test_legacy_image_needs_no_storage_lookup(self):
        repository = SimpleNamespace(image_files=AsyncMock())
        await EntityRecordService(repository).validate_image_files(uuid.uuid4(), [{'id': 'photo', 'kind': 'image'}],
                                                                  {'photo': 'https://example.org/photo.png'})
        repository.image_files.assert_not_awaited()

    async def test_unavailable_image_can_stay_in_its_original_field_but_cannot_be_reused(self):
        file_id, org_id = uuid.uuid4(), uuid.uuid4()
        async def image_files(org, ids, *, selectable_only=True):
            return set() if selectable_only else ids
        repository = SimpleNamespace(image_files=AsyncMock(side_effect=image_files))
        service = EntityRecordService(repository)
        fields = [{'id': 'photo', 'kind': 'image'}, {'id': 'other', 'kind': 'image'}]
        existing = {'photo': f'file:{file_id}'}
        await service.validate_image_files(org_id, fields, existing, existing)
        with self.assertRaises(RecordValidationError) as error:
            await service.validate_image_files(org_id, fields, {**existing, 'other': f'file:{file_id}'}, existing)
        self.assertEqual([issue['field'] for issue in error.exception.issues], ['other'])

    async def test_repository_filters_and_locks_image_files(self):
        org_id, file_id = uuid.uuid4(), uuid.uuid4()
        db = SimpleNamespace(scalars=AsyncMock(return_value=SimpleNamespace(all=lambda: [file_id])))
        self.assertEqual(await EntityRecordRepository(db).image_files(org_id, {file_id}), {file_id})
        query = db.scalars.await_args.args[0]
        sql = str(query)
        self.assertIn('stored_files.organization_id =', sql)
        self.assertIn('stored_files.state =', sql)
        self.assertIn('stored_files.content_type IN', sql)
        self.assertIn('FOR UPDATE', sql)
        self.assertIn(org_id, query.compile().params.values())


if __name__ == '__main__':
    unittest.main()

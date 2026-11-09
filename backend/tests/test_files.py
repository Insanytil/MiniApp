"""File validation and authorization; no running S3 or database required."""
import importlib.util
import os
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from pydantic import ValidationError
from app.modules.files.schemas import UploadRequest, FileNameRequest
from app.modules.files.repository import FileRepository

HAS_BOTO3 = importlib.util.find_spec("boto3") is not None
if HAS_BOTO3:
    from app.modules.files.exceptions import FileError
    from app.modules.files.service import FileService
    from app.modules.files.storage import S3Storage


class FileValidationTests(unittest.TestCase):
    def test_rejects_paths_and_control_characters(self):
        for name in ("../x", "a/b", "a\\b", "a\r\nx", "   "):
            with self.subTest(name=name), self.assertRaises(ValidationError):
                UploadRequest(filename=name, size_bytes=1)

    def test_rejects_empty_files_and_invalid_mime(self):
        for values in ({"size_bytes": 0}, {"size_bytes": 1, "content_type": "text/html\r\nX: y"}):
            with self.assertRaises(ValidationError):
                UploadRequest(filename="photo.png", **values)

    def test_preserves_unicode_filename(self):
        self.assertEqual(UploadRequest(filename=" été.png ", size_bytes=1).filename, "été.png")


class FileLibraryTests(unittest.IsolatedAsyncioTestCase):
    async def test_library_filters_scoped_ready_images_and_escapes_search(self):
        org = uuid.uuid4()
        db = SimpleNamespace(scalars=AsyncMock(return_value=SimpleNamespace(all=lambda: [])))
        await FileRepository(db).list_ready(org, offset=18, limit=19, search=' Photo_100% ', images_only=True)
        query = db.scalars.await_args.args[0]
        sql = str(query)
        params = query.compile().params
        self.assertIn('stored_files.organization_id =', sql)
        self.assertIn('stored_files.state =', sql)
        self.assertIn('stored_files.content_type IN', sql)
        self.assertIn('lower(stored_files.filename)', sql)
        self.assertIn(org, params.values())
        self.assertIn('ready', params.values())
        self.assertIn('stored_files.is_selectable IS true', sql)
        self.assertIn('photo/_100/%', params.values())
        self.assertIn(18, params.values())
        self.assertIn(19, params.values())

    async def test_manager_counts_record_usage_with_both_organization_scopes(self):
        org = uuid.uuid4()
        db = SimpleNamespace(scalar=AsyncMock(return_value=2),
            execute=AsyncMock(return_value=SimpleNamespace(all=lambda: [])))
        _, total = await FileRepository(db).list_managed(org, offset=0, limit=20, linked=False, selectable=False)
        query = db.execute.await_args.args[0]
        sql = str(query)
        self.assertEqual(total, 2)
        self.assertIn('entity_records.organization_id =', sql)
        self.assertIn('stored_files.organization_id =', sql)
        self.assertIn('CAST(stored_files.id AS VARCHAR)', sql)
        self.assertIn('usage_count', sql)
        self.assertIn('stored_files.is_selectable IS false', sql)
        # The EXISTS must correlate to this file, never scan all files again.
        self.assertEqual(sql.count('FROM stored_files'), 1)
        self.assertGreaterEqual(list(query.compile().params.values()).count(org), 2)

    async def test_default_listing_keeps_non_image_files_available(self):
        items = [object()]
        db = SimpleNamespace(scalars=AsyncMock(return_value=SimpleNamespace(all=lambda: items)))
        result = await FileRepository(db).list_ready(uuid.uuid4(), offset=0, limit=50)
        self.assertIs(result, items)
        query = str(db.scalars.await_args.args[0])
        self.assertNotIn('stored_files.content_type IN', query)
        self.assertNotIn('lower(stored_files.filename)', query)


@unittest.skipUnless(HAS_BOTO3, "Install declared backend dependencies to run S3 tests")
class FileAuthorizationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.org = uuid.uuid4()
        self.user = uuid.uuid4()
        self.scope = SimpleNamespace(organization=SimpleNamespace(id=self.org),
            user=SimpleNamespace(id=self.user, is_superuser=False), role=None)
        self.item = SimpleNamespace(id=uuid.uuid4(), created_by=self.user, state="pending",
            object_key="test", content_type="image/png", size_bytes=12)
        self.db = SimpleNamespace(scalar=AsyncMock(return_value=self.item),
            commit=AsyncMock(), refresh=AsyncMock(), add=Mock())
        self.storage = Mock()
        self.service = FileService(self.db, self.storage)

    async def test_lookup_always_scopes_to_organization_and_excludes_deleted(self):
        await self.service.get_file(self.org, self.item.id, lock=True)
        query = self.db.scalar.await_args.args[0]
        sql = str(query)
        self.assertIn("stored_files.organization_id =", sql)
        self.assertIn("stored_files.state !=", sql)
        self.assertIn("FOR UPDATE", sql)
        self.assertIn(self.org, query.compile().params.values())
        self.db.scalar.return_value = None
        with self.assertRaises(FileError) as error:
            await self.service.get_file(self.org, self.item.id)
        self.assertEqual(error.exception.status_code, 404)

    async def test_another_member_cannot_complete_or_delete(self):
        self.item.created_by = uuid.uuid4()
        for action in (self.service.complete_upload, self.service.delete_file):
            with self.assertRaises(FileError) as error:
                await action(self.item.id, self.scope)
            self.assertEqual(error.exception.status_code, 403)
        self.storage.finalize.assert_not_called()
        self.storage.delete.assert_not_called()

    async def test_completion_is_idempotent(self):
        self.item.state = "ready"
        await self.service.complete_upload(self.item.id, self.scope)
        self.storage.finalize.assert_not_called()

    async def test_rejects_oversize_before_signing(self):
        payload = UploadRequest(filename="x", size_bytes=10**12)
        with self.assertRaises(FileError) as error:
            await self.service.create_upload(payload, self.scope)
        self.assertEqual(error.exception.status_code, 413)
        self.storage.upload.assert_not_called()

    async def test_linked_file_cannot_be_deleted(self):
        self.db.scalar.side_effect = [self.item, uuid.uuid4()]
        with self.assertRaises(FileError) as error:
            await self.service.delete_file(self.item.id, self.scope)
        self.assertEqual(error.exception.status_code, 409)
        self.storage.delete.assert_not_called()

    async def test_unlinked_file_can_be_deleted(self):
        self.db.scalar.side_effect = [self.item, None]
        await self.service.delete_file(self.item.id, self.scope)
        self.storage.delete.assert_called_once_with(self.item.object_key)
        self.assertEqual(self.item.state, 'deleted')
        self.db.commit.assert_awaited_once()

    async def test_unavailable_file_can_still_be_downloaded_and_renamed_without_s3_copy(self):
        self.item.state = 'ready'
        self.item.filename = 'before.png'
        self.storage.download.return_value = 'https://signed.example/file'
        await self.service.set_availability(self.item.id, self.scope, False)
        self.assertFalse(self.item.is_selectable)
        result = await self.service.download_file(self.item.id, self.scope, preview=True)
        self.assertEqual(result.url, 'https://signed.example/file')
        await self.service.rename_file(self.item.id, self.scope, 'after.png')
        self.assertEqual(self.item.filename, 'after.png')
        self.storage.finalize.assert_not_called()
        self.storage.delete.assert_not_called()

    async def test_staging_cleanup_happens_only_after_successful_commit(self):
        events = []
        self.storage.finalize.side_effect = lambda *args: events.append('copy')
        self.db.commit.side_effect = lambda: events.append('commit')
        self.storage.discard_pending.side_effect = lambda *args: events.append('cleanup')
        await self.service.complete_upload(self.item.id, self.scope)
        self.assertEqual(events, ['copy', 'commit', 'cleanup'])

    async def test_failed_commit_keeps_staging_available_for_retry(self):
        self.db.commit.side_effect = RuntimeError('database unavailable')
        with self.assertRaises(RuntimeError):
            await self.service.complete_upload(self.item.id, self.scope)
        self.storage.discard_pending.assert_not_called()

    async def test_cleanup_failure_does_not_reject_completed_upload(self):
        self.storage.discard_pending.side_effect = FileError(503, 'File storage unavailable')
        with self.assertLogs('app.modules.files.service', level='WARNING'):
            result = await self.service.complete_upload(self.item.id, self.scope)
        self.assertIs(result, self.item)
        self.assertEqual(result.state, 'ready')
        self.db.commit.assert_awaited_once()

    async def test_storage_failure_does_not_mark_ready(self):
        self.storage.finalize.side_effect = ValueError("mismatch")
        with self.assertRaises(FileError):
            await self.service.complete_upload(self.item.id, self.scope)
        self.assertEqual(self.item.state, "pending")
        self.db.commit.assert_not_awaited()


@unittest.skipUnless(HAS_BOTO3, "Install declared backend dependencies to run S3 tests")
class S3SigningTests(unittest.TestCase):
    def setUp(self):
        self.storage = S3Storage.__new__(S3Storage)
        self.storage.client = Mock()
        self.storage.signer = Mock()

    def test_post_constrains_size_type_and_staging_key(self):
        self.storage.upload("organizations/org/file", "image/png", 12)
        params = self.storage.signer.generate_presigned_post.call_args.kwargs
        self.assertEqual(params["Key"], "pending/organizations/org/file")
        self.assertIn(["content-length-range", 12, 12], params["Conditions"])
        self.assertIn({"Content-Type": "image/png"}, params["Conditions"])

    def test_finalize_copies_the_verified_version(self):
        self.storage.client.head_object.return_value = {"ContentLength": 12, "ContentType": "image/png", "ETag": "etag"}
        self.storage.finalize("key", "image/png", 12)
        params = self.storage.client.copy_object.call_args.kwargs
        self.assertEqual(params["CopySourceIfMatch"], "etag")
        self.assertEqual(params["Key"], "key")
        self.assertEqual(params["CopySource"]["Key"], "pending/key")

    def test_staging_cleanup_does_not_delete_the_published_object(self):
        self.storage.discard_pending('organizations/org/key')
        self.storage.client.delete_object.assert_called_once()
        self.assertEqual(self.storage.client.delete_object.call_args.kwargs['Key'], 'pending/organizations/org/key')

    def test_metadata_mismatch_never_publishes(self):
        self.storage.client.head_object.return_value = {"ContentLength": 13, "ContentType": "image/png"}
        with self.assertRaises(ValueError):
            self.storage.finalize("key", "image/png", 12)
        self.storage.client.copy_object.assert_not_called()


@unittest.skipUnless(HAS_BOTO3 and os.getenv("MINIO_INTEGRATION") == "1", "Opt-in live MinIO test")
class MinioIntegrationTests(unittest.TestCase):
    def test_signed_upload_finalize_download_and_delete(self):
        from urllib.request import Request, urlopen
        from urllib.error import HTTPError
        storage = S3Storage()
        key = f"organizations/integration/{uuid.uuid4()}"
        content = b"miniapp signed upload test"
        try:
            ticket = storage.upload(key, "application/octet-stream", len(content))
            boundary = "miniapp" + uuid.uuid4().hex
            parts = []
            for name, value in ticket["fields"].items():
                parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.bin"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode())
            parts.extend([content, f"\r\n--{boundary}--\r\n".encode()])
            request = Request(ticket["url"], data=b"".join(parts), method="POST",
                              headers={"Content-Type": f"multipart/form-data; boundary={boundary}",
                                       "Origin": "http://localhost:3000"})
            with urlopen(request, timeout=15) as response:
                self.assertIn(response.status, (200, 201, 204))
                self.assertEqual(response.headers.get("Access-Control-Allow-Origin"), "http://localhost:3000")
            storage.finalize(key, "application/octet-stream", len(content))
            storage.discard_pending(key)
            url = storage.download(key, "été.bin")
            with urlopen(url, timeout=15) as response:
                self.assertEqual(response.read(), content)
            with self.assertRaises(HTTPError) as error:
                urlopen(url.split("?")[0], timeout=15)
            self.assertEqual(error.exception.code, 403)
            storage.delete(key)
            with self.assertRaises(HTTPError):
                urlopen(url, timeout=15)
        finally:
            storage.delete(key)


if __name__ == "__main__":
    unittest.main()

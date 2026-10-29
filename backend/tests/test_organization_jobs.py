"""Scoped job endpoint rules, tested without database or Redis dependencies."""
import ast
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock


class HttpError(Exception):
    def __init__(self, *, status_code, detail):
        self.status_code = status_code
        self.detail = detail


class JobNotFound(Exception):
    pass


class ActionNotAllowed(Exception):
    pass


source = Path(__file__).resolve().parents[1] / 'app/modules/organization_administration/jobs_router.py'
functions = [node for node in ast.parse(source.read_text()).body if isinstance(node, ast.AsyncFunctionDef)]
for node in functions:
    node.decorator_list = []
namespace = {
    'HTTPException': HttpError,
    'BackgroundJobNotFoundError': JobNotFound,
    'BackgroundJobActionNotAllowedError': ActionNotAllowed,
    'BackgroundJobListParams': SimpleNamespace,
    'PagePaginatedResponse': SimpleNamespace,
    'PagePaginationMeta': SimpleNamespace,
    'EmailDispatchResponse': SimpleNamespace,
}
exec(compile('from __future__ import annotations\n' + '\n'.join(ast.unparse(node) for node in functions), str(source), 'exec'), namespace)


class OrganizationJobTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.org = uuid.uuid4()
        self.scope = SimpleNamespace(organization=SimpleNamespace(id=self.org))
        self.job_id = uuid.uuid4()
        self.service = SimpleNamespace(
            list_jobs=AsyncMock(return_value=(['scoped-group'], 21)),
            list_batch_jobs=AsyncMock(return_value=['scoped-job']),
            retry=AsyncMock(return_value=True), cancel=AsyncMock(),
        )

    async def test_list_passes_authorized_scope_separately_from_query_filters(self):
        params = SimpleNamespace(page=2, page_size=20, model_dump=lambda: {'page': 2, 'page_size': 20, 'search': 'example'})
        response = await namespace['list_organization_jobs'](params, self.scope, self.service)
        self.assertEqual(self.service.list_jobs.await_args.kwargs['organization_id'], self.org)
        self.assertEqual(response.items, ['scoped-group'])
        self.assertEqual(response.pagination.total_pages, 2)

    async def test_batch_details_are_scoped_to_the_authorized_organization(self):
        result = await namespace['get_organization_job_batch'](self.job_id, self.scope, self.service)
        self.assertEqual(result, ['scoped-job'])
        self.service.list_batch_jobs.assert_awaited_once_with(batch_id=self.job_id, organization_id=self.org)

    async def test_inaccessible_batch_returns_404(self):
        self.service.list_batch_jobs.return_value = []
        with self.assertRaises(HttpError) as error:
            await namespace['get_organization_job_batch'](self.job_id, self.scope, self.service)
        self.assertEqual(error.exception.status_code, 404)

    async def test_retry_and_cancel_never_use_unscoped_service_calls(self):
        result = await namespace['retry_organization_job'](self.job_id, self.scope, self.service)
        self.assertTrue(result.queued)
        await namespace['cancel_organization_job'](self.job_id, self.scope, self.service)
        self.service.retry.assert_awaited_once_with(job_id=self.job_id, organization_id=self.org)
        self.service.cancel.assert_awaited_once_with(job_id=self.job_id, organization_id=self.org)

    async def test_outside_organization_jobs_cannot_be_mutated(self):
        for action in ('retry', 'cancel'):
            getattr(self.service, action).side_effect = JobNotFound()
            with self.assertRaises(HttpError) as error:
                await namespace[f'{action}_organization_job'](self.job_id, self.scope, self.service)
            self.assertEqual(error.exception.status_code, 404)

    async def test_state_conflicts_are_reported_without_success(self):
        for action in ('retry', 'cancel'):
            getattr(self.service, action).side_effect = ActionNotAllowed()
            with self.assertRaises(HttpError) as error:
                await namespace[f'{action}_organization_job'](self.job_id, self.scope, self.service)
            self.assertEqual(error.exception.status_code, 409)

    async def test_retry_preserves_redis_queue_failure(self):
        self.service.retry.return_value = False
        response = await namespace['retry_organization_job'](self.job_id, self.scope, self.service)
        self.assertFalse(response.queued)


if __name__ == '__main__':
    unittest.main()

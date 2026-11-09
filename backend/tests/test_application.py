"""Application wiring and shared authentication contracts without external services."""
import json
import re
import uuid
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi import HTTPException
from starlette.requests import Request

from app.application import create_app, file_error_handler
from app.modules.auth.dependencies import _authenticate_session
from app.modules.auth.exceptions import InvalidSessionError
from app.modules.files.exceptions import FileError
from app.modules.auth.dependencies import get_authenticated_session
from app.modules.authorisation.dependencies import require_organization_scope
from app.models.organization_role import OrganizationRole
from app.modules.authorisation.dependencies import require_platform_admin
from app.modules.platform_administration.dependencies import get_platform_user_administration_service
from app.modules.platform_administration.exceptions import OrganizationMembershipNotFoundError


async def request(application, method, path, body=b''):
    messages = []

    async def receive():
        return {'type': 'http.request', 'body': body, 'more_body': False}

    async def send(message):
        messages.append(message)

    scope = {'type': 'http', 'asgi': {'version': '3.0'}, 'http_version': '1.1',
             'method': method, 'path': path, 'raw_path': path.encode(),
             'query_string': b'', 'headers': [(b'content-type', b'application/json')],
             'scheme': 'http', 'root_path': '', 'server': ('test', 80), 'client': ('test', 123)}
    await application(scope, receive, send)
    return next(message['status'] for message in messages if message['type'] == 'http.response.start')


class ApplicationTests(unittest.IsolatedAsyncioTestCase):
    def test_factory_keeps_routes_and_dependency_overrides_isolated(self):
        first, second = create_app(), create_app()
        first.dependency_overrides[object()] = object()
        self.assertFalse(second.dependency_overrides)
        paths = first.openapi()['paths']
        for path in ('/organization/files/uploads', '/organization/users/{user_id}/profile',
                     '/organization/entities/{entity_type_id}/records'):
            self.assertIn(path, paths)
        self.assertEqual(paths.keys(), second.openapi()['paths'].keys())
        self.assertIn(FileError, first.exception_handlers)

    async def test_every_platform_route_retains_the_administrator_guard(self):
        application = create_app()
        application.dependency_overrides[get_authenticated_session] = lambda: SimpleNamespace(
            user=SimpleNamespace(is_superuser=False),
        )
        paths = {path: operations for path, operations in application.openapi()['paths'].items()
                 if path.startswith('/platform/')}
        self.assertTrue(paths)
        for path, operations in paths.items():
            for method in operations:
                if method not in {'get', 'post', 'patch', 'put', 'delete'}:
                    continue
                actual_path = re.sub(r'\{[^}]+\}', '12345678-1234-4234-8234-123456789abc', path)
                with self.subTest(path=path, method=method):
                    self.assertEqual(await request(application, method.upper(), actual_path), 403)

    async def test_member_update_alias_performs_the_write_and_preserves_not_found(self):
        application = create_app()
        service = SimpleNamespace(set_organization_access=AsyncMock())
        application.dependency_overrides[require_platform_admin] = lambda: object()
        application.dependency_overrides[get_platform_user_administration_service] = lambda: service
        organization_id, user_id = uuid.uuid4(), uuid.uuid4()
        path = f'/platform/organizations/{organization_id}/members/{user_id}'
        payload = json.dumps({'is_active': False}).encode()
        self.assertEqual(await request(application, 'PATCH', path, payload), 204)
        service.set_organization_access.assert_awaited_once_with(
            user_id=user_id, organization_id=organization_id, is_active=False, role=None,
        )
        service.set_organization_access.side_effect = OrganizationMembershipNotFoundError()
        self.assertEqual(await request(application, 'PATCH', path, payload), 404)

    async def test_file_manager_requires_organization_administrator(self):
        application = create_app()
        application.dependency_overrides[require_organization_scope] = lambda: SimpleNamespace(role=OrganizationRole.USER)
        for path, method, payload in (
            ('/organization/files/manage', 'GET', b''),
            ('/organization/files/12345678-1234-4234-8234-123456789abc/availability', 'PATCH', b'{"is_selectable":false}'),
            ('/organization/files/12345678-1234-4234-8234-123456789abc/name', 'PUT', b'{"filename":"new.png"}'),
        ):
            self.assertEqual(await request(application, method, path, payload), 403)

    def test_file_errors_preserve_the_public_response_contract(self):
        response = file_error_handler(Request({'type': 'http'}), FileError(409, 'File is not ready'))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(json.loads(response.body), {'detail': 'File is not ready'})


class AuthenticationTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_token_is_rejected_before_calling_service(self):
        service = SimpleNamespace(authenticate_session=AsyncMock())
        with self.assertRaises(HTTPException) as error:
            await _authenticate_session(None, service)
        self.assertEqual(error.exception.status_code, 401)
        service.authenticate_session.assert_not_awaited()

    async def test_invalid_token_is_translated_to_the_same_unauthorized_response(self):
        service = SimpleNamespace(authenticate_session=AsyncMock(side_effect=InvalidSessionError()))
        with self.assertRaises(HTTPException) as error:
            await _authenticate_session('expired', service)
        self.assertEqual(error.exception.status_code, 401)
        self.assertEqual(error.exception.detail, 'Authentication required')

    async def test_valid_session_is_returned_unchanged(self):
        session = object()
        service = SimpleNamespace(authenticate_session=AsyncMock(return_value=session))
        self.assertIs(await _authenticate_session('valid', service), session)


if __name__ == '__main__':
    unittest.main()

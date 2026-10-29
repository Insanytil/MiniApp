"""Isolated organization administration rules; no database, Redis or SMTP needed."""
import ast
import unittest
import uuid
from enum import Enum
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock


ROOT = Path(__file__).resolve().parents[1]


def load_definitions(path, namespace, names=None):
    source = ast.parse(path.read_text())
    nodes = [node for node in source.body if isinstance(node, (ast.ClassDef, ast.AsyncFunctionDef)) and (names is None or node.name in names)]
    exec(compile('from __future__ import annotations\n' + '\n'.join(ast.unparse(node) for node in nodes), str(path), 'exec'), namespace)
    return namespace


class MembershipNotFound(Exception):
    pass


class NotVerified(Exception):
    pass


class Roles(Enum):
    ADMIN = 'organization_admin'
    USER = 'organization_user'


class HttpError(Exception):
    def __init__(self, *, status_code, detail):
        self.status_code = status_code
        self.detail = detail


service_namespace = load_definitions(ROOT / 'app/modules/organization_administration/service.py', {
    'OrganizationMembershipNotFoundError': MembershipNotFound,
    'UserNotVerifiedError': NotVerified,
    'CreatePlatformUserRequest': SimpleNamespace,
    'OrganizationUserResponse': SimpleNamespace,
    'BackgroundJobType': SimpleNamespace(PASSWORD_RESET_EMAIL='password_reset_email'),
})
Service = service_namespace['OrganizationUserService']
guards = load_definitions(ROOT / 'app/modules/authorisation/dependencies.py', {
    'dataclass': __import__('dataclasses').dataclass, 'OrganizationRole': Roles,
    'HTTPException': HttpError,
    'status': SimpleNamespace(HTTP_403_FORBIDDEN=403, HTTP_404_NOT_FOUND=404),
    'uuid': uuid,
}, names={'require_organization_admin'})


class OrganizationUserTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.org = uuid.uuid4()
        self.actor = uuid.uuid4()
        self.user = SimpleNamespace(id=uuid.uuid4(), email='user@example.com', is_active=True,
                                    is_verified=True, created_at='date')
        self.member = SimpleNamespace(organization_id=self.org, user_id=self.user.id,
                                      is_active=True, role=Roles.USER)
        self.other_member = SimpleNamespace(organization_id=uuid.uuid4(), is_active=True, role=Roles.ADMIN)
        self.user.organization_memberships = [self.member, self.other_member]
        self.repo = SimpleNamespace(get_member=AsyncMock(return_value=(self.user, self.member)),
                                    list_members=AsyncMock(return_value=([(self.user, self.member)], 1)))
        self.events = []
        self.db = SimpleNamespace(flush=AsyncMock(), commit=AsyncMock(side_effect=lambda: self.events.append('commit')))
        self.job = object()
        self.jobs = SimpleNamespace(create_email_job=Mock(return_value=self.job),
                                   dispatch=AsyncMock(side_effect=lambda job: self.events.append('dispatch') or True))
        self.creation = SimpleNamespace(create_user=AsyncMock(return_value=(self.user, True)))
        self.service = Service(db=self.db, repository=self.repo, user_creation=self.creation, job_service=self.jobs)

    async def test_list_exposes_only_the_authorized_membership(self):
        users, total = await self.service.list_users(organization_id=self.org,
            params=SimpleNamespace(search='example', offset=20, page_size=20))
        self.repo.list_members.assert_awaited_once_with(organization_id=self.org, search='example', offset=20, limit=20)
        self.assertEqual(total, 1)
        self.assertEqual(users[0].role, Roles.USER)
        self.assertFalse(hasattr(users[0], 'memberships'))
        self.assertFalse(hasattr(users[0], 'organization_memberships'))

    async def test_create_forces_scope_and_attributes_invitation_actor(self):
        user, queued = await self.service.create_user(organization_id=self.org, actor_id=self.actor,
            payload=SimpleNamespace(email=self.user.email, role=Roles.USER, organization_id=uuid.uuid4()))
        payload = self.creation.create_user.await_args.args[0]
        self.assertEqual(payload.organization_id, self.org)
        self.assertEqual(payload.role, Roles.USER)
        self.assertEqual(self.creation.create_user.await_args.kwargs['triggered_by_user_id'], self.actor)
        self.assertEqual(user.role, Roles.USER)
        self.assertTrue(queued)

    async def test_suspend_changes_only_the_organization_membership(self):
        await self.service.set_access(organization_id=self.org, actor_id=self.actor, user_id=self.user.id, is_active=False)
        self.repo.get_member.assert_awaited_once_with(organization_id=self.org, user_id=self.user.id, for_update=True)
        self.assertFalse(self.member.is_active)
        self.assertTrue(self.user.is_active)
        self.assertTrue(self.other_member.is_active)
        self.db.commit.assert_awaited_once()

    async def test_reactivate_membership_does_not_reactivate_globally_suspended_account(self):
        self.member.is_active = False
        self.user.is_active = False
        await self.service.set_access(organization_id=self.org, actor_id=self.actor, user_id=self.user.id, is_active=True)
        self.assertTrue(self.member.is_active)
        self.assertFalse(self.user.is_active)

    async def test_self_suspension_is_rejected_without_writes(self):
        with self.assertRaises(service_namespace['SelfSuspensionError']):
            await self.service.set_access(organization_id=self.org, actor_id=self.user.id, user_id=self.user.id, is_active=False)
        self.db.commit.assert_not_awaited()
        self.assertTrue(self.member.is_active)

    async def test_other_organization_target_cannot_be_suspended_or_receive_reset(self):
        self.repo.get_member.return_value = None
        with self.assertRaises(MembershipNotFound):
            await self.service.set_access(organization_id=self.org, actor_id=self.actor, user_id=self.user.id, is_active=False)
        with self.assertRaises(MembershipNotFound):
            await self.service.send_password_reset(organization_id=self.org, actor_id=self.actor, user_id=self.user.id)
        self.db.commit.assert_not_awaited()
        self.jobs.create_email_job.assert_not_called()

    async def test_reset_records_organization_and_actor_and_commits_before_dispatch(self):
        self.assertTrue(await self.service.send_password_reset(organization_id=self.org, actor_id=self.actor, user_id=self.user.id))
        self.assertEqual(self.events, ['commit', 'dispatch'])
        self.jobs.create_email_job.assert_called_once_with(job_type='password_reset_email',
            recipient_email=self.user.email, subject_user_id=self.user.id,
            organization_id=self.org, triggered_by_user_id=self.actor)

    async def test_unverified_user_cannot_receive_password_reset(self):
        self.user.is_verified = False
        with self.assertRaises(NotVerified):
            await self.service.send_password_reset(organization_id=self.org, actor_id=self.actor, user_id=self.user.id)
        self.db.commit.assert_not_awaited()
        self.jobs.create_email_job.assert_not_called()

    async def test_queue_failure_is_returned_as_false(self):
        self.jobs.dispatch.side_effect = None
        self.jobs.dispatch.return_value = False
        self.assertFalse(await self.service.send_password_reset(organization_id=self.org, actor_id=self.actor, user_id=self.user.id))

    async def test_organization_admin_dependency_uses_scoped_role(self):
        scope = SimpleNamespace(role=Roles.ADMIN)
        self.assertIs(await guards['require_organization_admin'](scope), scope)
        for role in (Roles.USER, None):
            with self.assertRaises(HttpError) as error:
                await guards['require_organization_admin'](SimpleNamespace(role=role))
            self.assertEqual(error.exception.status_code, 403)


if __name__ == '__main__':
    unittest.main()

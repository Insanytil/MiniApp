"""Exercise the real email orchestration service without SMTP, Redis or a database."""
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from app.models.background_job import BackgroundJobType
from app.modules.platform_administration.exceptions import UserAlreadyVerifiedError, UserNotVerifiedError
from app.modules.platform_administration.services.platform_user_services import PlatformUserAdministrationService


class EmailTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.events = []
        self.actor = uuid.uuid4()
        self.user = SimpleNamespace(id=uuid.uuid4(), email="user@example.com", is_verified=False)
        self.db = SimpleNamespace(flush=AsyncMock(), commit=AsyncMock(side_effect=lambda: self.events.append("commit")), rollback=AsyncMock())
        self.repo = SimpleNamespace(get_by_email=AsyncMock(return_value=None), create=AsyncMock(return_value=self.user),
            get_by_id_with_memberships=AsyncMock(return_value=self.user), get_managed_by_id=AsyncMock(return_value=self.user),
            create_membership=AsyncMock())
        self.job = object()
        self.jobs = SimpleNamespace(create_email_job=Mock(return_value=self.job),
            dispatch=AsyncMock(side_effect=lambda job: self.events.append("dispatch") or True))
        self.service = PlatformUserAdministrationService(db=self.db, user_repository=self.repo,
            organization_repository=SimpleNamespace(get_by_id=AsyncMock(return_value=object())),
            user_manager=SimpleNamespace(password_helper=SimpleNamespace(hash=Mock(return_value="password-hash"))),
            job_service=self.jobs)

    async def test_create_persists_job_before_dispatch(self):
        user, queued = await self.service.create_user(SimpleNamespace(email=self.user.email, organization_id=None, role=None), self.actor)
        self.assertIs(user, self.user)
        self.assertTrue(queued)
        self.assertEqual(self.events, ["commit", "dispatch"])
        self.assertEqual(self.jobs.create_email_job.call_args.kwargs["job_type"], BackgroundJobType.ACCOUNT_VERIFICATION_EMAIL)
        self.assertEqual(self.jobs.create_email_job.call_args.kwargs["triggered_by_user_id"], self.actor)

    async def test_creation_job_and_membership_keep_the_requested_organization(self):
        org = uuid.uuid4()
        await self.service.create_user(SimpleNamespace(email=self.user.email, organization_id=org, role="organization_user"), self.actor)
        self.assertEqual(self.repo.create_membership.await_args.kwargs["organization_id"], org)
        self.assertEqual(self.jobs.create_email_job.call_args.kwargs["organization_id"], org)

    async def test_resend_creates_a_durable_activation_job(self):
        self.assertTrue(await self.service.resend_verification_email(user_id=self.user.id, triggered_by_user_id=self.actor))
        self.assertEqual(self.events, ["commit", "dispatch"])
        self.jobs.create_email_job.assert_called_once_with(job_type=BackgroundJobType.ACCOUNT_VERIFICATION_EMAIL,
            recipient_email=self.user.email, subject_user_id=self.user.id, organization_id=None, triggered_by_user_id=self.actor)

    async def test_reset_uses_password_reset_job_type(self):
        self.user.is_verified = True
        self.assertTrue(await self.service.send_password_reset_email(user_id=self.user.id, triggered_by_user_id=self.actor))
        self.assertEqual(self.jobs.create_email_job.call_args.kwargs["job_type"], BackgroundJobType.PASSWORD_RESET_EMAIL)
        self.assertEqual(self.events, ["commit", "dispatch"])

    async def test_queue_unavailable_does_not_rollback_the_created_account(self):
        self.jobs.dispatch.side_effect = None
        self.jobs.dispatch.return_value = False
        _, queued = await self.service.create_user(SimpleNamespace(email=self.user.email, organization_id=None, role=None), self.actor)
        self.assertFalse(queued)
        self.db.commit.assert_awaited_once()
        self.db.rollback.assert_not_awaited()

    async def test_commit_failure_prevents_dispatch(self):
        self.db.commit.side_effect = RuntimeError("database unavailable")
        with self.assertRaises(RuntimeError):
            await self.service.resend_verification_email(user_id=self.user.id, triggered_by_user_id=self.actor)
        self.jobs.dispatch.assert_not_awaited()

    async def test_verified_user_cannot_receive_activation(self):
        self.user.is_verified = True
        with self.assertRaises(UserAlreadyVerifiedError):
            await self.service.resend_verification_email(user_id=self.user.id, triggered_by_user_id=self.actor)
        self.jobs.create_email_job.assert_not_called()

    async def test_unverified_user_cannot_receive_reset(self):
        with self.assertRaises(UserNotVerifiedError):
            await self.service.send_password_reset_email(user_id=self.user.id, triggered_by_user_id=self.actor)
        self.jobs.create_email_job.assert_not_called()


if __name__ == "__main__":
    unittest.main()

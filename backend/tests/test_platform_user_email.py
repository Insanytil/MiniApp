"""Isolated service tests; no SMTP server or database is contacted."""
import ast
import logging
import smtplib
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock


# Load the service class independently of application configuration and DB imports.
source = Path(__file__).resolve().parents[1] / 'app/modules/platform_administration/services/platform_user_services.py'
module = ast.parse(source.read_text())
service_class = next(node for node in module.body if isinstance(node, ast.ClassDef))
namespace = {
    'uuid': uuid,
    'logger': logging.getLogger(__name__),
    'smtplib': smtplib,
    'generate_secret': lambda: 'raw-token',
    'hash_secret': lambda token: b'hashed-token',
    'session_expiry': lambda lifetime: datetime.now(timezone.utc) + lifetime,
    'IntegrityError': type('IntegrityError', (Exception,), {}),
}
for name in ('UserEmailAlreadyExistsError', 'OrganizationNotFoundError',
             'UserAlreadyVerifiedError', 'UserNotVerifiedError', 'EmailDeliveryError'):
    namespace[name] = type(name, (Exception,), {})
exec(compile('from __future__ import annotations\n' + ast.unparse(service_class), str(source), 'exec'), namespace)
Service = namespace['PlatformUserAdministrationService']


class EmailTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.events = []
        self.user = SimpleNamespace(id=uuid.uuid4(), email='user@example.com', is_verified=False)
        self.db = SimpleNamespace(flush=AsyncMock(), commit=AsyncMock(side_effect=lambda: self.events.append('commit')), rollback=AsyncMock())
        self.sender = SimpleNamespace(
            send_account_invitation=AsyncMock(side_effect=lambda **kw: self.events.append('send')),
            send_password_reset=AsyncMock(side_effect=lambda **kw: self.events.append('send')),
        )
        self.repo = SimpleNamespace(
            get_by_email=AsyncMock(return_value=None), create=AsyncMock(return_value=self.user),
            get_by_id_with_memberships=AsyncMock(return_value=self.user),
            get_managed_by_id=AsyncMock(return_value=self.user), create_membership=AsyncMock(),
        )
        self.invitations = SimpleNamespace(create=AsyncMock(), replace_for_user=AsyncMock())
        self.resets = SimpleNamespace(create_or_replace=AsyncMock())
        self.service = Service(
            db=self.db, user_repository=self.repo, organization_repository=Mock(),
            user_manager=SimpleNamespace(password_helper=SimpleNamespace(hash=Mock(return_value='password-hash'))),
            email_sender=self.sender, invitation_repository=self.invitations,
            password_reset_repository=self.resets, invitation_lifetime=timedelta(hours=48),
            password_reset_lifetime=timedelta(hours=1),
        )

    async def test_create_persists_hashed_token_before_sending(self):
        user, sent = await self.service.create_user(SimpleNamespace(email=self.user.email, organization_id=None, role=None))
        self.assertIs(user, self.user)
        self.assertTrue(sent)
        self.assertEqual(self.events, ['send', 'commit'])
        self.assertEqual(self.invitations.create.await_args.kwargs['token_hash'], b'hashed-token')
        self.sender.send_account_invitation.assert_awaited_once_with(recipient_email=self.user.email, token='raw-token')

    async def test_resend_replaces_invitation(self):
        self.assertTrue(await self.service.resend_verification_email(user_id=self.user.id))
        self.invitations.replace_for_user.assert_awaited_once()
        self.assertEqual(self.events, ['send', 'commit'])

    async def test_reset_uses_reset_sender(self):
        self.user.is_verified = True
        self.assertTrue(await self.service.send_password_reset_email(user_id=self.user.id))
        self.resets.create_or_replace.assert_awaited_once()
        self.sender.send_password_reset.assert_awaited_once_with(recipient_email=self.user.email, token='raw-token')
        self.assertEqual(self.events, ['send', 'commit'])

    async def test_smtp_failure_rolls_back_account_and_membership(self):
        self.sender.send_account_invitation.side_effect = smtplib.SMTPException('unavailable')
        self.service.organization_repository.get_by_id = AsyncMock(return_value=object())
        with self.assertRaises(namespace['EmailDeliveryError']):
            await self.service.create_user(SimpleNamespace(email=self.user.email, organization_id=uuid.uuid4(), role='admin'))
        self.repo.create_membership.assert_awaited_once()
        self.db.commit.assert_not_awaited()
        self.db.rollback.assert_awaited_once()

    async def test_resend_smtp_failure_rolls_back_token_replacement(self):
        self.sender.send_account_invitation.side_effect = OSError('unavailable')
        with self.assertRaises(namespace['EmailDeliveryError']):
            await self.service.resend_verification_email(user_id=self.user.id)
        self.invitations.replace_for_user.assert_awaited_once()
        self.db.commit.assert_not_awaited()
        self.db.rollback.assert_awaited_once()

    async def test_reset_smtp_failure_rolls_back_token_replacement(self):
        self.user.is_verified = True
        self.sender.send_password_reset.side_effect = smtplib.SMTPException('unavailable')
        with self.assertRaises(namespace['EmailDeliveryError']):
            await self.service.send_password_reset_email(user_id=self.user.id)
        self.db.commit.assert_not_awaited()
        self.db.rollback.assert_awaited_once()

    async def test_commit_failure_after_send_is_propagated(self):
        self.db.commit.side_effect = RuntimeError('database unavailable')
        with self.assertRaises(RuntimeError):
            await self.service.resend_verification_email(user_id=self.user.id)
        self.sender.send_account_invitation.assert_awaited_once()
        self.db.rollback.assert_awaited_once()

    async def test_verified_user_cannot_receive_activation(self):
        self.user.is_verified = True
        with self.assertRaises(namespace['UserAlreadyVerifiedError']):
            await self.service.resend_verification_email(user_id=self.user.id)
        self.sender.send_account_invitation.assert_not_awaited()


if __name__ == '__main__':
    unittest.main()

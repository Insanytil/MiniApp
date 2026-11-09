import unittest
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from pydantic import ValidationError
from app.modules.organization_administration.schemas import UpdateOrganizationUserProfileRequest
from app.modules.organization_administration.service import OrganizationUserService
from app.modules.platform_administration.exceptions import OrganizationMembershipNotFoundError
from app.modules.entity_records.repository import EntityRecordRepository
from app.modules.entity_records.service import EntityRecordService
from app.modules.entity_records.presentation import record_values, project_rows
from app.modules.entity_types.configuration_rules import system_fields
from app.models.organization_role import OrganizationRole


class ProfileTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.org, self.actor = uuid.uuid4(), uuid.uuid4()
        self.user = SimpleNamespace(id=self.actor, email='alice@example.com', is_active=True, is_verified=True,
                                    created_at=datetime.now(timezone.utc))
        self.membership = SimpleNamespace(first_name='', last_name='', is_active=False, role=OrganizationRole.USER)
        self.repo = SimpleNamespace(get_member=AsyncMock(return_value=(self.user, self.membership)))
        self.db = SimpleNamespace(commit=AsyncMock())
        self.service = OrganizationUserService(db=self.db, repository=self.repo, user_creation=None, job_service=None)

    async def test_update_changes_only_scoped_profile_and_can_clear_names(self):
        payload = UpdateOrganizationUserProfileRequest(first_name=' Alice ', last_name=' Dupont ')
        result = await self.service.update_profile(organization_id=self.org, user_id=self.actor, payload=payload)
        self.repo.get_member.assert_awaited_once_with(organization_id=self.org, user_id=self.actor, for_update=True)
        self.assertEqual(result.display_name, 'Alice Dupont')
        self.assertFalse(self.membership.is_active)
        self.assertEqual(self.user.email, 'alice@example.com')
        result = await self.service.update_profile(organization_id=self.org, user_id=self.actor,
            payload=UpdateOrganizationUserProfileRequest(first_name=' ', last_name=''))
        self.assertEqual(result.display_name, self.user.email)

    async def test_missing_membership_does_not_write(self):
        self.repo.get_member.return_value = None
        with self.assertRaises(OrganizationMembershipNotFoundError):
            await self.service.update_profile(organization_id=self.org, user_id=self.actor,
                payload=UpdateOrganizationUserProfileRequest(first_name='Alice', last_name=''))
        self.db.commit.assert_not_awaited()

    def test_profile_validation_rejects_extra_fields_and_control_characters(self):
        for extra in ({'first_name': 'x' * 101}, {'last_name': 'a\x00b'}, {'organization_id': str(self.org)}):
            with self.subTest(extra=extra), self.assertRaises(ValidationError):
                UpdateOrganizationUserProfileRequest(**({'first_name': '', 'last_name': ''} | extra))

    async def test_actor_names_use_scoped_membership_and_fallback_email(self):
        other = uuid.uuid4()
        rows = [(self.actor, self.user.email, 'Alice', 'Dupont'), (other, 'other@example.com', None, None)]
        db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(all=lambda: rows)))
        labels = await EntityRecordRepository(db).actor_labels(self.org, {self.actor, other})
        self.assertEqual(labels[str(self.actor)], 'Alice Dupont')
        self.assertEqual(labels[str(other)], 'other@example.com')
        query = db.execute.await_args.args[0]
        self.assertIn('LEFT OUTER JOIN', str(query))
        self.assertIn('organization_memberships.organization_id =', str(query))
        self.assertIn(self.org, query.compile().params.values())


class RecordAuditTests(unittest.IsolatedAsyncioTestCase):
    async def test_detail_places_system_fields_last_and_keeps_raw_actor_id(self):
        org, type_id, actor = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        config = {'fields': [{'id': 'custom', 'name': 'Titre', 'kind': 'text'}]}
        entity = SimpleNamespace(id=type_id, name='Fiche', configuration=config)
        record = SimpleNamespace(id=uuid.uuid4(), entity_type_id=type_id, values={'custom': 'Titre'},
            created_by=actor, updated_by=actor, created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc))
        repo = SimpleNamespace(catalog=AsyncMock(return_value=[entity]), get_record=AsyncMock(return_value=record),
            actor_labels=AsyncMock(return_value={str(actor): 'Alice Dupont'}))
        result = await EntityRecordService(repo).detail(org, type_id, record.id)
        fields = result['fields']
        self.assertEqual(fields[0]['id'], 'custom')
        self.assertTrue(all(field['system'] for field in fields[1:]))
        self.assertEqual([field['technical_name'] for field in fields[1:]],
                         ['id', 'created_at', 'updated_at', 'created_by', 'updated_by'])
        for field in fields[-2:]:
            self.assertEqual(field['value'], str(actor))
            self.assertEqual(field['display_value'], 'Alice Dupont')
        repo.actor_labels.assert_awaited_once_with(org, {actor})

    def test_table_and_presentation_use_labels_without_mutating_record(self):
        actor, type_id = uuid.uuid4(), uuid.uuid4()
        record = SimpleNamespace(id=uuid.uuid4(), entity_type_id=type_id, values={}, created_by=actor,
            updated_by=None, created_at=None, updated_at=None)
        field = next(field for field in system_fields(type_id) if field['technical_name'] == 'created_by')
        entity = SimpleNamespace(id=type_id, configuration={'fields': []})
        view = {'columns': [{'id': 'author', 'kind': 'field', 'field_id': field['id']}]}
        rows = project_rows([record], entity, view, {}, {}, {}, {}, {str(actor): 'alice@example.com'})
        self.assertEqual(rows[0]['cells']['author']['text'], 'alice@example.com')
        self.assertEqual(record_values(record)[field['id']], str(actor))
        self.assertEqual(record_values(record, {})[field['id']], 'Utilisateur indisponible')


if __name__ == '__main__':
    unittest.main()

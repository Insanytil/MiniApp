"""Menu integrity, default-view projections and organization-scoped read services."""
import ast
import copy
import re
import runpy
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, MagicMock
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
menu = runpy.run_path(str(ROOT / 'app/modules/organization_navigation/rules.py'))
metadata = runpy.run_path(str(ROOT / 'app/modules/entity_types/configuration_rules.py'))


def load_definitions(path, namespace):
    nodes = [node for node in ast.parse(path.read_text()).body if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))]
    exec(compile('from __future__ import annotations\n' + '\n'.join(ast.unparse(node) for node in nodes), str(path), 'exec'), namespace)
    return namespace


presentation = load_definitions(ROOT / 'app/modules/entity_records/presentation.py', {
    're': re, 'urlsplit': urlsplit, 'system_fields': metadata['system_fields'],
})


class NotFound(Exception):
    pass


services = load_definitions(ROOT / 'app/modules/entity_records/service.py', {
    **presentation, **metadata, 'EntityTypeNotFoundError': NotFound,
})
nav_services = load_definitions(ROOT / 'app/modules/organization_navigation/service.py', {
    **menu, 'select': MagicMock(), 'Organization': SimpleNamespace(id=Mock()),
    'EntityType': SimpleNamespace(id=Mock(), name=Mock(), technical_name=Mock(), organization_id=Mock()),
})


def identity():
    return str(uuid.uuid4())


def category(children=None, label='Gestion'):
    return {'id': identity(), 'kind': 'category', 'label': label, 'children': children or []}


def link(type_id, label=None):
    return {'id': identity(), 'kind': 'entity', 'entity_type_id': type_id, 'label': label}


class NavigationTests(unittest.TestCase):
    def test_menu_icons_round_trip_for_categories_and_entities_and_old_menus_still_load(self):
        from app.modules.organization_navigation.schemas import MenuDocument
        target = identity()
        nodes = [category([{**link(target), 'icon': 'receipt'}, link(target)])]
        nodes[0]['icon'] = 'briefcase-business'
        document = MenuDocument.model_validate({'schema_version': 1, 'nodes': nodes}).model_dump(mode='json')
        self.assertEqual(document['nodes'][0]['icon'], 'briefcase-business')
        self.assertEqual(document['nodes'][0]['children'][0]['icon'], 'receipt')
        self.assertIsNone(document['nodes'][0]['children'][1]['icon'])
        resolved = menu['resolve_navigation'](document['nodes'], {target: 'Facture'})
        self.assertEqual(resolved[0]['children'][0]['icon'], 'receipt')

    def test_unsupported_menu_icons_are_rejected(self):
        from pydantic import ValidationError
        from app.modules.organization_navigation.schemas import MenuDocument
        for node in [{**category(), 'icon': 'unsupported'}, {**link(identity()), 'icon': '<svg/>'}]:
            with self.assertRaises(ValidationError):
                MenuDocument.model_validate({'schema_version': 1, 'nodes': [node]})

    def test_nested_mixed_menu_accepts_categories_and_entity_links(self):
        person, vehicle = identity(), identity()
        nodes = [category([link(person), category([link(vehicle)])]), link(vehicle)]
        menu['validate_navigation'](nodes, {person, vehicle})
        self.assertEqual(menu['referenced_types'](nodes), {person, vehicle})

    def test_categories_without_children_are_valid(self):
        menu['validate_navigation']([category()], set())

    def test_outside_organization_or_deleted_type_is_rejected(self):
        with self.assertRaises(menu['NavigationError']):
            menu['validate_navigation']([link(identity())], set())

    def test_duplicate_node_id_is_rejected_but_duplicate_target_is_allowed(self):
        target = identity()
        item = link(target)
        with self.assertRaises(menu['NavigationError']):
            menu['validate_navigation']([item, copy.deepcopy(item)], {target})
        menu['validate_navigation']([link(target), link(target)], {target})

    def test_depth_and_total_budget_are_checked(self):
        node = category()
        for _ in range(7): node = category([node])
        menu['validate_navigation']([node], set())
        with self.assertRaises(menu['NavigationError']): menu['validate_navigation']([category([node])], set())
        with self.assertRaises(menu['NavigationError']): menu['validate_navigation']([category() for _ in range(201)], set())

    def test_labels_follow_type_renames_unless_overridden(self):
        target = identity()
        nodes = [category([link(target), link(target, 'Contacts')])]
        resolved = menu['resolve_navigation'](nodes, {target: 'Personnes renommées'})
        self.assertEqual([node['label'] for node in resolved[0]['children']], ['Personnes renommées', 'Contacts'])
        self.assertIsNone(nodes[0]['children'][0]['label'])

    def test_missing_links_are_not_rendered_as_broken_sidebar_entries(self):
        self.assertEqual(menu['resolve_navigation']([link(identity())], {}), [])



class NavigationServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.org_id, self.actor, self.type_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        self.org = SimpleNamespace(navigation={'schema_version': 1, 'nodes': []}, navigation_version=1)
        self.db = SimpleNamespace(scalar=AsyncMock(return_value=self.org), commit=AsyncMock(),
            scalars=AsyncMock(return_value=SimpleNamespace(all=lambda: [self.type_id])),
            execute=AsyncMock(return_value=SimpleNamespace(all=lambda: [SimpleNamespace(id=self.type_id, name='Personne', technical_name='person')])))
        self.service = nav_services['OrganizationNavigationService'](self.db)

    async def test_save_checks_version_before_writing(self):
        with self.assertRaises(menu['NavigationConflictError']):
            await self.service.save_menu(self.org_id, self.actor, SimpleNamespace(expected_version=2))
        self.db.commit.assert_not_awaited()

    async def test_menu_read_ignores_unsupported_nodes_without_changing_stored_navigation(self):
        obsolete = {'id': identity(), 'kind': 'unsupported', 'label': 'Obsolete'}
        valid = link(str(self.type_id))
        self.org.navigation = {'schema_version': 1, 'nodes': [category([obsolete, valid]), obsolete]}
        original = copy.deepcopy(self.org.navigation)
        result = await self.service.get_menu(self.org_id)
        self.assertEqual(result['document']['nodes'][0]['children'], [valid])
        self.assertEqual(len(result['document']['nodes']), 1)
        self.assertEqual(self.org.navigation, original)
        self.db.commit.assert_not_awaited()

    async def test_valid_menu_is_persisted_with_version_and_actor(self):
        document = {'schema_version': 1, 'nodes': [category([link(str(self.type_id))])]}
        result = await self.service.save_menu(self.org_id, self.actor,
            SimpleNamespace(expected_version=1, document=SimpleNamespace(model_dump=lambda **kw: document)))
        self.assertEqual(result['version'], 2)
        self.assertEqual(self.org.navigation_updated_by, self.actor)
        self.assertEqual(result['resolved_nodes'][0]['children'][0]['label'], 'Personne')
        self.db.commit.assert_awaited_once()

    async def test_invalid_target_never_commits(self):
        document = {'schema_version': 1, 'nodes': [link(identity())]}
        with self.assertRaises(menu['NavigationError']):
            await self.service.save_menu(self.org_id, self.actor,
                SimpleNamespace(expected_version=1, document=SimpleNamespace(model_dump=lambda **kw: document)))
        self.db.commit.assert_not_awaited()
        self.assertEqual(self.org.navigation_version, 1)


class RecordProjectionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.person_id, self.vehicle_id, self.org_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        self.first, self.last, self.photo, self.plate, self.rel = [identity() for _ in range(5)]
        self.profile_id, self.column_id = identity(), identity()
        self.person = SimpleNamespace(id=self.person_id, name='Personne', technical_name='person', configuration=metadata['empty_configuration']())
        self.vehicle = SimpleNamespace(id=self.vehicle_id, name='Véhicule', technical_name='vehicle', configuration=metadata['empty_configuration']())
        self.person.configuration['fields'] = [{'id': self.first, 'name': 'Prénom', 'kind': 'text'}, {'id': self.last, 'name': 'Nom', 'kind': 'text'}, {'id': self.photo, 'name': 'Photo', 'kind': 'image'}]
        self.person.configuration['display_profiles'] = [{'id': self.profile_id, 'is_default': True, 'title_fields': [self.first, self.last], 'secondary_fields': [], 'separator': ' ', 'image_field': self.photo}]
        self.vehicle.configuration['fields'] = [{'id': self.plate, 'name': 'Immatriculation', 'kind': 'text'}]
        self.vehicle.configuration['relations'] = [{'id': self.rel, 'name': 'Assigné à', 'inverse_name': 'Véhicules', 'target_type_ids': [str(self.person_id)], 'source_max': 1, 'target_max': None}]
        self.column = {'id': self.column_id, 'label': 'Appartient à', 'kind': 'relation', 'relation_id': self.rel,
                       'direction': 'outgoing', 'profile_id': self.profile_id, 'collection_display': 'list'}
        self.vehicle.configuration['views'] = [{'id': identity(), 'name': 'Autre vue', 'is_default': False, 'columns': []},
            {'id': identity(), 'name': 'Parc automobile', 'is_default': True, 'columns': [self.column]}]
        now = datetime.now(timezone.utc)
        def record(type_id, values):
            return SimpleNamespace(id=uuid.uuid4(), entity_type_id=type_id, values=values,
                created_at=now, updated_at=now, created_by=None, updated_by=None)
        self.person_record = record(self.person_id, {self.first: 'Lucien', self.last: 'Vervaeren', self.photo: 'https://example.com/photo.png'})
        self.vehicle_record = record(self.vehicle_id, {self.plate: '1-ABC-123'})
        self.groups = {(str(self.vehicle_record.id), self.rel, 'outgoing'): {'ids': [str(self.person_record.id)], 'total': 1}}
        self.repo = SimpleNamespace(catalog=AsyncMock(return_value=[self.person, self.vehicle]),
            list_records=AsyncMock(return_value=([self.vehicle_record], 1)),
            related_groups=AsyncMock(return_value=(self.groups, {str(self.person_record.id): self.person_record})),
            get_record=AsyncMock(return_value=self.vehicle_record))
        self.service = services['EntityRecordService'](self.repo)
        self.params = SimpleNamespace(page=1, page_size=20)

    async def test_default_view_renders_combined_name_and_photo_in_one_cell(self):
        result = await self.service.list_records(self.org_id, self.vehicle_id, self.params)
        self.assertEqual(result['view']['name'], 'Parc automobile')
        cell = result['items'][0]['cells'][self.column_id]
        self.assertEqual(cell['items'][0]['title'], 'Lucien Vervaeren')
        self.assertEqual(cell['items'][0]['image'], 'https://example.com/photo.png')
        self.repo.list_records.assert_awaited_once_with(self.org_id, self.vehicle_id, self.params)
        self.assertEqual(self.repo.related_groups.await_args.args[0], self.org_id)
        self.assertNotIn('values', result['items'][0])

    async def test_no_configured_view_falls_back_to_custom_fields(self):
        self.vehicle.configuration['views'] = []
        result = await self.service.list_records(self.org_id, self.vehicle_id, self.params)
        self.assertEqual(result['view']['columns'], [{'id': self.plate, 'label': 'Immatriculation'}])
        self.assertEqual(result['items'][0]['cells'][self.plate]['text'], '1-ABC-123')

    async def test_empty_type_falls_back_to_system_identifier(self):
        self.vehicle.configuration['fields'] = []
        self.vehicle.configuration['views'] = []
        result = await self.service.list_records(self.org_id, self.vehicle_id, self.params)
        self.assertEqual(result['view']['columns'][0]['label'], 'id')

    async def test_type_outside_organization_returns_not_found_before_fetching_records(self):
        with self.assertRaises(NotFound): await self.service.list_records(self.org_id, uuid.uuid4(), self.params)
        self.repo.list_records.assert_not_awaited()

    async def test_record_detail_is_scoped_and_only_defined_fields_are_exposed(self):
        self.vehicle_record.values['unknown-key'] = 'private extra value'
        result = await self.service.detail(self.org_id, self.vehicle_id, self.vehicle_record.id)
        self.repo.get_record.assert_awaited_once_with(self.org_id, self.vehicle_id, self.vehicle_record.id)
        self.assertNotIn('unknown-key', [field['id'] for field in result['fields']])

    async def test_missing_record_does_not_return_other_data(self):
        self.repo.get_record.return_value = None
        with self.assertRaises(services['EntityRecordNotFoundError']):
            await self.service.detail(self.org_id, self.vehicle_id, uuid.uuid4())

    async def test_count_and_first_item_use_real_totals_without_loading_full_collection(self):
        self.column['collection_display'] = 'first'
        self.groups[(str(self.vehicle_record.id), self.rel, 'outgoing')]['total'] = 10000
        result = await self.service.list_records(self.org_id, self.vehicle_id, self.params)
        cell = result['items'][0]['cells'][self.column_id]
        self.assertEqual(cell['total'], 10000)
        self.assertEqual(len(cell['items']), 1)
        self.column['kind'] = 'count'
        result = await self.service.list_records(self.org_id, self.vehicle_id, self.params)
        self.assertEqual(result['items'][0]['cells'][self.column_id], {'kind': 'count', 'total': 10000})

    def test_system_values_cannot_be_spoofed_by_json(self):
        id_field = metadata['system_fields'](self.vehicle_id)[0]['id']
        self.vehicle_record.values[id_field] = 'spoofed'
        self.assertEqual(presentation['record_values'](self.vehicle_record)[id_field], str(self.vehicle_record.id))

    def test_unsafe_or_malformed_images_are_not_projected(self):
        for value in ('javascript:alert(1)', '//other/image', 'https://[invalid', '/\n/other/image', 'https://user:password@example.com/image'):
            self.assertIsNone(presentation['safe_image'](value))


if __name__ == '__main__':
    unittest.main()
